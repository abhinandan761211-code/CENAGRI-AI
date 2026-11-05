import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Compass,
  Flame,
  History,
  ListVideo,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Sprout,
  ThumbsUp,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CREATOR_ROUTES,
  CreatorEmpty,
  CreatorError,
  HUB_NAV,
  HUB_ROUTE,
  type ShellSearch,
} from "@/components/creator/CreatorShell";
import VideoCard from "@/components/creator/VideoCard";
import ShortsCard from "@/components/creator/ShortsCard";
import LiveCard from "@/components/creator/LiveCard";
import {
  CATEGORY_FALLBACK,
  categoryLabel,
  compactCount,
  listCategories,
  listFollowingFeed,
  listLikedVideos,
  listLiveStreams,
  listSavedVideos,
  listShorts,
  listTopChannels,
  listVideos,
} from "@/lib/creator";
import type { CreatorProfile, LiveStream, Video, VideoCategory } from "@/lib/creator";

/**
 * The watch side of Kisan Video Hub.
 *
 * Watching and creating are one product — whoever can watch a video can also
 * publish one — so this feed is not its own page any more. It is a component
 * that the single `/video-hub` page mounts, and the page decides whether the
 * watch feed or the create panel is on screen.
 *
 * The active tab, the search term and the category live in the URL (`?tab=`,
 * `?q=`, `?category=`), so sidebar entries, shared links and Back all keep
 * working.
 */

export type WatchTab =
  | "home"
  | "trending"
  | "following"
  | "saved"
  | "liked"
  | "history"
  | "playlists";

const PAGE_SIZE = 24;
const SHORTS_LIMIT = 10;

const TAB_TITLES: Record<WatchTab, { title: string; subtitle: string }> = {
  home: { title: "Kisan Video Hub", subtitle: "" },
  trending: { title: "Trending videos", subtitle: "What farmers are watching most this week" },
  following: { title: "Following", subtitle: "New uploads from the creators you follow" },
  saved: { title: "Saved videos", subtitle: "Everything you kept for later" },
  liked: { title: "Liked videos", subtitle: "Videos you found useful" },
  history: { title: "Watch history", subtitle: "Pick up where you left off" },
  playlists: { title: "Playlists", subtitle: "Grouped learning, crop by crop" },
};

const isTab = (value: string | null): value is WatchTab =>
  Boolean(value) && value !== null && value in TAB_TITLES;

/** Page heading for the current tab, used by the shell's title bar. */
export function watchTabTitle(tab: string | null) {
  return isTab(tab) ? TAB_TITLES[tab] : TAB_TITLES.home;
}

/** One skeleton tile — shaped like a card so the layout does not jump. */
function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video rounded-xl bg-white/[0.06]" />
      <div className="mt-2 h-3 w-4/5 rounded bg-white/[0.06]" />
      <div className="mt-1.5 h-2.5 w-1/2 rounded bg-white/[0.05]" />
    </div>
  );
}

