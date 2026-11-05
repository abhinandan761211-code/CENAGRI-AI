import { Radio } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import CreatorShell from "@/components/creator/CreatorShell";
import CreatorHomePanel from "@/components/creator/CreatorHomePanel";
import VideoHubFeed, {
  useHubParams,
  useHubSuggestions,
  watchTabTitle,
  type WatchTab,
} from "@/components/creator/VideoHubFeed";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import { useCreatorMode } from "@/hooks/useCreatorMode";

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
  const { channel } = useCreatorChannel();
  const suggestions = useHubSuggestions();
  const { enabled: creatorMode } = useCreatorMode();

  const requested: Mode = isMode(params.get("mode")) ? (params.get("mode") as Mode) : "watch";
  /**
   * Watching is open to every account; publishing needs Creator Mode. A link
   * that asks for `?mode=create` without it still loads the hub, just on the
   * watch feed — the page never dead-ends behind a permission error.
   */
  const mode: Mode = requested === "create" && !creatorMode ? "watch" : requested;
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
      /*
       * Deliberately no header actions and no Watch/Create tab strip here.
       *
       * The navbar already carries Create content and My Videos, and the rail
       * carries Creator Studio, so repeating them on the page gave three
       * competing "what do I click" buttons above the content. `mode` is read
       * from the URL (?mode=create), so the page still opens in the right mode
       * when reached from the navbar — the buttons were never the mechanism,
       * only a duplicate.
       */
    >
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
