-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Creator & Kisan Video Hub
-- Run AFTER schema.sql and features.sql. Safe to re-run.
--
-- A creator publishes farming videos (long-form + Shorts). Every other role
-- can watch, like, comment and subscribe. Media lives in Supabase Storage;
-- these tables hold metadata, counters and relationships only.
--
-- Design notes:
--   • `videos` carries denormalised counters (view_count, like_count …) so the
--     public feeds never have to aggregate on every request. The triggers at
--     the bottom keep them in sync with the event tables.
--   • `video_views` keeps raw events for analytics; the counter is a fast read.
--   • Nothing here seeds fake rows: every table starts empty.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Creator channel ────────────────────────────────────────────────────────
create table if not exists public.creator_profiles (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null unique references auth.users (id) on delete cascade,
  channel_name    text not null check (char_length(trim(channel_name)) between 2 and 80),
  handle          text unique check (handle is null or handle ~ '^[a-z0-9_]{3,30}$'),
  description     text,
  avatar_url      text,
  banner_url      text,
  -- Public location + expertise so farmers can judge whether advice applies.
  state           text,
  district        text,
  expertise       text[],          -- e.g. {Organic farming, Paddy, Poultry}
  languages       text[],          -- e.g. {Bengali, Hindi, English}
  website         text,
  is_verified     boolean not null default false,
  subscriber_count integer not null default 0,
  video_count      integer not null default 0,
  total_views      bigint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists creator_profiles_handle_idx on public.creator_profiles (handle);
create index if not exists creator_profiles_state_idx on public.creator_profiles (state, district);

drop trigger if exists trg_creator_profiles_updated_at on public.creator_profiles;
create trigger trg_creator_profiles_updated_at
  before update on public.creator_profiles
  for each row execute function public.touch_updated_at();

-- ── Video categories ───────────────────────────────────────────────────────
-- Fixed list from the brief. A table (not a check constraint) so the hub can
-- load labels/order without hardcoding them in the client.
create table if not exists public.video_categories (
  slug        text primary key,
  label       text not null,
  sort_order  integer not null default 0
);

insert into public.video_categories (slug, label, sort_order) values
  ('crop-farming',        'Crop Farming',             1),
  ('organic-farming',     'Organic Farming',          2),
  ('modern-agriculture',  'Modern Agriculture',       3),
  ('dairy-farming',       'Dairy Farming',            4),
  ('poultry-farming',     'Poultry Farming',          5),
  ('fish-farming',        'Fish Farming',             6),
  ('agriculture-machinery','Agriculture Machinery',   7),
  ('government-schemes',  'Government Schemes',       8),
  ('success-stories',     'Farming Success Stories',  9),
  ('crop-disease',        'Crop Disease Solutions',  10),
  ('farmer-education',    'Farmer Education',        11),
  ('mandi-prices',        'Mandi Price Updates',     12)
on conflict (slug) do update set label = excluded.label, sort_order = excluded.sort_order;

-- ── Videos (long-form + shorts) ────────────────────────────────────────────
create table if not exists public.videos (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.creator_profiles (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,

  title           text not null check (char_length(trim(title)) between 3 and 140),
  description     text,
  category        text references public.video_categories (slug) on delete set null,
  language        text,
  tags            text[],

  -- Agriculture context. Optional but searchable.
  crop_name       text,
  state           text,
  district        text,
  season          text check (season is null or season in ('Kharif','Rabi','Zaid','Year-round')),

  -- Media. Keys are Storage paths; URLs are public CDN links.
  kind            text not null default 'video' check (kind in ('video','short')),
  storage_key     text,
  video_url       text,
  thumbnail_url   text,
  duration_sec    integer check (duration_sec is null or duration_sec >= 0),

  -- Lifecycle: draft → uploading → processing → review → published / rejected
  status          text not null default 'draft'
                    check (status in ('draft','uploading','processing','review','published','rejected')),
  visibility      text not null default 'public'
                    check (visibility in ('public','private','unlisted')),
  allow_comments  boolean not null default true,
  publish_at      timestamptz,
  published_at    timestamptz,
  rejection_note  text,

  -- Counters kept in sync by triggers.
  view_count      integer not null default 0,
  like_count      integer not null default 0,
  comment_count   integer not null default 0,
  share_count     integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists videos_creator_idx     on public.videos (creator_id, created_at desc);
create index if not exists videos_owner_idx       on public.videos (owner_id, created_at desc);
-- The public feed only ever reads published + public rows.
create index if not exists videos_feed_idx        on public.videos (status, visibility, published_at desc);
create index if not exists videos_category_idx    on public.videos (category, published_at desc);
create index if not exists videos_kind_idx        on public.videos (kind, published_at desc);
create index if not exists videos_district_idx    on public.videos (district, crop_name);
-- Full-text search over title + description; tags are matched separately with &&.
create index if not exists videos_search_idx on public.videos
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));

drop trigger if exists trg_videos_updated_at on public.videos;
create trigger trg_videos_updated_at
  before update on public.videos
  for each row execute function public.touch_updated_at();

-- ── Subscriptions ──────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  subscriber_id   uuid not null references auth.users (id) on delete cascade,
  creator_id      uuid not null references public.creator_profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (subscriber_id, creator_id)
);
create index if not exists subscriptions_creator_idx on public.subscriptions (creator_id, created_at desc);

