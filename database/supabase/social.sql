-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — CenFriend social layer
-- Run AFTER schema.sql, features.sql and creator.sql. Safe to re-run.
--
-- What this file adds
-- -------------------
-- CenFriend turns the existing `posts` / `comments` community tables into a
-- full social graph: follow, likes, saves, blocks, reports and notifications.
-- Nothing here creates a second identity — every table hangs off
-- `auth.users (id)`, which is the same id `profiles` already uses. A farmer,
-- buyer, retailer, worker, transporter, equipment owner, warehouse owner and
-- content creator are all the same row, distinguished only by
-- `profiles.role`.
--
-- Why a unified `follows` table
-- -----------------------------
-- A private account needs a pending row before anything is approved. Storing
-- the request in the SAME row as the accepted edge means "become friends" is
-- one UPDATE, there is exactly one unique key to enforce, and no two-table
-- invariant can drift. `status` is the only thing that changes.
--
-- Why counters are columns
-- ------------------------
-- A 1-crore-user feed cannot COUNT(*) the follower table on every render. The
-- counters below are maintained by triggers in the same transaction as the
-- write, so a read never sees a stale number.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Post columns the social feed needs ─────────────────────────────────
-- Additive only: the existing CenFriend screen keeps working untouched.

alter table public.posts add column if not exists media_urls    text[] not null default '{}'::text[];
alter table public.posts add column if not exists video_url     text;
alter table public.posts add column if not exists post_kind     text not null default 'text';
alter table public.posts add column if not exists visibility    text not null default 'public';
alter table public.posts add column if not exists hashtags      text[] not null default '{}'::text[];
alter table public.posts add column if not exists mentions      uuid[] not null default '{}'::uuid[];
alter table public.posts add column if not exists location_name text;
alter table public.posts add column if not exists is_draft      boolean not null default false;
alter table public.posts add column if not exists is_deleted    boolean not null default false;
alter table public.posts add column if not exists edited_at     timestamptz;
alter table public.posts add column if not exists like_count    integer not null default 0;
alter table public.posts add column if not exists share_count   integer not null default 0;

