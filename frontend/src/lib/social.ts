import { supabase } from "@/lib/supabase";

/**
 * CenFriend — the social data layer.
 *
 * Everything here talks to `/api/v1/social/*` on the Kalika FastAPI backend.
 * The reason is permission, not preference: following, liking and commenting
 * on *someone else's* content must be judged against blocks, privacy and
 * ownership. Doing that in the browser would mean trusting the browser to
 * enforce it.
 *
 * The Supabase access token is attached to every call and the backend takes
 * the acting user from the verified JWT. No function here ever sends "who I
 * am" — a modified client cannot act as somebody else.
 *
 * Mirrors the calling convention of `farmerApi.ts` so both behave the same way
 * on a deployment where the backend is not configured.
 */

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1").replace(/\/$/, "");

export class SocialUnavailable extends Error {
  constructor(message = "CenFriend needs the Kalika server, which is not configured for this build.") {
    super(message);
    this.name = "SocialUnavailable";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) throw new SocialUnavailable("Supabase is not configured for this build.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SocialUnavailable("Sign in again to use CenFriend.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) throw new SocialUnavailable();
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/social${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let detail = `The server returned ${res.status}.`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* not JSON — keep the generic message */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ── Types ────────────────────────────────────────────────────────────── */

/** The four states the follow button can be in. */
export type FollowState = "follow" | "following" | "follow_back" | "requested" | "me";

export type SocialAuthor = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
  is_private?: boolean;
  /** District the account already shows on its profile; never a precise farm. */
  district?: string | null;
  /**
   * The viewer's relationship to this author, resolved by the API when a feed
   * is hydrated. Absent on older responses, in which case callers fall back to
   * their own follow map.
   */
  follow_state?: FollowState;
};

export type SocialPost = {
  id: string;
  author_id: string;
  body: string;
  image_url?: string | null;
  media_urls: string[];
  video_url: string | null;
  post_kind: "text" | "image" | "gallery" | "video" | "short";
  visibility: "public" | "followers" | "private";
  hashtags: string[];
  location_name: string | null;
  crop: string | null;
  district: string | null;
  like_count: number;
  comment_count: number;
  share_count: number;
  liked: boolean;
  saved: boolean;
  created_at: string;
  edited_at: string | null;
  author: SocialAuthor;
};

export type SocialComment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  is_mine: boolean;
  liked: boolean;
  created_at: string;
  author: SocialAuthor;
  replies: SocialComment[];
};

export type PostDetail = SocialPost & { comments: SocialComment[] };

export type PersonCard = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
  bio: string | null;
  follower_count: number;
  is_private: boolean;
  district: string | null;
  follow_state: FollowState | "me";
};

export type Paged<T> = { items: T[]; next_offset: number | null };

export type CursorPaged<T> = { items: T[]; next_cursor: string | null };

export type SocialProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  role: string | null;
  creator_mode: boolean;
  follower_count: number;
  following_count: number;
  post_count: number;
  is_private: boolean;
  is_self: boolean;
  /** True when this account is private and the viewer is not an accepted follower. */
  is_restricted: boolean;
  district: string | null;
  state: string | null;
  follow_state: FollowState;
  can_message: boolean;
};

export type SocialNotification = {
  id: string;
  kind: "follow" | "follow_request" | "follow_accepted" | "like" | "comment" | "reply" | "mention" | "share" | "system";
  title: string;
  body: string | null;
  link: string | null;
  actor_id: string | null;
  actor: SocialAuthor | null;
  read_at: string | null;
  created_at: string;
};

export type FeedMode = "following" | "recommended" | "latest";

/* ── Follow ───────────────────────────────────────────────────────────── */

export function getFollowState(userId: string) {
  return request<{ state: FollowState; target_id: string; is_private: boolean }>(`/follow/${userId}/state`);
}

/** Follow a public account or request a private one. Returns the resulting state. */
export async function followUser(userId: string): Promise<"following" | "requested"> {
  const res = await request<{ status: "accepted" | "pending" }>(`/follow/${userId}`, { method: "POST" });
  return res.status === "pending" ? "requested" : "following";
}

export function unfollowUser(userId: string) {
  return request<void>(`/follow/${userId}`, { method: "DELETE" });
}

/** Remove somebody who follows me. */
export function removeFollower(userId: string) {
  return request<void>(`/followers/${userId}`, { method: "DELETE" });
}

export function listFollowers(userId: string, limit = 20, offset = 0) {
  return request<Paged<PersonCard> & { total?: number }>(`/followers/${userId}?limit=${limit}&offset=${offset}`);
}

export function listFollowing(userId: string, limit = 20, offset = 0) {
  return request<Paged<PersonCard> & { total?: number }>(`/following/${userId}?limit=${limit}&offset=${offset}`);
}

/* ── Follow requests ──────────────────────────────────────────────────── */

/** Requests addressed to me, waiting for a decision. */
export function listFollowRequests() {
  return request<Paged<PersonCard>>(`/requests`);
}

/** Requests I sent that nobody has answered yet. */
export function listSentRequests() {
  return request<Paged<PersonCard>>(`/requests/sent`);
}