-- ── Likes ──────────────────────────────────────────────────────────────────
-- `value` allows a dislike later without a schema change; today only 1 is used.
create table if not exists public.video_likes (
  user_id     uuid not null references auth.users (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  value       smallint not null default 1 check (value in (1, -1)),
  created_at  timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists video_likes_video_idx on public.video_likes (video_id) where value = 1;

-- ── Saved / watch later ────────────────────────────────────────────────────
create table if not exists public.video_saves (
  user_id     uuid not null references auth.users (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- ── Views (raw events for analytics) ───────────────────────────────────────
create table if not exists public.video_views (
  id                bigserial primary key,
  video_id          uuid not null references public.videos (id) on delete cascade,
  viewer_id         uuid references auth.users (id) on delete set null,
  watched_seconds   integer not null default 0 check (watched_seconds >= 0),
  completed         boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists video_views_video_idx on public.video_views (video_id, created_at desc);
create index if not exists video_views_date_idx  on public.video_views (created_at);

-- ── Comments (with one level of replies) ───────────────────────────────────
create table if not exists public.video_comments (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references public.videos (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  parent_id   uuid references public.video_comments (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 2000),
  like_count  integer not null default 0,
  is_hidden   boolean not null default false,   -- creator moderation
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists video_comments_video_idx  on public.video_comments (video_id, created_at desc);
create index if not exists video_comments_parent_idx on public.video_comments (parent_id, created_at);
create index if not exists video_comments_author_idx on public.video_comments (author_id, created_at desc);

create table if not exists public.comment_likes (
  user_id     uuid not null references auth.users (id) on delete cascade,
  comment_id  uuid not null references public.video_comments (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- ── Playlists ──────────────────────────────────────────────────────────────
create table if not exists public.playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 100),
  description text,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists playlists_owner_idx on public.playlists (owner_id, created_at desc);

create table if not exists public.playlist_videos (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  position    integer not null default 0,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, video_id)
);

-- ── Reports (video or comment) ─────────────────────────────────────────────
create table if not exists public.video_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users (id) on delete cascade,
  video_id     uuid references public.videos (id) on delete cascade,
  comment_id   uuid references public.video_comments (id) on delete cascade,
  reason       text not null check (reason in
                 ('misinformation','harmful','spam','copyright','other')),
  note         text,
  status       text not null default 'open'
                 check (status in ('open','reviewing','actioned','dismissed')),
  created_at   timestamptz not null default now(),
  check (video_id is not null or comment_id is not null)
);
create index if not exists video_reports_open_idx on public.video_reports (status, created_at desc);

-- ── Community posts on a channel (text / image / poll) ─────────────────────
create table if not exists public.creator_posts (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creator_profiles (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 2000),
  image_url   text,
  poll        jsonb,        -- {"question": "...", "options": ["a","b"]}
  like_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists creator_posts_channel_idx on public.creator_posts (creator_id, created_at desc);

-- ── Notifications ──────────────────────────────────────────────────────────
create table if not exists public.creator_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in
                ('subscriber','comment','reply','published','processing','moderation','system')),
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists creator_notifications_idx
  on public.creator_notifications (user_id, read_at, created_at desc);

-- ── Analytics rollup ───────────────────────────────────────────────────────
-- Daily per-video snapshot. Written by `refresh_creator_analytics()`, which
-- runs on demand; the analytics page falls back to live queries for today.
create table if not exists public.creator_analytics (
  video_id       uuid not null references public.videos (id) on delete cascade,
  day            date not null,
  views          integer not null default 0,
  watch_seconds  bigint not null default 0,
  likes          integer not null default 0,
  comments       integer not null default 0,
  primary key (video_id, day)
);
create index if not exists creator_analytics_day_idx on public.creator_analytics (day desc);

-- ── Counter triggers ───────────────────────────────────────────────────────
-- Counters are read on every feed request, so they are maintained here rather
-- than aggregated in the client.

create or replace function public.sync_video_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set like_count = like_count + new.value where id = new.video_id;
  elsif tg_op = 'DELETE' then
    update public.videos set like_count = greatest(0, like_count - old.value) where id = old.video_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_video_like_count on public.video_likes;
create trigger trg_video_like_count after insert or delete on public.video_likes
  for each row execute function public.sync_video_like_count();

create or replace function public.sync_video_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set comment_count = comment_count + 1 where id = new.video_id;
    -- Notify the video owner (not the commenter themselves).
    insert into public.creator_notifications (user_id, kind, title, body, link)
    select v.owner_id,
           case when new.parent_id is null then 'comment' else 'reply' end,
           case when new.parent_id is null then 'New comment on your video'
                else 'New reply on your video' end,
           left(new.body, 120),
           '/watch/' || new.video_id
      from public.videos v
     where v.id = new.video_id and v.owner_id <> new.author_id;
  elsif tg_op = 'DELETE' then
    update public.videos set comment_count = greatest(0, comment_count - 1) where id = old.video_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_video_comment_count on public.video_comments;
create trigger trg_video_comment_count after insert or delete on public.video_comments
  for each row execute function public.sync_video_comment_count();

create or replace function public.sync_subscriber_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.creator_profiles set subscriber_count = subscriber_count + 1 where id = new.creator_id;
    insert into public.creator_notifications (user_id, kind, title, body, link)
    select cp.owner_id, 'subscriber', 'New subscriber', cp.channel_name || ' gained a subscriber.',
           '/channel/' || cp.id
      from public.creator_profiles cp
     where cp.id = new.creator_id;
  elsif tg_op = 'DELETE' then
    update public.creator_profiles set subscriber_count = greatest(0, subscriber_count - 1) where id = old.creator_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_subscriber_count on public.subscriptions;
create trigger trg_subscriber_count after insert or delete on public.subscriptions
  for each row execute function public.sync_subscriber_count();

-- A published video bumps the channel's video count.
create or replace function public.sync_creator_video_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'published' then
    update public.creator_profiles set video_count = video_count + 1 where id = new.creator_id;
  elsif tg_op = 'UPDATE' then
    if new.status = 'published' and old.status <> 'published' then
      update public.creator_profiles set video_count = video_count + 1 where id = new.creator_id;
    elsif new.status <> 'published' and old.status = 'published' then
      update public.creator_profiles set video_count = greatest(0, video_count - 1) where id = new.creator_id;
    end if;
    if new.published_at is not null and old.published_at is null then
      insert into public.creator_notifications (user_id, kind, title, body, link)
      values (new.owner_id, 'published', 'Video published', new.title, '/watch/' || new.id);
    end if;
  end if;
  return null;
end; $$;

drop trigger if exists trg_creator_video_count on public.videos;
create trigger trg_creator_video_count after insert or update of status on public.videos
  for each row execute function public.sync_creator_video_count();

-- ── View recording ─────────────────────────────────────────────────────────
-- One RPC instead of a direct insert so the counter and the event row are
-- written together and a client cannot inflate counts with a raw UPDATE.
create or replace function public.record_video_view(
  p_video_id uuid,
  p_watched_seconds integer default 0,
  p_completed boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if not exists (
    select 1 from public.videos
     where id = p_video_id and status = 'published' and visibility in ('public','unlisted')
  ) then
    return;   -- private or unpublished videos never increment
  end if;

  insert into public.video_views (video_id, viewer_id, watched_seconds, completed)
  values (p_video_id, auth.uid(), greatest(0, coalesce(p_watched_seconds, 0)),
          coalesce(p_completed, false));

  update public.videos set view_count = view_count + 1 where id = p_video_id
    returning owner_id into v_owner;

  update public.creator_profiles cp
     set total_views = cp.total_views + 1
   where cp.owner_id = v_owner;
end; $$;

-- Roll raw views into the daily table for the date range given.
create or replace function public.refresh_creator_analytics(p_days integer default 30)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.creator_analytics (video_id, day, views, watch_seconds)
  select video_id, created_at::date, count(*), coalesce(sum(watched_seconds), 0)
    from public.video_views
   where created_at >= current_date - make_interval(days => p_days)
   group by video_id, created_at::date
  on conflict (video_id, day) do update
    set views = excluded.views, watch_seconds = excluded.watch_seconds;
end; $$;

-- ── Row-level security ─────────────────────────────────────────────────────
alter table public.creator_profiles     enable row level security;
alter table public.video_categories     enable row level security;
alter table public.videos               enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.video_likes          enable row level security;
alter table public.video_saves          enable row level security;
alter table public.video_views          enable row level security;
alter table public.video_comments       enable row level security;
alter table public.comment_likes        enable row level security;
alter table public.playlists            enable row level security;
alter table public.playlist_videos      enable row level security;
alter table public.video_reports        enable row level security;
alter table public.creator_posts        enable row level security;
alter table public.creator_notifications enable row level security;
alter table public.creator_analytics    enable row level security;

-- Channels are public; only the owner edits.
drop policy if exists "Channels are public" on public.creator_profiles;
create policy "Channels are public" on public.creator_profiles for select using (true);

drop policy if exists "Creators manage their channel" on public.creator_profiles;
create policy "Creators manage their channel" on public.creator_profiles
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Categories are public" on public.video_categories;
create policy "Categories are public" on public.video_categories for select using (true);

-- Videos: published+public for everyone, unlisted by direct link, own always.
drop policy if exists "Published videos are viewable" on public.videos;
create policy "Published videos are viewable" on public.videos
  for select using (
    (status = 'published' and visibility in ('public','unlisted'))
    or auth.uid() = owner_id
  );

drop policy if exists "Creators manage their videos" on public.videos;
create policy "Creators manage their videos" on public.videos
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Subscriptions: readable by everyone (counts are public), written by the fan.
drop policy if exists "Subscriptions are readable" on public.subscriptions;
create policy "Subscriptions are readable" on public.subscriptions for select using (true);

drop policy if exists "Users manage their subscriptions" on public.subscriptions;
create policy "Users manage their subscriptions" on public.subscriptions
  for all using (auth.uid() = subscriber_id) with check (auth.uid() = subscriber_id);

drop policy if exists "Likes are readable" on public.video_likes;
create policy "Likes are readable" on public.video_likes for select using (true);

drop policy if exists "Users manage their likes" on public.video_likes;
create policy "Users manage their likes" on public.video_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their saves" on public.video_saves;
create policy "Users manage their saves" on public.video_saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Views are written only through record_video_view(); nobody reads raw rows
-- except the creator of that video.
drop policy if exists "Creators read their own view events" on public.video_views;
create policy "Creators read their own view events" on public.video_views
  for select using (
    exists (select 1 from public.videos v where v.id = video_id and v.owner_id = auth.uid())
  );

drop policy if exists "Comments on public videos are readable" on public.video_comments;
create policy "Comments on public videos are readable" on public.video_comments
  for select using (
    not is_hidden
    or auth.uid() = author_id
    or exists (select 1 from public.videos v where v.id = video_id and v.owner_id = auth.uid())
  );

drop policy if exists "Users write their own comments" on public.video_comments;
create policy "Users write their own comments" on public.video_comments
  for insert with check (auth.uid() = author_id);

drop policy if exists "Users edit or delete their own comments" on public.video_comments;
create policy "Users edit or delete their own comments" on public.video_comments
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "Users delete their own comments" on public.video_comments;
create policy "Users delete their own comments" on public.video_comments
  for delete using (
    auth.uid() = author_id
    or exists (select 1 from public.videos v where v.id = video_id and v.owner_id = auth.uid())
  );

drop policy if exists "Comment likes are readable" on public.comment_likes;
create policy "Comment likes are readable" on public.comment_likes for select using (true);

drop policy if exists "Users manage their comment likes" on public.comment_likes;
create policy "Users manage their comment likes" on public.comment_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Public playlists are readable" on public.playlists;
create policy "Public playlists are readable" on public.playlists
  for select using (is_public or auth.uid() = owner_id);

drop policy if exists "Users manage their playlists" on public.playlists;
create policy "Users manage their playlists" on public.playlists
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Playlist items follow their playlist" on public.playlist_videos;
create policy "Playlist items follow their playlist" on public.playlist_videos
  for all using (
    exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
  );

drop policy if exists "Users file reports" on public.video_reports;
create policy "Users file reports" on public.video_reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "Users see their own reports" on public.video_reports;
create policy "Users see their own reports" on public.video_reports
  for select using (auth.uid() = reporter_id);

drop policy if exists "Channel posts are public" on public.creator_posts;
create policy "Channel posts are public" on public.creator_posts for select using (true);

drop policy if exists "Creators manage their posts" on public.creator_posts;
create policy "Creators manage their posts" on public.creator_posts
  for all using (
    exists (select 1 from public.creator_profiles cp where cp.id = creator_id and cp.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.creator_profiles cp where cp.id = creator_id and cp.owner_id = auth.uid())
  );

drop policy if exists "Users read their notifications" on public.creator_notifications;
create policy "Users read their notifications" on public.creator_notifications
  for select using (auth.uid() = user_id);

drop policy if exists "Users update their notifications" on public.creator_notifications;
create policy "Users update their notifications" on public.creator_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Creators read their analytics" on public.creator_analytics;
create policy "Creators read their analytics" on public.creator_analytics
  for select using (
    exists (select 1 from public.videos v where v.id = video_id and v.owner_id = auth.uid())
  );