-- Constraints are added separately so re-running the file is safe and an
-- existing project that already holds rows is validated once.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_post_kind_chk') then
    alter table public.posts add constraint posts_post_kind_chk
      check (post_kind in ('text','image','gallery','video','short'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_visibility_chk') then
    alter table public.posts add constraint posts_visibility_chk
      check (visibility in ('public','followers','private'));
  end if;
end $$;

-- Feed reads are "published, newest first" and "one author's grid".
create index if not exists posts_feed_idx   on public.posts (created_at desc)
  where is_deleted = false and is_draft = false and visibility <> 'private';
create index if not exists posts_author_idx on public.posts (author_id, created_at desc) where is_deleted = false;
create index if not exists posts_kind_idx   on public.posts (post_kind, created_at desc) where is_deleted = false;
-- Hashtag lookup: GIN over the array, so #paddy is an index hit, not a scan.
create index if not exists posts_hashtags_idx on public.posts using gin (hashtags);

-- Backfill the legacy image_url column into the new array so old posts keep
-- showing their photo in the new feed.
update public.posts
   set media_urls = array[image_url]
 where image_url is not null
   and cardinality(media_urls) = 0;

-- Keep the two ways of storing a photo in sync for rows written AFTER this
-- migration. The original CenFriend screen (and any older client) only knows
-- `image_url`; without this, a post made there would show text-only in the new
-- feed. Filling a column from another in the same row needs a BEFORE trigger:
-- in an AFTER trigger the NEW value is already written, and a nested UPDATE of
-- the same row is not allowed to fix it up.
create or replace function public.sync_legacy_image_url()
returns trigger language plpgsql as $$
begin
  if new.image_url is not null and cardinality(new.media_urls) = 0 then
    new.media_urls := array[new.image_url];
  elsif cardinality(new.media_urls) > 0 and new.image_url is null then
    new.image_url := new.media_urls[1];
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_legacy_image_url on public.posts;
create trigger trg_sync_legacy_image_url
  before insert or update of image_url, media_urls on public.posts
  for each row execute function public.sync_legacy_image_url();

-- ── 2. Comment columns ─────────────────────────────────────────────────────

alter table public.comments add column if not exists parent_id  uuid references public.comments (id) on delete cascade;
alter table public.comments add column if not exists like_count integer not null default 0;
alter table public.comments add column if not exists is_deleted boolean not null default false;
alter table public.comments add column if not exists edited_at  timestamptz;

create index if not exists comments_parent_idx on public.comments (parent_id, created_at);

-- ── 3. Privacy & profile fields ────────────────────────────────────────────
-- `is_private` switches the account between public and follow-approval. It is
-- a profile attribute, NOT a new account type: every role keeps its own role.

alter table public.profiles add column if not exists username         text;
alter table public.profiles add column if not exists bio              text;
alter table public.profiles add column if not exists cover_url        text;
alter table public.profiles add column if not exists is_private       boolean not null default false;
alter table public.profiles add column if not exists follower_count   integer not null default 0;
alter table public.profiles add column if not exists following_count  integer not null default 0;
alter table public.profiles add column if not exists post_count       integer not null default 0;
alter table public.profiles add column if not exists allow_messages   boolean not null default true;

-- Usernames are optional (a phone-only farmer may never pick one) but unique
-- when set. Lower-case only, so "@Ram" and "@ram" cannot both exist.
alter table public.profiles drop constraint if exists profiles_username_fmt;
alter table public.profiles add constraint profiles_username_fmt
  check (username is null or username ~ '^[a-z0-9_]{3,30}$');

create unique index if not exists profiles_username_uidx on public.profiles (username)
  where username is not null;
create index if not exists profiles_private_idx on public.profiles (is_private);

-- ── 4. Follows (unified follow + request) ──────────────────────────────────
-- One row per relationship, in one direction. UNIQUE(follower, following)
-- makes a duplicate follow impossible at the database level even if two
-- requests race; the backend turns that unique violation into "already
-- following" rather than a 500.

create table if not exists public.follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'accepted' check (status in ('pending','accepted')),
  -- Denormalised so we never join to profiles to draw a notification.
  follower_name text,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (follower_id, following_id),
  -- Self-follow is impossible by construction.
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id, status, created_at desc);
create index if not exists follows_follower_idx  on public.follows (follower_id, status, created_at desc);
-- The "who do I follow" feed join only ever wants accepted edges.
create index if not exists follows_accepted_idx on public.follows (follower_id, following_id)
  where status = 'accepted';

-- ── 5. Likes ───────────────────────────────────────────────────────────────

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A user can like a post exactly once. The primary key IS the rule.
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id, created_at desc);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ── 6. Saves ───────────────────────────────────────────────────────────────

create table if not exists public.saved_posts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saved_posts_recent_idx on public.saved_posts (user_id, created_at desc);

-- ── 7. Blocks & mutes ──────────────────────────────────────────────────────

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);
-- Blocking is checked in both directions on every read, so index the reverse.
create index if not exists user_blocks_reverse_idx on public.user_blocks (blocked_id, blocker_id);

create table if not exists public.user_mutes (
  muter_id uuid not null references auth.users (id) on delete cascade,
  muted_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  constraint user_mutes_no_self check (muter_id <> muted_id)
);

-- ── 8. Content reports (moderation queue) ──────────────────────────────────

create table if not exists public.content_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users (id) on delete cascade,
  target_kind  text not null check (target_kind in ('post','comment','user')),
  target_id    uuid not null,
  reason       text not null check (reason in
                 ('spam','harassment','misinformation','hate','nudity','violence','other')),
  note         text check (note is null or char_length(note) <= 500),
  status       text not null default 'open'
                 check (status in ('open','reviewing','actioned','dismissed')),
  reviewed_by  uuid references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- One report per person per item; re-reporting is a no-op, not a flood.
  unique (reporter_id, target_kind, target_id)
);
create index if not exists content_reports_queue_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_target_idx on public.content_reports (target_kind, target_id);

