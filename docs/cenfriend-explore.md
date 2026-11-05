# CenFriend — Explore, feed and stories

This note covers the Instagram-inspired three-column Explore experience: what
it reuses, what was added, and how to install the pieces that are new.

---
## 1. Reuse first — what already existed

Nothing in this upgrade introduces a second identity, a second social graph or
a second design system. Everything below was already in the repository and is
used as-is.

| Layer | Path | Used for |
|---|---|---|
| Design tokens | `frontend/tailwind.config.js`, `frontend/src/index.css` | `brand` (primary green #16A34A scale), `forest` (#0F3D2E), `creator-card`, `container-x` |
| App shell | `frontend/src/components/farm/FarmerShell.tsx` | Sidebar, header, breadcrumb, phone bar |
| CenFriend nav | `frontend/src/components/cenfriend/CenFriendShell.tsx` | Left rail, right column, mobile bar |
| UI kit | `frontend/src/components/cenfriend/ui.tsx` | `Avatar`, `RoleChip`, `FollowButton`, `PersonRow`, `PostBody`, `PostMedia`, `PostCard`, `CommentRow`, `FeedTabs`, `SocialEmpty`, `SocialLoading` |
| Optimistic actions | `frontend/src/components/cenfriend/useSocialActions.ts` | `usePostInteractions`, `useFollowMap` |
| Data layer | `frontend/src/lib/social.ts` | Follow, like, save, comment, feed, explore, hashtags, suggested, profile, notifications |
| Media upload | `frontend/src/lib/storage.ts` | `product-images`, `kisan-video-files` buckets |
| API | `backend/app/api/v1/social.py` | 43 routes under `/api/v1/social` |
| Schema | `database/supabase/social.sql` | `posts`, `comments`, `follows`, `post_likes`, `comment_likes`, `saved_posts`, `user_blocks`, `user_mutes`, `content_reports`, `social_notifications` |
| Tests | `backend/tests/test_social_api.py` | Permission logic for follow/like/comment/privacy/blocks |

Existing constraints that already give us the "no duplicates" guarantee:

* `follows` primary key `(follower_id, following_id)` — one edge per pair.
* `post_likes` / `comment_likes` / `saved_posts` primary key `(user_id, post_id)`.
* `posts_hashtags_idx` GIN index for `#tag` lookups.
* `social_can_view_author()` + RLS policy on `posts` for private accounts.

---
## 2. What this upgrade added

### 2.1 Frontend

| File | Purpose |
|---|---|
| `components/cenfriend/PostCard.tsx` | Instagram-style card: header, follow pill, three-dot menu, media carousel, hashtag row, action bar, inline comments |
| `components/cenfriend/Stories.tsx` | Story strip (`Add your story` + rings), story viewer with prev/next, viewed ring state |
| `components/cenfriend/RightSidebar.tsx` | Profile summary, suggested accounts, trending hashtags, popular topics, suggested creators, links |
| `components/cenfriend/Skeletons.tsx` | `PostSkeleton`, `StorySkeleton`, `SuggestSkeleton` |
| `components/cenfriend/CategoryChips.tsx` | Scrollable category filter chips |
| `pages/cenfriend/CenFriendExplore.tsx` | Three-column Explore: search (suggestions/history), tabs, stories, categories, feed, right column |
| `pages/cenfriend/CenFriendStories.tsx` | Story composer + viewer route (`/cenfriend/stories`) |
| `pages/cenfriend/CenFriendComments.tsx` | Activity inbox of comments on my posts (`/cenfriend/comments`) |
| `lib/stories.ts` | Story API client |
| `lib/exploreFeed.ts` | Feed/people/creator loading for Explore, category → filter mapping |
| `lib/searchHistory.ts` | Recent searches in `localStorage` |

### 2.2 Backend

| Route | Purpose |
|---|---|
| `POST /social/stories` | Publish a story (image or video) |
| `GET /social/stories` | Story trays: mine + people I follow, unexpired, block-aware |
| `GET /social/stories/{user_id}` | One account's active stories |
| `POST /social/stories/{id}/view` | Mark viewed (unique per viewer) |
| `DELETE /social/stories/{id}` | Author-only delete (soft) |
| `GET /social/comments/inbox` | Recent comments on my posts |
| `GET /social/suggested?topic=…` | Suggested accounts filtered by account type |

`/feed` and `/explore` responses now also carry `author.follow_state` and
`author.district`, so a card can show the follow pill and location without a
second round-trip per post.

### 2.3 Database

`database/supabase/cenfriend-stories.sql` — run **after** `social.sql`:

* `public.stories` (media_urls, video, caption, crop, expires_at, is_deleted)
* `public.story_views` (unique `(story_id, viewer_id)`)
* indexes for "active tray" and "my views"
* RLS: readable when public and not blocked, or yours, or a followers-only
  story by an accepted follow; writable only by the author
* `expire_stories()` helper for a scheduled job (nothing depends on it: every
  read filters `expires_at > now()`)

---
## 3. Install

1. Supabase SQL editor: `social.sql` (if not already run) → `cenfriend-stories.sql`.
2. Optional scheduled cleanup (Supabase → Database → Cron), daily:
   `select public.expire_stories();`
3. Nothing else. The API and UI read the same tables and buckets as before.

---
## 4. Feed rules

* **Following** — accepted follows + my own posts, keyset paginated.
* **Latest** — public posts, newest first.
* **Recommended** — public posts from accounts I do not follow, ordered by
  engagement then recency (transparent, no model).
* Private accounts and blocked pairs are filtered **on the server**; the client
  never receives a row it may not display.
