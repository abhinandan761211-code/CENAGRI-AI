import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock,
  Compass,
  Flame,
  Play,
  Search,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Users,
} from "lucide-react";
import CreatorShell from "@/components/creator/CreatorShell";
import VideoCard from "@/components/creator/VideoCard";
import { CreatorEmpty, CreatorError, CreatorLoading } from "@/components/creator/CreatorShell";
import {
  CATEGORY_FALLBACK,
  compactCount,
  listFollowingFeed,
  listLikedVideos,
  listSavedVideos,
  listTopChannels,
  listVideos,
} from "@/lib/creator";
import type { CreatorProfile, Video, VideoCategory } from "@/lib/creator";
import { listCategories } from "@/lib/creator";

type Tab = "home" | "trending" | "latest" | "following" | "saved" | "liked";

const TABS: { key: Tab; label: string; icon: typeof Compass }[] = [
  { key: "home", label: "Home", icon: Compass },
  { key: "trending", label: "Trending", icon: Flame },
  { key: "latest", label: "Latest", icon: Sparkles },
  { key: "following", label: "Following", icon: Users },
  { key: "saved", label: "Watch Later", icon: Clock },
  { key: "liked", label: "Liked", icon: ThumbsUp },
];

const PAGE_SIZE = 24;

/**
 * Kisan Video Hub — the public discovery page every role can use.
 *
 * Feeds are paginated (24 at a time) and filtered on the server, so the
 * browser never downloads the whole catalogue. Search covers titles,
 * descriptions, crop names and districts.
 */
export default function VideoHub() {
  const [tab, setTab] = useState<Tab>("home");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [videos, setVideos] = useState<Video[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);

  const [cats, setCats] = useState<VideoCategory[]>(
    CATEGORY_FALLBACK.map((c, i) => ({ ...c, sort_order: i }))
  );
  const [channels, setChannels] = useState<CreatorProfile[]>([]);

  useEffect(() => {
    listCategories().then(setCats).catch(() => undefined);
    listTopChannels(6).then(setChannels).catch(() => undefined);
  }, []);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      setState(replace ? "loading" : state);
      setError("");
      try {
        let rows: Video[] = [];
        if (tab === "following") {
          rows = nextPage === 0 ? await listFollowingFeed(0) : [];
        } else if (tab === "saved") {
          rows = nextPage === 0 ? await listSavedVideos() : [];
        } else if (tab === "liked") {
          rows = nextPage === 0 ? await listLikedVideos() : [];
        } else {
          rows = await listVideos({
            page: nextPage,
            pageSize: PAGE_SIZE,
            category,
            search: search.trim() || undefined,
            sort: tab === "trending" ? "trending" : "latest",
          });
        }

        setVideos((prev) => (replace ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
        setState("ready");
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Could not load videos.");
      }
    },
    [tab, category, search, state]
  );

  // A new filter resets to the first page.
  useEffect(() => {
    setPage(0);
    void load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category]);

  const onSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(0);
      void load(0, true);
    },
    [load]
  );

  function loadMore() {
    const next = page + 1;
    setPage(next);
    void load(next, false);
  }

  const shorts = useMemo(() => videos.filter((v) => v.kind === "short").slice(0, 8), [videos]);

  return (
    <CreatorShell
      onSearch={onSearch}
      searchPlaceholder="Search videos, crops, districts…"
      title="Kisan Video Hub"
      subtitle="Farming videos, Shorts and mandi updates from creators across India"
    >
      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`creator-chip ${tab === key ? "is-active" : ""}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Category rail */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategory(null)}
          aria-pressed={category === null}
          className={`creator-chip ${category === null ? "is-active" : ""}`}
        >
          All
        </button>
        {cats.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setCategory(c.slug === category ? null : c.slug)}
            aria-pressed={category === c.slug}
            className={`creator-chip ${category === c.slug ? "is-active" : ""}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {state === "error" && <CreatorError message={error} onRetry={() => void load(0, true)} />}

      {/* Shorts strip (only when there are some) */}
      {shorts.length > 0 && tab === "home" && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
            <Play className="h-4 w-4 text-[#16C784]" /> Kisan Shorts
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {shorts.map((video) => (
              <div key={video.id} className="w-32 shrink-0">
                <VideoCard video={video} variant="compact" />
              </div>
            ))}
          </div>
        </section>
      )}

      {state === "loading" && <CreatorLoading label="Loading videos…" />}

      {state === "ready" && videos.length === 0 && (
        <div className="creator-card">
          <CreatorEmpty
            icon={TrendingUp}
            title={
              tab === "following"
                ? "You are not following anyone yet"
                : tab === "saved"
                  ? "Nothing saved yet"
                  : tab === "liked"
                    ? "No liked videos yet"
                    : "No videos here yet"
            }
            description={
              tab === "following"
                ? "Subscribe to a creator and their new videos will appear here."
                : tab === "saved"
                  ? "Videos you save will be waiting for you here."
                  : tab === "liked"
                    ? "Videos you like will be listed here."
                    : search
                      ? `Nothing matches “${search}”. Try another crop or district.`
                      : "When creators publish farming videos they appear here. This hub is empty until then."
            }
          />
        </div>
      )}

      {state === "ready" && videos.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {hasMore && (tab === "home" || tab === "trending" || tab === "latest") && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="creator-btn-ghost h-9 px-5 text-xs"
              >
                Load more videos
              </button>
            </div>
          )}
        </>
      )}

      {/* Popular creators */}
      {channels.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
            <Users className="h-4 w-4 text-[#16C784]" /> Popular creators
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {channels.map((channel) => (
              <a
                key={channel.id}
                href={`/channel/${channel.id}`}
                className="creator-card creator-card-hover flex w-40 shrink-0 flex-col items-center p-4 text-center"
              >
                <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-[#16C784]/15 text-lg font-bold text-[#16C784]">
                  {channel.avatar_url ? (
                    <img src={channel.avatar_url} alt="" className="h-14 w-14 object-cover" />
                  ) : (
                    channel.channel_name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="mt-2 line-clamp-2 text-[12px] font-semibold text-white">
                  {channel.channel_name}
                </span>
                <span className="mt-0.5 text-[10px] text-slate-400">
                  {compactCount(channel.subscriber_count)} subscribers
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-500">
        <Search className="h-3 w-3" />
        Search covers titles, descriptions, crops and districts
      </p>
    </CreatorShell>
  );
}