/** A titled horizontal section shared by Live and Shorts. */
function Rail({
  id,
  icon,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-heading`} className="scroll-mt-20">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id={`${id ?? title}-heading`}
            className="creator-section-title flex items-center gap-2 text-sm font-bold sm:text-base"
          >
            {icon}
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Popular searches shown under a focused, empty search box.
 *
 * These are search shortcuts, so they stay on the hub route with a query.
 */
export function useHubSuggestions(): ShellSearch[] {
  return useMemo<ShellSearch[]>(() => {
    const topic = (label: string, keywords: string): ShellSearch => ({
      label,
      keywords,
      to: `/video-hub?q=${encodeURIComponent(label)}`,
    });
    return [
      ...HUB_NAV.filter((n) => !["home", "categories", "studio"].includes(n.key)).map((n) => ({
        label: n.label,
        keywords: n.label,
        to: n.to,
      })),
      topic("Tomato farming", "tomato"),
      topic("Wheat production", "wheat"),
      topic("Drip irrigation", "irrigation"),
      topic("Organic fertilizer", "organic fertilizer"),
      topic("Crop disease", "disease"),
      topic("Tractor maintenance", "tractor"),
      topic("Mandi prices", "mandi price"),
      topic("Kisan credit card", "scheme subsidy"),
    ];
  }, []);
}

/**
 * Update one query parameter without stacking history entries.
 *
 * `keep` lists the keys that survive the change; a fresh search or tab switch
 * drops everything else so a page never carries a filter from a hidden tab.
 */
export function useHubParams() {
  const [params, setParams] = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null, keep: string[] = [key]) => {
      const next = new URLSearchParams(params);
      for (const k of Array.from(next.keys())) if (!keep.includes(k)) next.delete(k);
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  return { params, setParams, setParam };
}

export default function VideoHubFeed() {
  const { params, setParams, setParam } = useHubParams();

  const tabParam = params.get("tab");
  const tab: WatchTab = isTab(tabParam) ? tabParam : "home";
  const category = params.get("category");
  const search = params.get("q") ?? "";

  const [videos, setVideos] = useState<Video[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [shorts, setShorts] = useState<Video[]>([]);
  const [shortsState, setShortsState] = useState<"loading" | "ready" | "error">("loading");
  const [live, setLive] = useState<LiveStream[]>([]);

  const [cats, setCats] = useState<VideoCategory[]>(
    CATEGORY_FALLBACK.map((c, i) => ({ ...c, sort_order: i }))
  );
  const [channels, setChannels] = useState<CreatorProfile[]>([]);

  const shortsRail = useRef<HTMLDivElement | null>(null);
  const liveRail = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listCategories().then(setCats).catch(() => undefined);
    listTopChannels(6).then(setChannels).catch(() => undefined);
    listShorts(SHORTS_LIMIT)
      .then((rows) => {
        setShorts(rows);
        setShortsState("ready");
      })
      .catch(() => setShortsState("error"));
    listLiveStreams(4).then(setLive).catch(() => setLive([]));
  }, []);

  const load = useCallback(
    async (nextPage: number) => {
      if (nextPage === 0) setState("loading");
      else setLoadingMore(true);
      setError("");

      try {
        let rows: Video[];
        if (tab === "following") {
          rows = nextPage === 0 ? await listFollowingFeed(0) : [];
        } else if (tab === "saved") {
          rows = nextPage === 0 ? await listSavedVideos() : [];
        } else if (tab === "liked") {
          rows = nextPage === 0 ? await listLikedVideos() : [];
        } else if (tab === "home" || tab === "trending") {
          rows = await listVideos({
            page: nextPage,
            pageSize: PAGE_SIZE,
            category,
            search: search.trim() || undefined,
            kind: "video",
            sort: tab === "trending" ? "trending" : "latest",
          });
        } else {
          // History and playlists have no table behind them yet — never invent rows.
          rows = [];
        }

        setVideos((prev) => (nextPage === 0 ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
        setPage(nextPage);
        setState("ready");
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Could not load videos.");
      } finally {
        setLoadingMore(false);
      }
    },
    [tab, category, search]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  // Sidebar links such as `/video-hub#shorts` arrive before the target section
  // exists (the page is still loading), so scroll once the content is mounted.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab, state]);

  /**
   * Recommended row.
   *
   * Preference is a following-based feed, then trending videos the grid does
   * not already show. Deterministic demo-level ranking on real data — when a
   * recommender endpoint exists, swap the two calls below.
   */
  const [recommendedFeed, setRecommendedFeed] = useState<Video[]>([]);
  useEffect(() => {
    if (tab !== "home" || search.trim()) return;
    let alive = true;
    listFollowingFeed(0)
      .then((rows) => (rows.length > 0 ? rows : listVideos({ sort: "trending", kind: "video", pageSize: 8 })))
      .then((rows) => {
        if (alive) setRecommendedFeed(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tab, search]);

  const recommended = useMemo(() => {
    const onScreen = new Set(videos.map((v) => v.id));
    return recommendedFeed.filter((v) => !onScreen.has(v.id)).slice(0, 4);
  }, [recommendedFeed, videos]);

  function onSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    // A fresh search always returns to the main grid, whatever tab was open.
    if (!["home", "trending"].includes(tab)) next.delete("tab");
    setParams(next, { replace: true });
  }

  const activeCategoryLabel = category ? categoryLabel(category) : "All";
  const searching = search.trim().length > 0;
  const showSections = tab === "home" && !searching && !category;

  /* Which empty state to render, and what to offer next. */
  function emptyState() {
    if (searching) {
      return {
        icon: Search,
        title: `No videos match “${search}”`,
        description:
          "Try a crop name, a district, a farming topic or a hashtag. Search covers titles, descriptions, crops and districts.",
        action: (
          <button type="button" onClick={() => onSearch("")} className="creator-btn-ghost h-9 px-4 text-xs">
            Clear search
          </button>
        ),
      };
    }
    if (tab === "following") {
      return {
        icon: Users,
        title: "You are not following anyone yet",
        description: "Follow a creator and their new uploads will appear here first.",
      };
    }
    if (tab === "saved") {
      return {
        icon: Clock,
        title: "Nothing saved yet",
        description: "Tap Save on any video and it will wait for you here.",
      };
    }
    if (tab === "liked") {
      return {
        icon: ThumbsUp,
        title: "No liked videos yet",
        description: "Videos you like are collected here so you can find them again.",
      };
    }
    if (tab === "history") {
      return {
        icon: History,
        title: "Watch history is not available yet",
        description:
          "Kalika does not store your viewing history on the server. Individual views are counted, but not attributed to your account.",
      };
    }
    if (tab === "playlists") {
      return {
        icon: ListVideo,
        title: "Playlists are not available yet",
        description: "Saved videos work today; grouping them into playlists is still to come.",
      };
    }
    if (category) {
      return {
        icon: Sprout,
        title: `No videos in ${activeCategoryLabel} yet`,
        description: "Creators have not published in this category. Try another one, or browse all videos.",
        action: (
          <button
            type="button"
            onClick={() => setParam("category", null)}
            className="creator-btn-ghost h-9 px-4 text-xs"
          >
            Show all categories
          </button>
        ),
      };
    }
    return {
      icon: Sprout,
      title: "The hub is empty for now",
      description: "When creators publish farming videos they appear here. Follow a creator to be ready.",
      action: (
        <Link to={CREATOR_ROUTES.upload} className="creator-btn-primary h-9 px-4 text-xs">
          Upload the first video
        </Link>
      ),
    };
  }

  const empty = emptyState();

  return (
    <>
      {/* ── Category chips ── */}
      <div id="categories" className="scroll-mt-20">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setParam("category", null)}
            aria-pressed={category === null}
            className={`creator-chip ${category === null ? "is-active" : ""}`}
          >
            <Compass className="h-3.5 w-3.5" />
            All
          </button>
          {cats.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setParam("category", c.slug === category ? null : c.slug)}
              aria-pressed={category === c.slug}
              className={`creator-chip ${category === c.slug ? "is-active" : ""}`}
            >
              {categoryLabel(c.slug)}
            </button>
          ))}
        </div>
      </div>

      {/* Active search / filter bar */}
      {(searching || category) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--cr-border)] bg-[var(--cr-card)] px-3 py-2">
          <span className="text-[11px] font-semibold text-slate-300">
            {tab === "following" || tab === "saved" || tab === "liked" ? "Showing" : "Results for"}
          </span>
          {searching && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--cr-green)]/15 px-2.5 py-1 text-[11px] font-bold text-[var(--cr-green)]"
            >
              “{search}”
              <X className="h-3 w-3" />
            </button>
          )}
          {category && (
            <button
              type="button"
              onClick={() => setParam("category", null)}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-200"
            >
              {activeCategoryLabel}
              <X className="h-3 w-3" />
            </button>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
            <RefreshCw className={`h-3 w-3 ${state === "loading" ? "animate-spin" : ""}`} />
            {state === "loading" ? "Searching…" : `${videos.length} video${videos.length === 1 ? "" : "s"}`}
          </span>
        </div>
      )}

      {state === "error" && <CreatorError message={error} onRetry={() => void load(0)} />}

      {/* ── Live now (demo data) ── */}
      {showSections && live.length > 0 && (
        <Rail
          id="live"
          icon={<Radio className="h-4 w-4 text-rose-400" />}
          title="Live now"
          description="Sample sessions — live broadcasting is not enabled yet"
          action={
            <div className="flex gap-1.5">
              <button
                type="button"
                aria-label="Scroll live sessions left"
                onClick={() => liveRail.current?.scrollBy({ left: -320, behavior: "smooth" })}
                className="creator-btn-ghost h-7 w-7"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Scroll live sessions right"
                onClick={() => liveRail.current?.scrollBy({ left: 320, behavior: "smooth" })}
                className="creator-btn-ghost h-7 w-7"
              >
                ›
              </button>
            </div>
          }
        >
          <div
            ref={liveRail}
            className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {live.map((stream) => (
              <div key={stream.id} className="w-[260px] shrink-0 sm:w-[300px]">
                <LiveCard stream={stream} />
              </div>
            ))}
          </div>
        </Rail>
      )}

      {/* ── Shorts ── */}
      {showSections && (
        <Rail
          id="shorts"
          icon={<Play className="h-4 w-4 text-[var(--cr-green)]" />}
          title="Kisan Shorts"
          description="Quick tips in under a minute"
          action={
            shorts.length > 0 ? (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-label="Scroll Shorts left"
                  onClick={() => shortsRail.current?.scrollBy({ left: -400, behavior: "smooth" })}
                  className="creator-btn-ghost h-7 w-7"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Scroll Shorts right"
                  onClick={() => shortsRail.current?.scrollBy({ left: 400, behavior: "smooth" })}
                  className="creator-btn-ghost h-7 w-7"
                >
                  ›
                </button>
              </div>
            ) : undefined
          }
        >
          {shortsState === "loading" && (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-[124px] shrink-0 animate-pulse sm:w-[148px]">
                  <div className="aspect-[9/16] rounded-xl bg-white/[0.06]" />
                  <div className="mt-1.5 h-2.5 w-4/5 rounded bg-white/[0.05]" />
                </div>
              ))}
            </div>
          )}

          {shortsState === "error" && (
            <p className="rounded-xl border border-[var(--cr-border)] bg-[var(--cr-card)] px-4 py-6 text-center text-[11px] text-slate-400">
              Shorts could not be loaded.{" "}
              <button
                type="button"
                onClick={() => {
                  setShortsState("loading");
                  listShorts(SHORTS_LIMIT)
                    .then((rows) => {
                      setShorts(rows);
                      setShortsState("ready");
                    })
                    .catch(() => setShortsState("error"));
                }}
                className="font-bold text-[var(--cr-green)] underline"
              >
                Try again
              </button>
            </p>
          )}

          {shortsState === "ready" && shorts.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--cr-border)] px-4 py-8 text-center text-[11px] text-slate-400">
              No Shorts yet. Creators can upload vertical videos from the Create tab.
            </p>
          )}

          {shortsState === "ready" && shorts.length > 0 && (
            <div
              ref={shortsRail}
              className="flex gap-3 overflow-x-auto pb-1 [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {shorts.map((video) => (
                <ShortsCard key={video.id} video={video} />
              ))}
            </div>
          )}
        </Rail>
      )}

      {/* ── Main grid ── */}
      <section aria-labelledby="grid-heading" className="scroll-mt-20">
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
          <h2 id="grid-heading" className="creator-section-title flex items-center gap-2 text-sm font-bold sm:text-base">
            {tab === "trending" ? (
              <Flame className="h-4 w-4 text-orange-400" />
            ) : tab === "following" ? (
              <Users className="h-4 w-4 text-[var(--cr-green)]" />
            ) : (
              <Sparkles className="h-4 w-4 text-[var(--cr-green)]" />
            )}
            {tab === "home"
              ? category
                ? activeCategoryLabel
                : searching
                  ? `Search: ${search}`
                  : "Latest farming videos"
              : TAB_TITLES[tab].title}
          </h2>
          <span className="text-[11px] text-slate-500">
            {category ? `Filtered to ${activeCategoryLabel}` : "From creators across India"}
          </span>
        </div>

        {state === "loading" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {state === "ready" && videos.length === 0 && (
          <div className="rounded-xl border border-[var(--cr-border)] bg-[var(--cr-card)]">
            <CreatorEmpty
              icon={empty.icon}
              title={empty.title}
              description={empty.description}
              action={empty.action}
            />
          </div>
        )}

        {state === "ready" && videos.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {videos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => void load(page + 1)}
                  disabled={loadingMore}
                  className="creator-btn-ghost h-9 px-5 text-xs"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </>
                  ) : (
                    "Load more videos"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Recommended + creators (home only) ── */}
      {showSections && (
        <>
          <Rail
            id="recommended"
            icon={<TrendingUp className="h-4 w-4 text-[var(--cr-green)]" />}
            title="Recommended for you"
            description="Popular with farmers nearby — pick a crop or category above to tune this"
          >
            {recommended.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--cr-border)] px-4 py-8 text-center text-[11px] text-slate-400">
                Recommendations will appear once the hub has a few videos.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {recommended.map((video) => (
                  <VideoCard key={`rec-${video.id}`} video={video} />
                ))}
              </div>
            )}
          </Rail>

          {channels.length > 0 && (
            <Rail
              icon={<Users className="h-4 w-4 text-[var(--cr-green)]" />}
              title="Creators to follow"
              description="Verified agronomists, farmers and equipment experts"
            >
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {channels.map((c) => (
                  <Link
                    key={c.id}
                    to={`/channel/${c.id}`}
                    className="creator-card creator-card-hover flex w-40 shrink-0 flex-col items-center p-4 text-center"
                  >
                    <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-[var(--cr-green)]/15 text-lg font-bold text-[var(--cr-green)]">
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt="" className="h-14 w-14 object-cover" />
                      ) : (
                        c.channel_name.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="mt-2 line-clamp-2 text-[12px] font-semibold text-slate-800">
                      {c.channel_name}
                    </span>
                    <span className="mt-0.5 text-[10px] text-slate-400">
                      {compactCount(c.subscriber_count)} followers
                    </span>
                  </Link>
                ))}
              </div>
            </Rail>
          )}
        </>
      )}

      <p className="flex flex-wrap items-center justify-center gap-1.5 pt-2 text-center text-[11px] text-slate-500">
        <Search className="h-3 w-3" />
        Search covers titles, descriptions, crops, districts and hashtags
        <span className="text-slate-700">·</span>
        <Link
          to={`${HUB_ROUTE}?mode=create`}
          className="font-semibold text-[var(--cr-green)] hover:underline"
        >
          Open the Create tab
        </Link>
      </p>
    </>
  );
}
