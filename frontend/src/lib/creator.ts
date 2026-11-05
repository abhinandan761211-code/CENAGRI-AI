/**
 * Creator & Kisan Video Hub — data layer.
 *
 * Every Supabase read/write for the creator module lives here so the pages
 * stay presentational. Nothing is mocked: a missing table raises a real error
 * and an empty table renders an empty state.
 *
 * Schema: database/supabase/creator.sql
 * Buckets: database/supabase/creator-storage.sql
 */
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** One friendly message for the only setup error a fresh deploy can hit. */
export function describeCreatorError(err: unknown): string {
  if (err instanceof Error && /relation|does not exist|schema cache/i.test(err.message)) {
    return "The creator tables are not set up yet. Run database/supabase/creator.sql in Supabase.";
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  return user.id;
}

/* ── Domain constants ──────────────────────────────────────────────────── */

export const VIDEO_KINDS = ["video", "short"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

/** Fallback list — the live list comes from `video_categories`. */
export const CATEGORY_FALLBACK: { slug: string; label: string }[] = [
  { slug: "crop-farming", label: "Crop Farming" },
  { slug: "organic-farming", label: "Organic Farming" },
  { slug: "modern-agriculture", label: "Modern Agriculture" },
  { slug: "dairy-farming", label: "Dairy Farming" },
  { slug: "poultry-farming", label: "Poultry Farming" },
  { slug: "fish-farming", label: "Fish Farming" },
  { slug: "agriculture-machinery", label: "Agriculture Machinery" },
  { slug: "government-schemes", label: "Government Schemes" },
  { slug: "success-stories", label: "Farming Success Stories" },
  { slug: "crop-disease", label: "Crop Disease Solutions" },
  { slug: "farmer-education", label: "Farmer Education" },
  { slug: "mandi-prices", label: "Mandi Price Updates" },
];

export const LANGUAGES = ["Bengali", "Hindi", "English", "Odia", "Assamese", "Other"] as const;

/**
 * Human labels for the category rail and for watch-page chips.
 *
 * The slugs are the ones already stored in `videos.category` and seeded by
 * database/supabase/creator.sql, so this map never renames data — it only
 * phrases it the way the hub's navigation does.
 */
export const CATEGORY_LABEL: Record<string, string> = {
  "crop-farming": "Crop Management",
  "organic-farming": "Organic Farming",
  "modern-agriculture": "Agriculture Technology",
  "dairy-farming": "Dairy Farming",
  "poultry-farming": "Poultry & Livestock",
  "fish-farming": "Fish Farming",
  "agriculture-machinery": "Tractor & Equipment",
  "government-schemes": "Government Schemes",
  "success-stories": "Success Stories",
  "crop-disease": "Crop Disease",
  "farmer-education": "Farming Tutorials",
  "mandi-prices": "Market Updates",
};

/** Readable name for a slug, falling back to the slug itself. */
export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return "Uncategorised";
  return CATEGORY_LABEL[slug] ?? CATEGORY_FALLBACK.find((c) => c.slug === slug)?.label ?? slug;
}

export const SEASONS = ["Kharif", "Rabi", "Zaid", "Year-round"] as const;
export type Season = (typeof SEASONS)[number];

export const VISIBILITIES = ["public", "private", "unlisted"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VIDEO_STATUSES = [
  "draft",
  "uploading",
  "processing",
  "review",
  "published",
  "rejected",
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const STATUS_STYLE: Record<VideoStatus, string> = {
  draft: "bg-slate-700 text-slate-200",
  uploading: "bg-sky-900/60 text-sky-300",
  processing: "bg-violet-900/60 text-violet-300",
  review: "bg-amber-900/60 text-amber-300",
  published: "bg-emerald-900/60 text-emerald-300",
  rejected: "bg-rose-900/60 text-rose-300",
};

/* ── Types ─────────────────────────────────────────────────────────────── */

export type CreatorProfile = {
  id: string;
  owner_id: string;
  channel_name: string;
  handle: string | null;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  state: string | null;
  district: string | null;
  expertise: string[] | null;
  languages: string[] | null;
  website: string | null;
  is_verified: boolean;
  subscriber_count: number;
  video_count: number;
  total_views: number;
  created_at: string;
};

export type VideoCategory = { slug: string; label: string; sort_order: number };

export type Video = {
  id: string;
  creator_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: string | null;
  language: string | null;
  tags: string[] | null;
  crop_name: string | null;
  state: string | null;
  district: string | null;
  season: Season | null;
  kind: VideoKind;
  storage_key: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  status: VideoStatus;
  visibility: Visibility;
  allow_comments: boolean;
  publish_at: string | null;
  published_at: string | null;
  rejection_note: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  /** Embedded channel, when the query joined it. */
  creator?: Pick<
    CreatorProfile,
    "id" | "channel_name" | "handle" | "avatar_url" | "is_verified" | "owner_id"
  > | null;
};

export type VideoComment = {
  id: string;
  video_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  is_hidden: boolean;
  created_at: string;
  author_name?: string;
  author_avatar?: string | null;
  replies?: VideoComment[];
};

export type CreatorNotification = {
  id: string;
  user_id: string;
  kind: "subscriber" | "comment" | "reply" | "published" | "processing" | "moderation" | "system";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/* ── Formatting ────────────────────────────────────────────────────────── */

/** 1234 → "1.2K", 1250000 → "1.2M" — the count format a video feed uses. */
export function compactCount(value: number): string {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** "4:07" / "1:02:33" from seconds. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "3 days ago" — the way a video feed states age. */
export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/* ── Channel ───────────────────────────────────────────────────────────── */

/** The signed-in user's channel, or null before it is created. */
export async function getMyChannel(): Promise<CreatorProfile | null> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("creator_profiles")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as CreatorProfile | null) ?? null;
}

export async function getChannelById(id: string): Promise<CreatorProfile | null> {
  const { data, error } = await client()
    .from("creator_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as CreatorProfile | null) ?? null;
}

export type ChannelInput = Pick<
  CreatorProfile,
  | "channel_name"
  | "handle"
  | "description"
  | "avatar_url"
  | "banner_url"
  | "state"
  | "district"
  | "expertise"
  | "languages"
  | "website"
>;

export async function saveChannel(input: ChannelInput): Promise<CreatorProfile> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("creator_profiles")
    .upsert({ ...input, owner_id: ownerId }, { onConflict: "owner_id" })
    .select()
    .single();
  if (error) throw error;
  return data as CreatorProfile;
}

/** Public channel list for the hub's "Popular creators" rail. */
export async function listTopChannels(limit = 6): Promise<CreatorProfile[]> {
  const { data, error } = await client()
    .from("creator_profiles")
    .select("*")
    .order("subscriber_count", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CreatorProfile[];
}

/* ── Categories ────────────────────────────────────────────────────────── */

export async function listCategories(): Promise<VideoCategory[]> {
  const { data, error } = await client()
    .from("video_categories")
    .select("slug, label, sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as VideoCategory[];
}

/* ── Feed / discovery ──────────────────────────────────────────────────── */

export type FeedFilter = {
  category?: string | null;
  kind?: VideoKind;
  search?: string;
  state?: string | null;
  district?: string | null;
  crop?: string | null;
  language?: string | null;
  season?: Season | null;
  creatorId?: string | null;
  sort?: "latest" | "trending";
  page?: number;
  pageSize?: number;
};

const FEED_SELECT =
  "*, creator:creator_profiles(id, channel_name, handle, avatar_url, is_verified, owner_id)";

/**
 * Published, public videos for the hub. Paginated so the browser never holds
 * the whole catalogue: one page at a time, `pageSize` rows per request.
 */
export async function listVideos(filter: FeedFilter = {}): Promise<Video[]> {
  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 24;

  let query = client()
    .from("videos")
    .select(FEED_SELECT)
    .eq("status", "published")
    .eq("visibility", "public");

  if (filter.kind) query = query.eq("kind", filter.kind);
  if (filter.category) query = query.eq("category", filter.category);
  if (filter.state) query = query.eq("state", filter.state);
  if (filter.district) query = query.eq("district", filter.district);
  if (filter.language) query = query.eq("language", filter.language);
  if (filter.season) query = query.eq("season", filter.season);
  if (filter.crop) query = query.ilike("crop_name", `%${filter.crop}%`);
  if (filter.creatorId) query = query.eq("creator_id", filter.creatorId);

  if (filter.search?.trim()) {
    // Titles, descriptions, tags and crop names — the fields the brief lists.
    const q = filter.search.trim().replace(/[%_]/g, "");
    query = query.or(
      [
        `title.ilike.%${q}%`,
        `description.ilike.%${q}%`,
        `crop_name.ilike.%${q}%`,
        `district.ilike.%${q}%`,
      ].join(",")
    );
  }

  if (filter.sort === "trending") {
    query = query.order("view_count", { ascending: false }).order("published_at", { ascending: false });
  } else {
    query = query.order("published_at", { ascending: false });
  }

  const from = page * pageSize;
  const { data, error } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  return (data ?? []) as unknown as Video[];
}

/** Every video a channel has published. */
export async function listCreatorVideos(
  creatorId: string,
  kind?: VideoKind
): Promise<Video[]> {
  let query = client()
    .from("videos")
    .select("*")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.limit(60);
  if (error) throw error;
  return (data ?? []) as Video[];
}

/** The signed-in creator's own videos, including drafts and reviews. */
export async function listMyVideos(): Promise<Video[]> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("videos")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Video[];
}

export async function getVideo(id: string): Promise<Video | null> {
  const { data, error } = await client()
    .from("videos")
    .select(FEED_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Video | null) ?? null;
}

/** Related videos from the same category or crop. */
export async function listRelated(video: Video, limit = 8): Promise<Video[]> {
  let query = client()
    .from("videos")
    .select(FEED_SELECT)
    .eq("status", "published")
    .eq("visibility", "public")
    .neq("id", video.id)
    .order("view_count", { ascending: false })
    .limit(limit);

  if (video.category) query = query.eq("category", video.category);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Video[];
}

export async function listShorts(limit = 12): Promise<Video[]> {
  return listVideos({ kind: "short", sort: "latest", pageSize: limit });
}

/* ── Upload / publish ──────────────────────────────────────────────────── */

export type VideoDraftInput = {
  title: string;
  description: string | null;
  category: string | null;
  language: string | null;
  tags: string[];
  crop_name: string | null;
  state: string | null;
  district: string | null;
  season: Season | null;
  kind: VideoKind;
  visibility: Visibility;
  allow_comments: boolean;
  publish_at: string | null;
  storage_key: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
};

/** Create the row as a draft before the file finishes uploading. */
export async function createVideoDraft(
  creator: CreatorProfile,
  input: VideoDraftInput
): Promise<Video> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("videos")
    .insert({
      ...input,
      creator_id: creator.id,
      owner_id: ownerId,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Video;
}

/**
 * Publish a draft. A scheduled video stays in `review` until its time arrives,
 * which the cron/admin can promote; an immediate one goes straight to
 * `published` with `published_at` stamped now.
 */
export async function publishVideo(id: string, publishAt: string | null): Promise<Video> {
  const scheduled = publishAt ? new Date(publishAt).getTime() > Date.now() : false;
  const patch = scheduled
    ? { status: "review" as VideoStatus, publish_at: publishAt }
    : {
      status: "published" as VideoStatus,
      publish_at: null,
      published_at: new Date().toISOString(),
    };

  const { data, error } = await client()
    .from("videos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Video;
}

export async function updateVideo(
  id: string,
  patch: Partial<VideoDraftInput> & { status?: VideoStatus }
): Promise<Video> {
  const { data, error } = await client()
    .from("videos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Video;
}

export async function deleteVideo(id: string): Promise<void> {
  const { error } = await client().from("videos").delete().eq("id", id);
  if (error) throw error;
}

/** Record one view. The RPC keeps the counter and event row in step. */
export async function recordView(
  videoId: string,
  watchedSeconds = 0,
  completed = false
): Promise<void> {
  await client().rpc("record_video_view", {
    p_video_id: videoId,
    p_watched_seconds: watchedSeconds,
    p_completed: completed,
  });
}

/* ── Likes / saves / subscriptions ─────────────────────────────────────── */

export async function hasLiked(videoId: string): Promise<boolean> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("video_likes")
    .select("video_id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function toggleLike(videoId: string, liked: boolean): Promise<void> {
  const userId = await currentUserId();
  if (liked) {
    const { error } = await client()
      .from("video_likes")
      .delete()
      .eq("user_id", userId)
      .eq("video_id", videoId);
    if (error) throw error;
  } else {
    const { error } = await client()
      .from("video_likes")
      .insert({ user_id: userId, video_id: videoId, value: 1 });
    if (error) throw error;
  }
}

export async function hasSaved(videoId: string): Promise<boolean> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("video_saves")
    .select("video_id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function toggleSave(videoId: string, saved: boolean): Promise<void> {
  const userId = await currentUserId();
  if (saved) {
    const { error } = await client()
      .from("video_saves")
      .delete()
      .eq("user_id", userId)
      .eq("video_id", videoId);
    if (error) throw error;
  } else {
    const { error } = await client().from("video_saves").insert({ user_id: userId, video_id: videoId });
    if (error) throw error;
  }
}

export async function isSubscribed(creatorId: string): Promise<boolean> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("subscriptions")
    .select("creator_id")
    .eq("subscriber_id", userId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function toggleSubscribe(creatorId: string, subscribed: boolean): Promise<void> {
  const userId = await currentUserId();
  if (subscribed) {
    const { error } = await client()
      .from("subscriptions")
      .delete()
      .eq("subscriber_id", userId)
      .eq("creator_id", creatorId);
    if (error) throw error;
  } else {
    const { error } = await client()
      .from("subscriptions")
      .insert({ subscriber_id: userId, creator_id: creatorId });
    if (error) throw error;
  }
}

/** Videos from channels the user follows — the hub's "Following" tab. */
export async function listFollowingFeed(page = 0): Promise<Video[]> {
  const userId = await currentUserId();
  const { data: subs, error: subError } = await client()
    .from("subscriptions")
    .select("creator_id")
    .eq("subscriber_id", userId);
  if (subError) throw subError;

  const ids = (subs ?? []).map((s: { creator_id: string }) => s.creator_id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from("videos")
    .select(FEED_SELECT)
    .in("creator_id", ids)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("published_at", { ascending: false })
    .range(page * 24, page * 24 + 23);
  if (error) throw error;
  return (data ?? []) as unknown as Video[];
}

/** Watch Later + Liked, both backed by their own table. */
export async function listSavedVideos(): Promise<Video[]> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("video_saves")
    .select(`created_at, video:videos(${FEED_SELECT})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row: { video: Video | Video[] | null }) => {
      const v = Array.isArray(row.video) ? row.video[0] : row.video;
      return v ?? null;
    })
    .filter((v): v is Video => Boolean(v));
}

export async function listLikedVideos(): Promise<Video[]> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("video_likes")
    .select(`created_at, video:videos(${FEED_SELECT})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row: { video: Video | Video[] | null }) => {
      const v = Array.isArray(row.video) ? row.video[0] : row.video;
      return v ?? null;
    })
    .filter((v): v is Video => Boolean(v));
}

/* ── Comments ──────────────────────────────────────────────────────────── */

/** All comments for a video, nested one level for replies. */
export async function listComments(videoId: string): Promise<VideoComment[]> {
  const { data, error } = await client()
    .from("video_comments")
    .select("id, video_id, author_id, parent_id, body, like_count, is_hidden, created_at")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as VideoComment[];

  // Author names come from `profiles` — one extra read rather than an embed,
  // because video_comments.author_id points at auth.users, not profiles.
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  let authors = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await client()
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", authorIds);
    authors = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [
        p.id,
        { full_name: p.full_name, avatar_url: p.avatar_url },
      ])
    );
  }

  const withAuthor = rows.map((r) => ({
    ...r,
    author_name: authors.get(r.author_id)?.full_name ?? "Kalika user",
    author_avatar: authors.get(r.author_id)?.avatar_url ?? null,
  }));

  const roots = withAuthor.filter((c) => !c.parent_id);
  return roots.map((root) => ({
    ...root,
    replies: withAuthor.filter((c) => c.parent_id === root.id),
  }));
}

export async function addComment(
  videoId: string,
  body: string,
  parentId: string | null = null
): Promise<void> {
  const userId = await currentUserId();
  const { error } = await client()
    .from("video_comments")
    .insert({ video_id: videoId, author_id: userId, body, parent_id: parentId });
  if (error) throw error;
}

export async function editComment(id: string, body: string): Promise<void> {
  const { error } = await client()
    .from("video_comments")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await client().from("video_comments").delete().eq("id", id);
  if (error) throw error;
}

/** Creator moderation: hide a comment without deleting the record. */
export async function hideComment(id: string, hidden: boolean): Promise<void> {
  const { error } = await client().from("video_comments").update({ is_hidden: hidden }).eq("id", id);
  if (error) throw error;
}

/** Every comment on the signed-in creator's videos. */
export async function listCommentsForCreator(): Promise<
  (VideoComment & { video_title: string; video_id: string })[]
> {
  const userId = await currentUserId();
  const { data: videos, error: videoError } = await client()
    .from("videos")
    .select("id, title")
    .eq("owner_id", userId);
  if (videoError) throw videoError;

  const ids = (videos ?? []).map((v: { id: string }) => v.id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from("video_comments")
    .select("id, video_id, author_id, parent_id, body, like_count, is_hidden, created_at")
    .in("video_id", ids)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const titleOf = new Map((videos ?? []).map((v: { id: string; title: string }) => [v.id, v.title]));
  const authorIds = Array.from(new Set((data ?? []).map((r: VideoComment) => r.author_id)));
  const { data: profiles } = await client()
    .from("profiles")
    .select("id, full_name")
    .in("id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
  const names = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
  );

  return (data ?? []).map((r: VideoComment) => ({
    ...r,
    video_title: titleOf.get(r.video_id) ?? "Video",
    author_name: names.get(r.author_id) ?? "Kalika user",
  }));
}

/* ── Playlists ─────────────────────────────────────────────────────────── */

export type Playlist = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  video_count?: number;
};

export async function listPlaylists(): Promise<Playlist[]> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("playlists")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Playlist[];
}

export async function createPlaylist(title: string, description: string | null): Promise<Playlist> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("playlists")
    .insert({ owner_id: userId, title, description })
    .select()
    .single();
  if (error) throw error;
  return data as Playlist;
}

/* ── Notifications ─────────────────────────────────────────────────────── */

export async function listCreatorNotifications(): Promise<CreatorNotification[]> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("creator_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as CreatorNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client()
    .from("creator_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await currentUserId();
  const { error } = await client()
    .from("creator_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

/* ── Analytics ─────────────────────────────────────────────────────────── */

export type VideoStats = {
  views: number;
  likes: number;
  comments: number;
  watchSeconds: number;
  avgWatchSeconds: number;
  subscribers: number;
};

/** Headline numbers for the creator dashboard + analytics screens. */
export async function getChannelStats(creatorId: string, days = 28): Promise<VideoStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: videos, error: videoError } = await client()
    .from("videos")
    .select("id, view_count, like_count, comment_count")
    .eq("creator_id", creatorId);
  if (videoError) throw videoError;

  const ids = (videos ?? []).map((v: { id: string }) => v.id);

  let watchSeconds = 0;
  let viewsInRange = 0;
  if (ids.length > 0) {
    const { data: views, error: viewError } = await client()
      .from("video_views")
      .select("watched_seconds")
      .in("video_id", ids)
      .gte("created_at", since);
    if (viewError) throw viewError;
    watchSeconds = (views ?? []).reduce(
      (sum: number, v: { watched_seconds: number }) => sum + Number(v.watched_seconds || 0),
      0
    );
    viewsInRange = (views ?? []).length;
  }

  const { data: channel, error: channelError } = await client()
    .from("creator_profiles")
    .select("subscriber_count")
    .eq("id", creatorId)
    .maybeSingle();
  if (channelError) throw channelError;

  const totals = (videos ?? []).reduce(
    (acc: { likes: number; comments: number }, v: { like_count: number; comment_count: number }) => ({
      likes: acc.likes + Number(v.like_count || 0),
      comments: acc.comments + Number(v.comment_count || 0),
    }),
    { likes: 0, comments: 0 }
  );

  return {
    views: viewsInRange,
    likes: totals.likes,
    comments: totals.comments,
    watchSeconds,
    avgWatchSeconds: viewsInRange > 0 ? Math.round(watchSeconds / viewsInRange) : 0,
    subscribers: Number((channel as { subscriber_count: number } | null)?.subscriber_count ?? 0),
  };
}

export type DayPoint = { day: string; views: number };

/** Daily views for the trend chart, zero-filled across the range. */
export async function getDailyViews(creatorId: string, days = 28): Promise<DayPoint[]> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setHours(0, 0, 0, 0);

  const { data: videos, error: videoError } = await client()
    .from("videos")
    .select("id")
    .eq("creator_id", creatorId);
  if (videoError) throw videoError;

  const ids = (videos ?? []).map((v: { id: string }) => v.id);
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  if (ids.length > 0) {
    const { data, error } = await client()
      .from("video_views")
      .select("created_at")
      .in("video_id", ids)
      .gte("created_at", since.toISOString());
    if (error) throw error;
    for (const row of data ?? []) {
      const key = new Date((row as { created_at: string }).created_at).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([day, views]) => ({ day, views }));
}

/** Top videos by views — the analytics "best performers" table. */
export async function getTopVideos(creatorId: string, limit = 5): Promise<Video[]> {
  const { data, error } = await client()
    .from("videos")
    .select("*")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("view_count", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Video[];
}

/* ── Live streaming (demo data) ────────────────────────────────────────── */

/**
 * A live broadcast as the hub renders it.
 *
 * This is DEMO DATA, not a live API. Kalika has no ingest server (RTMP/SRT),
 * transcoder or HLS player yet — see CreatorLive. Every consumer must show the
 * `isDemo` notice so nobody mistakes a sample card for a real stream. When the
 * ingest pipeline exists, replace `listLiveStreams` with a real query against a
 * `live_streams` table and delete the `DEMO_LIVE_STREAMS` array.
 */
export type LiveStream = {
  id: string;
  title: string;
  channelName: string;
  channelId: string | null;
  handle: string | null;
  isVerified: boolean;
  avatarUrl: string | null;
  thumbnailUrl: string;
  viewerCount: number;
  startedMinutesAgo: number;
  category: string;
  isDemo: true;
};

export const DEMO_LIVE_STREAMS: LiveStream[] = [
  {
    id: "live-wheat-sowing",
    title: "Live from the field: wheat sowing prep & seed treatment",
    channelName: "Kisan Agronomy Lab",
    channelId: null,
    handle: "kisanagronomy",
    isVerified: true,
    avatarUrl: null,
    thumbnailUrl: "/images/video-2.jpg",
    viewerCount: 1284,
    startedMinutesAgo: 42,
    category: "crop-farming",
    isDemo: true,
  },
  {
    id: "live-mandi-rates",
    title: "Today's mandi rates — paddy & wheat across districts",
    channelName: "Mandi Bhav Daily",
    channelId: null,
    handle: "mandibhav",
    isVerified: true,
    avatarUrl: null,
    thumbnailUrl: "/images/video-3.jpg",
    viewerCount: 862,
    startedMinutesAgo: 18,
    category: "mandi-prices",
    isDemo: true,
  },
  {
    id: "live-tractor-service",
    title: "Tractor maintenance Q&A — bring your questions",
    channelName: "Farm Machinery Basics",
    channelId: null,
    handle: "farmmachinery",
    isVerified: false,
    avatarUrl: null,
    thumbnailUrl: "/images/video-4.jpg",
    viewerCount: 331,
    startedMinutesAgo: 96,
    category: "agriculture-machinery",
    isDemo: true,
  },
  {
    id: "live-dairy-farm",
    title: "Morning shift at a 40-cow dairy unit",
    channelName: "Dairy Seva",
    channelId: null,
    handle: "dairyseva",
    isVerified: true,
    avatarUrl: null,
    thumbnailUrl: "/images/video-1.jpg",
    viewerCount: 517,
    startedMinutesAgo: 7,
    category: "dairy-farming",
    isDemo: true,
  },
];

/**
 * Streams currently "on air".
 *
 * Demo-only: resolves the constant above. Kept async and in this module so the
 * hub page depends on one function that can later become a Supabase query
 * without touching the UI.
 */
export async function listLiveStreams(limit = 4): Promise<LiveStream[]> {
  return DEMO_LIVE_STREAMS.slice(0, limit);
}