export function acceptFollowRequest(followerId: string) {
  return request<void>(`/requests/${followerId}/accept`, { method: "POST" });
}

export function rejectFollowRequest(followerId: string) {
  return request<void>(`/requests/${followerId}/reject`, { method: "POST" });
}

/** Withdraw a request I sent. */
export function cancelFollowRequest(userId: string) {
  return request<void>(`/requests/${userId}`, { method: "DELETE" });
}

/* ── Likes ────────────────────────────────────────────────────────────── */

/**
 * Like or unlike a post.
 *
 * The server returns the true count, and the caller should apply *that* rather
 * than its optimistic guess. A double tap, a second tab, or a request that
 * lost a race all converge on the database's number this way.
 */
export function likePost(postId: string) {
  return request<{ liked: boolean; like_count: number }>(`/posts/${postId}/like`, { method: "POST" });
}

export function unlikePost(postId: string) {
  return request<{ liked: boolean; like_count: number }>(`/posts/${postId}/like`, { method: "DELETE" });
}

export function listPostLikes(postId: string, limit = 20, offset = 0) {
  return request<Paged<PersonCard>>(`/posts/${postId}/likes?limit=${limit}&offset=${offset}`);
}

export function likeComment(commentId: string) {
  return request<void>(`/comments/${commentId}/like`, { method: "POST" });
}

export function unlikeComment(commentId: string) {
  return request<void>(`/comments/${commentId}/like`, { method: "DELETE" });
}

/* ── Posts ────────────────────────────────────────────────────────────── */

export type CreatePostInput = {
  body: string;
  media_urls?: string[];
  video_url?: string | null;
  post_kind?: "text" | "image" | "gallery" | "video" | "short";
  visibility?: "public" | "followers" | "private";
  location_name?: string | null;
  crop?: string | null;
  is_draft?: boolean;
};

export function createPost(input: CreatePostInput) {
  return request<SocialPost>(`/posts`, { method: "POST", body: JSON.stringify(input) });
}

export function editPost(postId: string, input: { body?: string; visibility?: string; location_name?: string }) {
  return request<SocialPost>(`/posts/${postId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deletePost(postId: string) {
  return request<void>(`/posts/${postId}`, { method: "DELETE" });
}

export function getPost(postId: string) {
  return request<PostDetail>(`/posts/${postId}`);
}

export function sharePost(postId: string) {
  return request<void>(`/posts/${postId}/share`, { method: "POST" });
}

export function savePost(postId: string) {
  return request<void>(`/posts/${postId}/save`, { method: "POST" });
}

export function unsavePost(postId: string) {
  return request<void>(`/posts/${postId}/save`, { method: "DELETE" });
}

export function listSaved(limit = 20, offset = 0) {
  return request<Paged<SocialPost>>(`/saved?limit=${limit}&offset=${offset}`);
}

/* ── Comments ─────────────────────────────────────────────────────────── */

export function addComment(postId: string, body: string, parentId?: string | null) {
  return request<SocialComment>(`/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, parent_id: parentId ?? null }),
  });
}

export function deleteComment(commentId: string) {
  return request<void>(`/comments/${commentId}`, { method: "DELETE" });
}

/* ── Feed & discovery ─────────────────────────────────────────────────── */

export function getFeed(mode: FeedMode = "following", cursor?: string | null, limit = 20) {
  const params = new URLSearchParams({ mode, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request<CursorPaged<SocialPost> & { mode: FeedMode }>(`/feed?${params}`);
}

export function getExplore(opts: { q?: string; kind?: string; cursor?: string | null; limit?: number } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 24));
  if (opts.q) params.set("q", opts.q);
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.cursor) params.set("cursor", opts.cursor);
  return request<CursorPaged<SocialPost>>(`/explore?${params}`);
}

export function searchPeople(opts: { q?: string; role?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 20));
  if (opts.offset) params.set("offset", String(opts.offset));
  if (opts.q) params.set("q", opts.q);
  if (opts.role) params.set("role", opts.role);
  return request<Paged<PersonCard>>(`/explore/people?${params}`);
}

export function getTrendingHashtags(limit = 10) {
  return request<{ items: { tag: string; posts: number }[] }>(`/hashtags?limit=${limit}`);
}

export type SuggestTopic =
  | "creator"
  | "farmer"
  | "buyer"
  | "retailer"
  | "worker"
  | "transporter"
  | "warehouse"
  | "equipment";

/** Accounts to follow. `topic` narrows to one account type on the same graph. */
export function getSuggestedAccounts(limit = 8, topic?: SuggestTopic) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (topic) params.set("topic", topic);
  return request<{ items: PersonCard[] }>(`/suggested?${params}`);
}

/* ── Stories ──────────────────────────────────────────────────────────── */

export type Story = {
  id: string;
  author_id: string;
  media_urls: string[];
  video_url: string | null;
  caption: string | null;
  crop: string | null;
  visibility: "public" | "followers";
  expires_at: string;
  created_at: string;
  viewed: boolean;
  author: SocialAuthor;
};

export type StoryTray = {
  user: SocialAuthor;
  stories: Story[];
  all_viewed: boolean;
  is_me: boolean;
};