-- ── 9. Notifications ───────────────────────────────────────────────────────
-- Reuses the shape of creator_notifications (kind/title/body/link/read_at) so
-- the UI can render both with one component, but keeps social event kinds
-- separate so a creator's publish events never pollute the social bell.

create table if not exists public.social_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete cascade,
  kind        text not null check (kind in
                ('follow','follow_request','follow_accepted','like','comment',
                 'reply','mention','share','system')),
  title       text not null,
  body        text,
  link        text,
  -- Nulls the two ids that identify the event, so one action cannot notify
  -- twice: liking and un-liking and liking again only ever creates one row.
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists social_notifications_idx
  on public.social_notifications (user_id, read_at, created_at desc);
create unique index if not exists social_notifications_dedupe_uidx
  on public.social_notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ── 10. Helper: am I blocked by / blocking this user? ──────────────────────
-- SECURITY DEFINER so the check itself can read user_blocks even when the RLS
-- policy on that table would hide the other side of the pair.

create or replace function public.social_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
     where (blocker_id = p_a and blocked_id = p_b)
        or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Am I allowed to see this author's content?
--   • my own content always
--   • public accounts always
--   • private accounts only when I have an accepted follow
--   • never when either side has blocked the other
create or replace function public.social_can_view_author(p_viewer uuid, p_author uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    p_viewer is not null
    and not public.social_blocked_between(p_viewer, p_author)
    and (
      p_viewer = p_author
      or coalesce((select is_private from public.profiles where id = p_author), false) = false
      or exists (
        select 1 from public.follows
         where follower_id = p_viewer and following_id = p_author and status = 'accepted'
      )
    );
$$;

-- ── 11. Counter triggers ───────────────────────────────────────────────────
-- Counters live on profiles/posts and are written in the same transaction as
-- the event, so the feed never runs an aggregate.

-- NOTE ON TABLE NAMES
-- The Creator Studio (creator.sql) uses `creator_comments` and
-- `creator_comment_likes` for likes on VIDEOS. CenFriend's `comment_likes`
-- belongs to "comments" on a SOCIAL POST. `creator.sql` used to create a table
-- called `comment_likes` too, so whichever file ran first decided which
-- foreign key you got — and the wrong winner silently breaks the other
-- feature. Renaming keeps the two separate. The old definition is repaired
-- further down.

create or replace function public.sync_follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'accepted' then
      update public.profiles set follower_count  = follower_count + 1 where id = new.following_id;
      update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    end if;
  elsif tg_op = 'UPDATE' then
    -- pending → accepted (a request was approved)
    if old.status = 'pending' and new.status = 'accepted' then
      update public.profiles set follower_count  = follower_count + 1 where id = new.following_id;
      update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    elsif old.status = 'accepted' and new.status <> 'accepted' then
      update public.profiles set follower_count  = greatest(0, follower_count - 1)  where id = old.following_id;
      update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'accepted' then
      update public.profiles set follower_count  = greatest(0, follower_count - 1)  where id = old.following_id;
      update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    end if;
  end if;
  return null;
end; $$;

drop trigger if exists trg_sync_follow_counts on public.follows;
create trigger trg_sync_follow_counts after insert or update or delete on public.follows
  for each row execute function public.sync_follow_counts();

create or replace function public.sync_post_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_sync_post_like_count on public.post_likes;
create trigger trg_sync_post_like_count after insert or delete on public.post_likes
  for each row execute function public.sync_post_like_count();

-- Comment counts are NOT denormalised: `comments` has a covering index on
-- (post_id, created_at) so the count is a cheap index-only scan, and a counter
-- column that could drift would be worse than the read it would save.

create or replace function public.sync_comment_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.comments set like_count = greatest(0, like_count - 1) where id = old.comment_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_sync_comment_like_count on public.comment_likes;
create trigger trg_sync_comment_like_count after insert or delete on public.comment_likes
  for each row execute function public.sync_comment_like_count();

create or replace function public.sync_profile_post_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not new.is_draft and not new.is_deleted then
      update public.profiles set post_count = post_count + 1 where id = new.author_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.is_draft and not new.is_draft and not new.is_deleted then
      update public.profiles set post_count = post_count + 1 where id = new.author_id;
    elsif not old.is_draft and (new.is_deleted or new.is_draft) then
      update public.profiles set post_count = greatest(0, post_count - 1) where id = new.author_id;
    end if;
  elsif tg_op = 'DELETE' then
    if not old.is_draft and not old.is_deleted then
      update public.profiles set post_count = greatest(0, post_count - 1) where id = old.author_id;
    end if;
  end if;
  return null;
end; $$;

drop trigger if exists trg_sync_profile_post_count on public.posts;
create trigger trg_sync_profile_post_count after insert or update or delete on public.posts
  for each row execute function public.sync_profile_post_count();

-- ── 12. Notification emission ──────────────────────────────────────────────
-- Written in SQL, not in the API, so a notification exists no matter which
-- client performed the write (web, future mobile app, admin tooling).

create or replace function public.notify_social(
  p_user uuid, p_actor uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Never notify yourself, and never notify across a block.
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and public.social_blocked_between(p_user, p_actor) then return; end if;

  insert into public.social_notifications (user_id, actor_id, kind, title, body, link, dedupe_key)
  values (p_user, p_actor, p_kind, p_title, p_body, p_link, p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end; $$;

create or replace function public.on_follow_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select coalesce(full_name, 'Someone') into v_name from public.profiles where id = new.follower_id;

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify_social(new.following_id, new.follower_id, 'follow_request',
        v_name || ' wants to follow you', 'Open your requests to approve or decline.',
        '/cenfriend/requests', 'followreq:' || new.follower_id);
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform public.notify_social(new.follower_id, new.following_id, 'follow_accepted',
      v_name || ' accepted your follow request', NULL,
      '/cenfriend/u/' || new.following_id, 'followacc:' || new.following_id);
  end if;
  return null;
end; $$;

drop trigger if exists trg_follow_notify on public.follows;
create trigger trg_follow_notify after insert or update of status on public.follows
  for each row execute function public.on_follow_notify();

create or replace function public.on_post_like_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_name text;
begin
  if tg_op <> 'INSERT' then return null; end if;
  select author_id into v_author from public.posts where id = new.post_id;
  select coalesce(full_name, 'Someone') into v_name from public.profiles where id = new.user_id;
  perform public.notify_social(v_author, new.user_id, 'like',
    v_name || ' liked your post', NULL, '/cenfriend/post/' || new.post_id,
    'like:' || new.post_id || ':' || new.user_id);
  return null;
end; $$;

drop trigger if exists trg_post_like_notify on public.post_likes;
create trigger trg_post_like_notify after insert on public.post_likes
  for each row execute function public.on_post_like_notify();

create or replace function public.on_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_parent_author uuid;
  v_name text;
begin
  if tg_op <> 'INSERT' then return null; end if;
  select author_id into v_author from public.posts where id = new.post_id;
  select coalesce(full_name, 'Someone') into v_name from public.profiles where id = new.author_id;

  if new.parent_id is not null then
    select author_id into v_parent_author from public.comments where id = new.parent_id;
    perform public.notify_social(v_parent_author, new.author_id, 'reply',
      v_name || ' replied to your comment', left(new.body, 120),
      '/cenfriend/post/' || new.post_id, 'reply:' || new.id);
  end if;
  perform public.notify_social(v_author, new.author_id, 'comment',
    v_name || ' commented on your post', left(new.body, 120),
    '/cenfriend/post/' || new.post_id, 'comment:' || new.id);

  -- Mentions on the post row.
  insert into public.social_notifications (user_id, actor_id, kind, title, body, link, dedupe_key)
  select m, new.author_id, 'mention', v_name || ' mentioned you', left(new.body, 120),
         '/cenfriend/post/' || new.post_id, 'mention:' || new.id || ':' || m
    from public.posts p, unnest(p.mentions) as m
   where p.id = new.post_id and m <> new.author_id
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
end; $$;

drop trigger if exists trg_comment_notify on public.comments;
create trigger trg_comment_notify after insert on public.comments
  for each row execute function public.on_comment_notify();

-- ── 13. Block cascade ──────────────────────────────────────────────────────
-- Blocking drops the follow graph in BOTH directions. Keeping a follow edge
-- after a block would leak the relationship in the counts and let content
-- through a "followers only" filter.

create or replace function public.on_block_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and following_id = new.blocked_id)
      or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return null;
end; $$;

drop trigger if exists trg_block_cascade on public.user_blocks;
create trigger trg_block_cascade after insert on public.user_blocks
  for each row execute function public.on_block_created();

-- ── 14. Row Level Security ────────────────────────────────────────────────
-- Supabase policies are the second line of defence. The FastAPI router is the
-- first: it verifies the JWT and never trusts a user id from the body.

alter table public.follows              enable row level security;
alter table public.post_likes           enable row level security;
alter table public.comment_likes        enable row level security;
alter table public.saved_posts          enable row level security;
alter table public.user_blocks          enable row level security;
alter table public.user_mutes           enable row level security;
alter table public.content_reports      enable row level security;
alter table public.social_notifications enable row level security;

-- Follow edges are readable: the public counts/stats rely on it, and the
-- relationship itself is public information on a public account. Private
-- accounts are protected by the post policies below, not by hiding the edge.
drop policy if exists "Follows are readable" on public.follows;
create policy "Follows are readable" on public.follows for select using (auth.role() = 'authenticated');

-- You may only create a follow where YOU are the follower.
drop policy if exists "Users create their own follows" on public.follows;
create policy "Users create their own follows" on public.follows for insert
  with check (auth.uid() = follower_id and follower_id <> following_id);

-- You may accept a request addressed to you, or cancel/withdraw your own.
drop policy if exists "Users update follows they own" on public.follows;
create policy "Users update follows they own" on public.follows for update
  using (auth.uid() = following_id or auth.uid() = follower_id)
  with check (auth.uid() = following_id or auth.uid() = follower_id);

drop policy if exists "Users remove follows they own" on public.follows;
create policy "Users remove follows they own" on public.follows for delete
  using (auth.uid() = follower_id or auth.uid() = following_id);

-- ── Posts: the privacy switch lives here ──────────────────────────────────

drop policy if exists "Posts readable by signed-in users" on public.posts;
drop policy if exists "Social posts are readable by visibility" on public.posts;
create policy "Social posts are readable by visibility" on public.posts for select
  using (
    auth.uid() = author_id
    or (
      is_deleted = false
      and is_draft = false
      and public.social_can_view_author(auth.uid(), author_id)
      and (
        visibility = 'public'
        or (visibility = 'followers' and exists (
          select 1 from public.follows
           where follower_id = auth.uid() and following_id = author_id and status = 'accepted'
        ))
      )
    )
  );

-- Comments inherit the post's visibility, so a comment on a private post is
-- never readable by a stranger who guessed the comment id.
drop policy if exists "Comments readable by signed-in users" on public.comments;
drop policy if exists "Comments follow their post" on public.comments;
create policy "Comments follow their post" on public.comments for select
  using (
    auth.uid() = author_id
    or exists (
      select 1 from public.posts p
       where p.id = post_id
         and p.is_deleted = false
         and p.is_draft = false
         and public.social_can_view_author(auth.uid(), p.author_id)
         and (p.visibility = 'public'
              or (p.visibility = 'followers' and exists (
                    select 1 from public.follows f
                     where f.follower_id = auth.uid() and f.following_id = p.author_id and f.status = 'accepted')))
    )
  );

drop policy if exists "Like counts are readable" on public.post_likes;
create policy "Like counts are readable" on public.post_likes for select using (auth.role() = 'authenticated');

drop policy if exists "Users manage their own likes" on public.post_likes;
create policy "Users manage their own likes" on public.post_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Comment likes are readable" on public.comment_likes;
create policy "Comment likes are readable" on public.comment_likes for select using (auth.role() = 'authenticated');

drop policy if exists "Users manage their comment likes" on public.comment_likes;
create policy "Users manage their comment likes" on public.comment_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Saved posts are private to the saver. Nobody else can list them.
drop policy if exists "Users manage their saved posts" on public.saved_posts;
create policy "Users manage their saved posts" on public.saved_posts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A block is private: only the blocker sees the row they created.
drop policy if exists "Users manage their blocks" on public.user_blocks;
create policy "Users manage their blocks" on public.user_blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

drop policy if exists "Users manage their mutes" on public.user_mutes;
create policy "Users manage their mutes" on public.user_mutes for all
  using (auth.uid() = muter_id) with check (auth.uid() = muter_id);

-- Reporters see their own filings; the moderation queue is read with the
-- service role by the admin panel only.
drop policy if exists "Users file reports" on public.content_reports;
create policy "Users file reports" on public.content_reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Users see their own reports" on public.content_reports;
create policy "Users see their own reports" on public.content_reports for select
  using (auth.uid() = reporter_id);

drop policy if exists "Users read their notifications" on public.social_notifications;
create policy "Users read their notifications" on public.social_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users update their notifications" on public.social_notifications;
create policy "Users update their notifications" on public.social_notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 15. Feed helpers ───────────────────────────────────────────────────────
-- These run under Supabase's own policies when called from the browser, and
-- are the single definition of "what belongs in a feed".

-- Home feed: posts from accounts I follow (accepted), myself, mine-compatible
-- visibility, no blocks. Keyset pagination on (created_at, id) — stable even
-- when two posts share a timestamp, and far cheaper than OFFSET at scale.
create or replace function public.social_following_feed(
  p_before timestamptz default null,
  p_limit  integer default 20
) returns setof public.posts
language sql stable security definer set search_path = public as $$
  select p.*
    from public.posts p
   where p.is_deleted = false
     and p.is_draft = false
     and (p_before is null or p.created_at < p_before)
     and public.social_can_view_author(auth.uid(), p.author_id)
     and (p.visibility = 'public'
          or (p.visibility = 'followers' and exists (
                select 1 from public.follows f
                 where f.follower_id = auth.uid() and f.following_id = p.author_id and f.status = 'accepted')))
     and (
       p.author_id = auth.uid()
       or exists (select 1 from public.follows f
                   where f.follower_id = auth.uid() and f.following_id = p.author_id and f.status = 'accepted')
     )
     and not exists (select 1 from public.user_mutes m where m.muter_id = auth.uid() and m.muted_id = p.author_id)
   order by p.created_at desc, p.id desc
   limit least(greatest(p_limit, 1), 50);
$$;

-- Explore: everything public I'm allowed to see, newest first, optionally
-- narrowed by a search term over body/hashtags.
create or replace function public.social_explore(
  p_query  text default null,
  p_before timestamptz default null,
  p_limit  integer default 24
) returns setof public.posts
language sql stable security definer set search_path = public as $$
  select p.*
    from public.posts p
   where p.is_deleted = false
     and p.is_draft = false
     and p.visibility = 'public'
     and (p_before is null or p.created_at < p_before)
     and public.social_can_view_author(auth.uid(), p.author_id)
     and (
       p_query is null
       or p.body ilike '%' || p_query || '%'
       or exists (select 1 from unnest(p.hashtags) h where h ilike p_query)
     )
   order by p.created_at desc, p.id desc
   limit least(greatest(p_limit, 1), 50);
$$;

-- ── 16. Atomic share counter ─────────────────────────────────────────────
-- `share_count = share_count + 1` must happen inside the database: a
-- read-modify-write in Python loses increments when two people share at once.
create or replace function public.increment_share_count(p_post_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.posts set share_count = share_count + 1 where id = p_post_id;
$$;

grant execute on function public.increment_share_count(uuid) to authenticated;

-- ── 17. Feed ranking helper (Phase 3 seam) ───────────────────────────────
-- A one-line definition today; the client calls `/social/feed?mode=recommended`
-- and gets "public posts, most engaging first". Replacing this body with a
-- personalised score is a SQL change, not an API change.
create or replace function public.social_recommended_score(p_like_count integer, p_comment_count integer, p_created_at timestamptz)
returns double precision
language sql immutable as $$
  select (
    (coalesce(p_like_count, 0) + 2 * coalesce(p_comment_count, 0))::double precision
    + 1
  ) / power(
    greatest(1, extract(epoch from (now() - p_created_at)) / 3600.0) + 2,
    1.5
  );
$$;

-- ── 18. Repair the `comment_likes` collision (idempotent) ────────────────
-- Shape of the bug this fixes:
--
--   `creator.sql` creates `comment_likes` citing `video_comments`.
--   `social.sql` creates `comment_likes` citing `comments`.
--   Both use "create table if not exists", so the FIRST file to run wins and
--   the second silently gets the wrong foreign key. On a project where
--   creator.sql ran first, liking a CenFriend post comment failed with:
--     Key (comment_id)=(…) is not present in table "video_comments"
--
-- The fix is not to patch data but to give each feature its own table. The
-- detector below asks the catalogue which table the FK points at, so it does
-- the right thing whether or not this project has the collision.

do $$
declare
  fk_target text;
begin
  select ccu.table_name into fk_target
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
   where tc.table_schema = 'public'
     and tc.table_name = 'comment_likes'
     and tc.constraint_type = 'FOREIGN KEY'
     and ccu.column_name = 'id'
   limit 1;

  -- Only the broken direction needs repairing.
  if fk_target = 'video_comments' then

    -- 1. Move the video-comment likes (if any) to their own table.
    create table if not exists public.creator_comment_likes (
      user_id     uuid not null references auth.users (id) on delete cascade,
      comment_id  uuid not null references public.video_comments (id) on delete cascade,
      created_at  timestamptz not null default now(),
      primary key (user_id, comment_id)
    );

    insert into public.creator_comment_likes (user_id, comment_id, created_at)
    select user_id, comment_id, created_at from public.comment_likes
    on conflict (user_id, comment_id) do nothing;

    -- 2. Rebuild comment_likes against public.comments.
    drop table public.comment_likes;

    create table public.comment_likes (
      comment_id uuid not null references public.comments (id) on delete cascade,
      user_id    uuid not null references auth.users (id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (comment_id, user_id)
    );

    alter table public.comment_likes enable row level security;

    create policy "Comment likes are readable" on public.comment_likes
      for select using (auth.role() = 'authenticated');

    create policy "Users manage their comment likes" on public.comment_likes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

    raise notice 'Repaired comment_likes -> public.comments (video likes moved to creator_comment_likes).';
  end if;
end $$;

-- The like counter for a post comment belongs to CenFriend either way, so make
-- sure the trigger exists even on a repaired table.
drop trigger if exists trg_sync_comment_like_count on public.comment_likes;
create trigger trg_sync_comment_like_count after insert or delete on public.comment_likes
  for each row execute function public.sync_comment_like_count();
