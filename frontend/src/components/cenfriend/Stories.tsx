import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { Avatar } from "@/components/cenfriend/ui";
import { markStoryViewed } from "@/lib/social";
import type { Story, StoryTray } from "@/lib/social";

/**
 * The story bar and the story viewer.
 *
 * Modelled on Instagram's tray for one reason that matters in a rural context:
 * it is the only part of the app that lets someone *show* a crop, a pest or a
 * tag on a plant without writing a caption first. The video and photo paths
 * are the same components used by the feed, so a story never introduces a
 * different media pipeline.
 *
 * Viewed state is stored per (story, viewer) and also mirrored locally, so the
 * ring greys out immediately on a slow connection and is corrected once the
 * server acknowledges the view.
 */

const RING_LIVE = "bg-gradient-to-tr from-brand-600 via-teal-400 to-amber-300";
const RING_SEEN = "bg-slate-200";

function ringClass(seen: boolean) {
  return `block rounded-full p-[2.5px] ${seen ? RING_SEEN : RING_LIVE}`;
}

/* ── Tray ─────────────────────────────────────────────────────────────── */

export function StoryBar({
  trays,
  loading,
  onOpen,
  onAdd,
}: {
  trays: StoryTray[];
  loading?: boolean;
  onOpen: (index: number) => void;
  onAdd?: () => void;
}) {
  if (loading) {
    return (
      <section aria-label="Stories" className="creator-card flex gap-4 overflow-hidden px-4 py-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5" aria-hidden="true">
            <span className="h-16 w-16 animate-pulse rounded-full bg-slate-200/80" />
            <span className="h-2 w-12 animate-pulse rounded bg-slate-200/80" />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section aria-label="Stories" className="creator-card overflow-hidden">
      <div className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-none">
        {/* Add your story */}
        <button
          type="button"
          onClick={onAdd}
          className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5"
        >
          <span className="relative grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-brand-300 bg-brand-50 text-brand-700 transition group-hover:border-brand-500 group-hover:bg-brand-100">
            <Plus className="h-6 w-6" strokeWidth={2.4} />
          </span>
          <span className="w-full truncate text-center text-[10px] font-semibold text-slate-600">Your story</span>
        </button>

        {trays.map((tray, index) => (
          <button
            key={tray.user.id}
            type="button"
            onClick={() => onOpen(index)}
            className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5"
            aria-label={`View ${tray.user.full_name ?? tray.user.username ?? "story"}'s story${tray.all_viewed ? " (seen)" : ""}`}
          >
            <span className={`relative ${ringClass(tray.all_viewed)}`}>
              <span className="block rounded-full bg-white p-[2px]">
                <Avatar person={tray.user} size="lg" className="!h-[56px] !w-[56px]" />
              </span>
              {tray.stories.length > 1 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-forest px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {tray.stories.length}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-[10px] font-semibold text-slate-700">
              {tray.is_me ? "Your story" : tray.user.username ?? tray.user.full_name ?? "Story"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── Viewer ───────────────────────────────────────────────────────────── */

export function StoryViewer({
  tray,
  onClose,
  onNextTray,
  onPrevTray,
  onViewed,
}: {
  tray: StoryTray;
  onClose: () => void;
  onNextTray: () => void;
  onPrevTray: () => void;
  onViewed?: (storyId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Record<string, boolean>>(
    Object.fromEntries(tray.stories.map((s) => [s.id, s.viewed]))
  );
  const story: Story | undefined = tray.stories[index];

  const markSeen = useCallback(
    (id: string) => {
      setSeen((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
      onViewed?.(id);
      // Fire-and-forget: the ring is already grey locally, and a failed view
      // record is not worth an error dialog over a photo.
      markStoryViewed(id).catch(() => undefined);
    },
    [onViewed]
  );

  useEffect(() => {
    if (story) markSeen(story.id);
  }, [story, markSeen]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 < tray.stories.length) return i + 1;
      onNextTray();
      return i;
    });
  }, [tray.stories.length, onNextTray]);

  const prev = useCallback(() => {
    setIndex((i) => {
      if (i > 0) return i - 1;
      onPrevTray();
      return i;
    });
  }, [onPrevTray]);

  // Reset to the first story when the viewer moves to another account's tray.
  useEffect(() => {
    setIndex(0);
    setSeen(Object.fromEntries(tray.stories.map((s) => [s.id, s.viewed])));
  }, [tray]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, next, prev]);

  if (!story) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${tray.user.full_name ?? "Story"} — story ${index + 1} of ${tray.stories.length}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
    >
      {/* Progress ticks */}
      <div className="mx-auto flex w-full max-w-[440px] gap-1 px-3 pt-3">
        {tray.stories.map((s, i) => (
          <span
            key={s.id}
            className={`h-0.5 flex-1 rounded-full ${i < index || (i === index && seen[s.id]) ? "bg-white" : "bg-white/30"}`}
          />
        ))}
      </div>

      <header className="mx-auto flex w-full max-w-[440px] items-center gap-2.5 px-3 py-2.5">
        <Avatar person={tray.user} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/cenfriend/u/${tray.user.id}`}
            className="block truncate text-xs font-bold text-white hover:underline"
          >
            {tray.user.full_name ?? tray.user.username ?? "Kalika member"}
          </Link>
          <p className="text-[10px] text-white/60">{new Date(story.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stories"
          className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-[440px] flex-1 items-center">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous story"
          className="absolute left-0 top-0 z-10 h-full w-1/3 cursor-pointer"
        />
        {story.video_url ? (
          <video
            key={story.id}
            src={story.video_url}
            controls
            autoPlay
            playsInline
            className="max-h-full w-full object-contain"
          />
        ) : (
          <img
            key={story.id}
            src={story.media_urls[0]}
            alt={story.caption ?? "Story"}
            className="max-h-full w-full object-contain"
          />
        )}
        <button
          type="button"
          onClick={next}
          aria-label="Next story"
          className="absolute right-0 top-0 z-10 h-full w-1/3 cursor-pointer"
        />

        <button
          type="button"
          onClick={prev}
          aria-label="Previous story"
          className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/30 sm:grid"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next story"
          className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/30 sm:grid"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {(story.caption || story.crop) && (
        <div className="mx-auto w-full max-w-[440px] px-4 pb-6 pt-3">
          {story.crop && (
            <span className="mr-1 rounded bg-brand-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">{story.crop}</span>
          )}
          {story.caption && <p className="mt-1 text-sm text-white/90">{story.caption}</p>}
        </div>
      )}
    </div>
  );
}
