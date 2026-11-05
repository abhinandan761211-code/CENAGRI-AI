-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — CenFriend stories
-- Run AFTER schema.sql, features.sql, creator.sql and social.sql. Safe to re-run.
--
-- What this file adds
-- -------------------
-- A story is a post with a 24-hour life and no feed card. Keeping it in its own
-- table (rather than a `kind='story'` row in posts) matters for three reasons:
--
--   * every existing feed query reads `posts` and must not start returning
--     story rows it was never asked for;
--   * the tray query is "one row per author, the newest one" — an index that
--     would be dead weight on the posts table;
--   * deleting expired stories is a cheap interval delete instead of a scan of
--     the main content table.
--
-- Identity is unchanged: `author_id` is `auth.users (id)`, the same id the
-- eight CenAGRI roles share. There is no second account system.
--
-- Media lives in Supabase Storage (the same buckets the Create screen uses).
-- Only URLs are stored here — never bytes.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users (id) on delete cascade,
  -- One photo, or a short gallery. A video story sets video_url instead.
  media_urls  text[] not null default '{}'::text[],
  video_url   text,
  caption     text,
  crop        text,
  -- public | followers. "private" is not offered: a story nobody can see is a
  -- draft, and drafts belong on the Create screen.
  visibility  text not null default 'public',
  -- Set by the API at insert time from the configured retention policy, so a
  -- policy change never moves the expiry of a story already published.
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.stories add column if not exists media_urls text[] not null default '{}'::text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stories_visibility_chk') then
    alter table public.stories add constraint stories_visibility_chk
      check (visibility in ('public','followers'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stories_media_chk') then
    -- A story with neither a photo nor a video renders as an empty ring.
    alter table public.stories add constraint stories_media_chk
      check (cardinality(media_urls) > 0 or video_url is not null);
  end if;
end $$;

-- The tray read: active, newest first, one author at a time.
create index if not exists stories_active_idx
  on public.stories (author_id, created_at desc)
  where is_deleted = false;
create index if not exists stories_expiry_idx
  on public.stories (expires_at)
  where is_deleted = false;

-- ── Views ──────────────────────────────────────────────────────────────────
-- One row per (story, viewer). The ring turns grey the moment this exists, and
-- the primary key makes a double-tap a no-op instead of a second view.

create table if not exists public.story_views (
  story_id  uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists story_views_viewer_idx on public.story_views (viewer_id, viewed_at desc);

-- ── Functions ──────────────────────────────────────────────────────────────

-- Expiry is enforced by every read (`expires_at > now()`), so this helper only
-- reclaims space. Nothing breaks if the cron job is never scheduled.
create or replace function public.expire_stories()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  update public.stories
     set is_deleted = true
   where is_deleted = false
     and expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end $$;

-- ── Row Level Security ─────────────────────────────────────────────────────
-- The FastAPI router is the first line of defence (it verifies the JWT and
-- never reads a user id from the body). These policies are the second.

alter table public.stories     enable row level security;
alter table public.story_views enable row level security;

drop policy if exists "Stories are readable by visibility" on public.stories;
create policy "Stories are readable by visibility" on public.stories for select
  using (
    is_deleted = false
    and expires_at > now()
    and (
      auth.uid() = author_id
      or (
        public.social_can_view_author(auth.uid(), author_id)
        and (
          visibility = 'public'
          or exists (
            select 1 from public.follows f
             where f.follower_id = auth.uid()
               and f.following_id = author_id
               and f.status = 'accepted'
          )
        )
      )
    )
  );

drop policy if exists "Authors create their own stories" on public.stories;
create policy "Authors create their own stories" on public.stories for insert
  with check (auth.uid() = author_id);

drop policy if exists "Authors update their own stories" on public.stories;
create policy "Authors update their own stories" on public.stories for update
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "Authors delete their own stories" on public.stories;
create policy "Authors delete their own stories" on public.stories for delete
  using (auth.uid() = author_id);

drop policy if exists "Viewers see their own story views" on public.story_views;
create policy "Viewers see their own story views" on public.story_views for select
  using (auth.uid() = viewer_id or exists (
    select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()
  ));

drop policy if exists "Viewers record their own story views" on public.story_views;
create policy "Viewers record their own story views" on public.story_views for insert
  with check (auth.uid() = viewer_id);
