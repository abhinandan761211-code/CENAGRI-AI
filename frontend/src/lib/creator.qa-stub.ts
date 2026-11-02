/**
 * QA-only fixture layer for the Kisan Video Hub / Creator Studio.
 *
 * TEMPORARY. It replaces `@/lib/creator` only under `vite.qa.config.ts`, which
 * swaps the module so the real pages render without Supabase credentials. The
 * shapes below mirror the exports of `creator.ts`; nothing here ships in a
 * normal build.
 */

export type Video = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  kind: "video" | "short";
  status: "draft" | "published" | "review";
  duration_sec: number | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  category: string | null;
  creator: CreatorProfile | null;
};

export type CreatorProfile = {
  id: string;
  channel_name: string;
  handle: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  subscriber_count: number;
  video_count: number;
  total_views: number;
  is_verified: boolean;
  district: string | null;
  state: string | null;
  expertise: string[] | null;
};

export type LiveStream = {
  id: string;
  title: string;
  channelName: string;
  channelId: string | null;
  avatarUrl: string | null;
  thumbnailUrl: string;
  viewerCount: number;
  startedMinutesAgo: number;
  isVerified: boolean;
  isDemo: boolean;
};

export type VideoCategory = { slug: string; label: string; sort_order: number };

export type CreatorNotification = {
  id: string;
  kind: "subscriber" | "comment" | "reply" | "published" | "processing" | "moderation" | "system";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type DayPoint = { day: string; views: number };

export const CATEGORY_FALLBACK: { slug: string; label: string }[] = [
  { slug: "crops", label: "Crops" },
  { slug: "irrigation", label: "Irrigation" },
  { slug: "machinery", label: "Machinery" },
  { slug: "organic", label: "Organic" },
];

const ME = "qa-channel-1";

const CHANNELS: CreatorProfile[] = [
  {
    id: ME,
    channel_name: "Raipur Kisan Diaries",
    handle: "raipurkisan",
    avatar_url: null,
    banner_url: null,
    subscriber_count: 12400,
    video_count: 6,
    total_views: 184000,
    is_verified: true,
    district: "Raipur",
    state: "Chhattisgarh",
    expertise: ["Wheat", "Irrigation"],
  },
  {
    id: "qa-channel-2",
    channel_name: "AgriGuru Academy",
    handle: "agriguru",
    avatar_url: null,
    banner_url: null,
    subscriber_count: 88000,
    video_count: 4,
    total_views: 990000,
    is_verified: true,
    district: "Nashik",
    state: "Maharashtra",
    expertise: ["Grapes", "Drip"],
  },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const VIDEO_TITLES = [
  "Wheat sowing: seed rate and spacing explained",
  "Drip irrigation setup step by step",
  "Tomato leaf curl — what to do this week",
  "Tractor maintenance before the season",
  "Organic compost that actually works",
  "PM-Kisan scheme: documents you need",
];

function makeVideo(index: number, kind: "video" | "short" = "video"): Video {
  const creator = CHANNELS[index % CHANNELS.length];
  return {
    id: `qa-video-${index + 1}`,
    creator_id: creator.id,
    title: kind === "short" ? `Quick tip #${index + 1}` : VIDEO_TITLES[index % VIDEO_TITLES.length],
    description: "Sample description for the QA harness.",
    thumbnail_url: null,
    video_url: null,
    kind,
    status: "published",
    duration_sec: kind === "short" ? 45 : 480 + index * 30,
    view_count: 4200 * (index + 1),
    like_count: 210 * (index + 1),
    comment_count: 12 * (index + 1),
    published_at: hoursAgo(6 * (index + 1)),
    category: "crops",
    creator,
  };
}

const VIDEOS: Video[] = Array.from({ length: 6 }, (_, i) => makeVideo(i));
const SHORTS: Video[] = Array.from({ length: 6 }, (_, i) => makeVideo(i, "short"));

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return "Uncategorised";
  return CATEGORY_FALLBACK.find((c) => c.slug === slug)?.label ?? slug;
}

export function compactCount(value: number): string {
  const n = Number(value) || 0;
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const hours = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function getMyChannel(): Promise<CreatorProfile | null> {
  return CHANNELS[0];
}

export async function listTopChannels(limit = 6): Promise<CreatorProfile[]> {
  return CHANNELS.slice(0, limit);
}

export async function listCategories(): Promise<VideoCategory[]> {
  return CATEGORY_FALLBACK.map((c, i) => ({ ...c, sort_order: i }));
}

export async function listVideos(filter: { kind?: "video" | "short"; search?: string } = {}): Promise<Video[]> {
  const pool = filter.kind === "short" ? SHORTS : VIDEOS;
  const q = filter.search?.toLowerCase();
  return q ? pool.filter((v) => v.title.toLowerCase().includes(q)) : pool;
}

export async function listShorts(limit = 12): Promise<Video[]> {
  return SHORTS.slice(0, limit);
}

export async function listCreatorVideos(creatorId: string): Promise<Video[]> {
  return VIDEOS.filter((v) => v.creator_id === creatorId);
}

export async function listMyVideos(): Promise<Video[]> {
  return VIDEOS.filter((v) => v.creator_id === ME);
}

export async function listFollowingFeed(): Promise<Video[]> {
  return VIDEOS.slice(0, 3);
}

export async function listSavedVideos(): Promise<Video[]> {
  return VIDEOS.slice(1, 3);
}

export async function listLikedVideos(): Promise<Video[]> {
  return VIDEOS.slice(0, 2);
}

export async function isSubscribed(): Promise<boolean> {
  return false;
}

export async function toggleSubscribe(): Promise<void> {}

export async function listCreatorNotifications(): Promise<CreatorNotification[]> {
  return [
    {
      id: "n1",
      kind: "subscriber",
      title: "New subscriber",
      body: "A farmer from Raipur subscribed to your channel.",
      link: null,
      read_at: null,
      created_at: hoursAgo(2),
    },
  ];
}

export async function markAllNotificationsRead(): Promise<void> {}

export async function getDailyViews(_creatorId: string, days = 28): Promise<DayPoint[]> {
  return Array.from({ length: days }, (_, i) => ({
    day: new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(5, 10),
    views: 40 + ((i * 37) % 160),
  }));
}

export async function listLiveStreams(limit = 4): Promise<LiveStream[]> {
  return [
    {
      id: "live-1",
      title: "Live: mandi rates and what to sell today",
      channelName: CHANNELS[1].channel_name,
      channelId: null,
      avatarUrl: null,
      thumbnailUrl: "",
      viewerCount: 340,
      startedMinutesAgo: 22,
      isVerified: true,
      isDemo: true,
    },
  ].slice(0, limit);
}

export function describeCreatorError(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

// ── QA fixtures for the remaining creator API ────────────────────────────────
// The studio pages import these; without them the QA bundle fails to build.
// All are inert: they return empty results and never write anything.

export const LANGUAGES = ["Hindi", "English", "Odia", "Bengali"] as const;
export const SEASONS = ["Kharif", "Rabi", "Zaid"] as const;
export const VISIBILITIES = ["public", "unlisted", "private"] as const;

export async function getChannelById(id: string): Promise<CreatorProfile | null> {
  const all = await listTopChannels(20);
  return all.find((c) => c.id === id) ?? null;
}

export async function getChannelStats(): Promise<{ views: number; subscribers: number; watch_minutes: number }> {
  return { views: 184320, subscribers: 18200, watch_minutes: 294000 };
}

export async function getTopVideos(): Promise<Video[]> {
  return listMyVideos();
}

export async function getVideo(id: string): Promise<Video | null> {
  const all = await listVideos({});
  return all.find((v) => v.id === id) ?? null;
}

export async function listRelated(): Promise<Video[]> {
  return listVideos({});
}

export async function listComments(): Promise<{ id: string; body: string; author: string; created_at: string }[]> {
  return [];
}

export function listCommentsForCreator() {
  return listComments();
}

export async function addComment(): Promise<void> {}
export async function editComment(): Promise<void> {}
export async function deleteComment(): Promise<void> {}
export async function hideComment(): Promise<void> {}
export async function markNotificationRead(): Promise<void> {}
export async function recordView(): Promise<void> {}
export async function toggleLike(): Promise<void> {}
export async function toggleSave(): Promise<void> {}
export async function hasLiked(): Promise<boolean> {
  return false;
}
export async function hasSaved(): Promise<boolean> {
  return false;
}
export async function saveChannel(): Promise<void> {}
export async function createVideoDraft(): Promise<{ id: string } | null> {
  return null;
}
export async function publishVideo(): Promise<void> {}