export function listStoryTrays() {
  return request<{ trays: StoryTray[]; mine: Story[] }>(`/stories`);
}

export function getUserStories(userId: string) {
  return request<{ user: PersonCard; stories: Story[] }>(`/stories/${userId}`);
}

export function createStory(input: {
  media_urls?: string[];
  video_url?: string | null;
  caption?: string | null;
  crop?: string | null;
  visibility?: "public" | "followers";
}) {
  return request<Story>(`/stories`, { method: "POST", body: JSON.stringify(input) });
}

export function markStoryViewed(storyId: string) {
  return request<void>(`/stories/${storyId}/view`, { method: "POST" });
}

export function deleteStory(storyId: string) {
  return request<void>(`/stories/${storyId}`, { method: "DELETE" });
}

/* ── Activity ─────────────────────────────────────────────────────────── */

export type InboxComment = {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author: SocialAuthor;
  post: { id: string; body: string | null; media_urls: string[] };
};

/** Recent comments on MY posts — the activity panel, not the notification list. */
export function getCommentInbox(limit = 10) {
  return request<{ items: InboxComment[] }>(`/comments/inbox?limit=${limit}`);
}

/** Comments on one post, nested one level. Used by the inline comment box. */
export function getPostComments(postId: string) {
  return getPost(postId).then((post) => post.comments ?? []);
}

/* ── Profile ──────────────────────────────────────────────────────────── */

export function getProfile(userId: string) {
  return request<SocialProfile>(`/profile/${userId}`);
}

export function getProfilePosts(userId: string, cursor?: string | null, limit = 24) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request<CursorPaged<SocialPost>>(`/profile/${userId}/posts?${params}`);
}

/** Switch my own account between public and private. */
export function setPrivacy(isPrivate: boolean) {
  return request<{ is_private: boolean }>(`/me/privacy`, {
    method: "PATCH",
    body: JSON.stringify({ is_private: isPrivate }),
  });
}

/* ── Block, mute, report ──────────────────────────────────────────────── */

export function blockUser(userId: string) {
  return request<void>(`/users/${userId}/block`, { method: "POST" });
}

export function unblockUser(userId: string) {
  return request<void>(`/users/${userId}/block`, { method: "DELETE" });
}

export function muteUser(userId: string) {
  return request<void>(`/users/${userId}/mute`, { method: "POST" });
}

export function unmuteUser(userId: string) {
  return request<void>(`/users/${userId}/mute`, { method: "DELETE" });
}

export function listBlocked() {
  return request<Paged<PersonCard>>(`/blocked`);
}

export type ReportTarget = "post" | "comment" | "user";
export type ReportReason = "spam" | "harassment" | "misinformation" | "hate" | "nudity" | "violence" | "other";

export function reportContent(target_kind: ReportTarget, target_id: string, reason: ReportReason, note?: string) {
  return request<{ id: string | null; duplicate: boolean }>(`/reports`, {
    method: "POST",
    body: JSON.stringify({ target_kind, target_id, reason, note: note || null }),
  });
}

/* ── Notifications ────────────────────────────────────────────────────── */

export function listNotifications(opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.offset) params.set("offset", String(opts.offset));
  if (opts.unreadOnly) params.set("unread_only", "true");
  return request<Paged<SocialNotification> & { unread: number }>(`/notifications?${params}`);
}

export function markAllNotificationsRead() {
  return request<void>(`/notifications/read`, { method: "POST" });
}

export function markNotificationRead(id: string) {
  return request<void>(`/notifications/${id}/read`, { method: "POST" });
}

/* ── Shared helpers ───────────────────────────────────────────────────── */

/** Every account type the social graph supports — one identity, eight roles. */
export const ROLE_LABELS: Record<string, string> = {
  Farmer: "Farmer",
  Buyer: "Buyer",
  Retailer: "Retailer",
  Shop: "Retailer",
  Worker: "Worker",
  Equipment: "Equipment Owner",
  Transporter: "Transporter",
  Warehouse: "Warehouse Owner",
  "Content Creator": "Content Creator",
};

export function roleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? role;
}

/** The handle to show, falling back to the display name. */
export function handleOf(person: { username?: string | null; full_name?: string | null }): string {
  if (person.username) return `@${person.username}`;
  return person.full_name?.trim() || "Kalika member";
}

export function compact(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** "just now", "4m", "3h", "2d", then a date. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604_800) return `${Math.floor(secs / 86_400)}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** #tags and @handles, as runs the feed can style and link. */
export type BodyToken = { type: "text" | "tag" | "mention"; value: string };

export function tokenizeBody(body: string): BodyToken[] {
  const out: BodyToken[] = [];
  const re = /(#[\p{L}0-9_]{1,50}|@[a-z0-9_.]{3,30})/giu;
  let last = 0;
  for (const match of body.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ type: "text", value: body.slice(last, start) });
    const token = match[0];
    out.push({ type: token.startsWith("#") ? "tag" : "mention", value: token });
    last = start + token.length;
  }
  if (last < body.length) out.push({ type: "text", value: body.slice(last) });
  return out;
}
