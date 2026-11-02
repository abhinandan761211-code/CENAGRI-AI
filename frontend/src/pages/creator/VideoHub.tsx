import { Clapperboard, Eye, Radio } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import CreatorShell, { CREATOR_ROUTES } from "@/components/creator/CreatorShell";
import CreatorHomePanel from "@/components/creator/CreatorHomePanel";
import VideoHubFeed, {
  useHubParams,
  useHubSuggestions,
  watchTabTitle,
  type WatchTab,
} from "@/components/creator/VideoHubFeed";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";

/**
 * Kisan Video Hub — ONE page for watching and creating.
 *
 * Watching and publishing were two separate screens that fetched the same data
 * twice, even though anyone who can watch a video here can also publish one.
 * They are now two modes of this page, switched by a single Watch / Create
 * toggle in the page header:
 *
 *   /video-hub            → Watch  (the discovery feed)
 *   /video-hub?mode=create → Create (my channel, uploads, performance)
 *
 * The mode lives in the URL so a link, a sidebar entry or Back lands on the same
 * view. `/creator` redirects here with `?mode=create` (see App.tsx), which keeps
 * every old bookmark working.
 */

type Mode = "watch" | "create";

const isMode = (value: string | null): value is Mode => value === "watch" || value === "create";

export default function VideoHub() {
  const [params] = useSearchParams();
  const { setParam } = useHubParams();
  const { channel, canCreate } = useCreatorChannel();
  const suggestions = useHubSuggestions();

  const mode: Mode = isMode(params.get("mode")) ? (params.get("mode") as Mode) : "watch";
  const tab = params.get("tab");
  const watchTitle = watchTabTitle(tab);

  function setMode(next: Mode) {
    // Keep the watch filters so switching back does not lose the current view.
    setParam("mode", next === "watch" ? null : "create", ["mode", "tab", "category", "q"]);
  }

  function onSearch(value: string) {
    const next = new URLSearchParams(params);
    next.delete("mode");
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    if (!["home", "trending"].includes(tab ?? "home")) next.delete("tab");
    setParam("q", value.trim() || null, Array.from(next.keys()));
  }

  const createTitle = channel
    ? `${channel.channel_name} · Create`
    : "Create content";

  return (
    <CreatorShell
      hub={mode === "watch"}
      onSearch={mode === "watch" ? onSearch : undefined}
      searchEntries={mode === "create" ? suggestions : undefined}
      suggestions={mode === "watch" ? suggestions : undefined}
      searchPlaceholder={
        mode === "watch"
          ? "Search videos, creators, crops, topics or #hashtags…"
          : "Search your videos and tools…"
      }
      title={mode === "watch" ? watchTitle.title : createTitle}
      subtitle={
        mode === "watch"
          ? watchTitle.subtitle
          : channel
            ? `Publishing to Kisan Video Hub · ${channel.video_count} videos · ${channel.subscriber_count} subscribers`
            : "Set up your channel to start publishing to Kisan Video Hub"
      }
      action={
        mode === "watch" ? (
          <button
            type="button"
            onClick={() => setMode("create")}
            className="creator-btn-primary h-9 px-4 text-xs"
          >
            <Clapperboard className="h-3.5 w-3.5" />
            {canCreate ? "Create content" : "Become a creator"}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link to={CREATOR_ROUTES.upload} className="creator-btn-primary h-9 px-4 text-xs">
              <Clapperboard className="h-3.5 w-3.5" />
              Upload video
            </Link>
            <button
              type="button"
              onClick={() => setMode("watch")}
              className="creator-btn-ghost h-9 px-3 text-xs"
            >
              <Eye className="h-3.5 w-3.5" />
              Watch videos
            </button>
          </div>
        )
      }
    >
      {/* ── Watch / Create: one page, two modes ── */}
      <div
        role="tablist"
        aria-label="Video hub mode"
        className="inline-flex rounded-xl border border-[var(--cr-border)] bg-[var(--cr-card)] p-1"
      >
        {(
          [
            { key: "watch", label: "Watch", icon: Eye },
            { key: "create", label: "Create", icon: Clapperboard },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`creator-chip ${mode === key ? "is-active" : ""}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === "watch" ? <VideoHubFeed /> : <CreatorHomePanel />}

      {mode === "create" && (
        <p className="flex flex-wrap items-center justify-center gap-1.5 pt-2 text-center text-[11px] text-slate-500">
          <Radio className="h-3 w-3" />
          Everything you publish here is visible on the Watch tab of this same hub.
        </p>
      )}
    </CreatorShell>
  );
}

/** Re-exported so older imports of the tab type keep type-checking. */
export type { WatchTab };
