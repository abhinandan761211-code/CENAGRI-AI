import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Heart, MessageCircle, Plus, Share2, UserPlus, Volume2, VolumeX } from "lucide-react";
import CreatorShell, { CreatorEmpty, CreatorLoading } from "@/components/creator/CreatorShell";
import { useAuth } from "@/hooks/useAuth";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import {
  addComment,
  compactCount,
  listShorts,
  recordView,
  timeAgo,
  toggleLike,
  toggleSave,
  toggleSubscribe,
} from "@/lib/creator";
import type { Video } from "@/lib/creator";
import { Link } from "react-router-dom";
import { CREATOR_ROUTES } from "@/components/creator/CreatorShell";

/**
 * Kisan Shorts — vertical, one-per-screen, snap scrolling.
 *
 * Only the video in view plays; the others stay paused and muted, so a long
 * feed does not download and decode every file at once.
 */
export default function CreatorShorts() {
  const { user } = useAuth();
  const { canCreate } = useCreatorChannel();
  const [shorts, setShorts] = useState<Video[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [subscribed, setSubscribed] = useState<Record<string, boolean>>({});
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refs = useRef<(HTMLVideoElement | null)[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setShorts(await listShorts(20));
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not load shorts.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Play only the active short; pause everything else.
  useEffect(() => {
    refs.current.forEach((el, index) => {
      if (!el) return;
      if (index === active) {
        void el.play().catch(() => undefined);
        if (user) void recordView(shorts[index]?.id ?? "", 0, false).catch(() => undefined);
      } else {
        el.pause();
        el.currentTime = 0;
      }
    });
  }, [active, shorts, user]);

  async function like(video: Video) {
    const next = !liked[video.id];
    setLiked((s) => ({ ...s, [video.id]: next }));
    try {
      await toggleLike(video.id, Boolean(liked[video.id]));
    } catch {
      setLiked((s) => ({ ...s, [video.id]: !next }));
    }
  }

  async function save(video: Video) {
    const next = !saved[video.id];
    setSaved((s) => ({ ...s, [video.id]: next }));
    try {
      await toggleSave(video.id, Boolean(saved[video.id]));
    } catch {
      setSaved((s) => ({ ...s, [video.id]: !next }));
    }
  }

  async function follow(video: Video) {
    const next = !subscribed[video.creator_id];
    setSubscribed((s) => ({ ...s, [video.creator_id]: next }));
    try {
      await toggleSubscribe(video.creator_id, Boolean(subscribed[video.creator_id]));
    } catch {
      setSubscribed((s) => ({ ...s, [video.creator_id]: !next }));
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentFor || !draft.trim()) return;
    try {
      await addComment(commentFor, draft.trim());
      setDraft("");
      setCommentFor(null);
    } catch {
      /* the composer simply stays open */
    }
  }

  return (
    <CreatorShell
      title="Shorts"
      subtitle="Vertical farming tips, one swipe at a time"
      action={
        canCreate ? (
          <Link to={CREATOR_ROUTES.upload} className="creator-btn-primary h-9 px-4 text-xs">
            <Plus className="h-3.5 w-3.5" /> New short
          </Link>
        ) : undefined
      }
    >
      {state === "loading" && <CreatorLoading label="Loading shorts…" />}

      {state === "error" && (
        <div className="creator-card p-6 text-center text-xs text-rose-300">{error}</div>
      )}

      {state === "ready" && shorts.length === 0 && (
        <div className="creator-card">
          <CreatorEmpty
            icon={Plus}
            title="No shorts yet"
            description="Upload a vertical video and mark it as a Short — it will appear here and in the hub's shorts strip."
            action={
              canCreate ? (
                <Link to={CREATOR_ROUTES.upload} className="creator-btn-primary h-9 px-4 text-xs">
                  Upload a short
                </Link>
              ) : undefined
            }
          />
        </div>
      )}

      {state === "ready" && shorts.length > 0 && (
        <section className="flex justify-center">
          <div
            className="shorts-scroller h-[calc(100vh-11rem)] w-full max-w-[420px] snap-y overflow-y-scroll rounded-xl bg-black"
            onScroll={(e) => {
              const el = e.currentTarget;
              const index = Math.round(el.scrollTop / el.clientHeight);
              if (index !== active) setActive(index);
            }}
          >
            {shorts.map((video, index) => (
              <div
                key={video.id}
                className="shorts-slide relative flex h-full w-full items-center justify-center"
              >
                {index === active && video.video_url ? (
                  <video
                    ref={(el) => {
                      refs.current[index] = el;
                    }}
                    src={video.video_url}
                    poster={video.thumbnail_url ?? undefined}
                    loop
                    playsInline
                    muted={muted}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <img
                    src={video.thumbnail_url ?? ""}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover opacity-60"
                  />
                )}

                {/* Overlay: creator + title */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/channel/${video.creator_id}`}
                      className="pointer-events-auto grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-[#16C784] text-[10px] font-bold text-[#0B1020]"
                    >
                      {(video.creator?.channel_name ?? "CA").slice(0, 2).toUpperCase()}
                    </Link>
                    <Link
                      to={`/channel/${video.creator_id}`}
                      className="pointer-events-auto text-[12px] font-bold text-white"
                    >
                      {video.creator?.channel_name ?? "Creator"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void follow(video)}
                      className="pointer-events-auto ml-1 rounded border border-white/40 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-white/10"
                    >
                      {subscribed[video.creator_id] ? "Following" : "Follow"}
                    </button>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] font-semibold text-white">{video.title}</p>
                  <p className="text-[10px] text-white/70">
                    {compactCount(video.view_count)} views · {timeAgo(video.published_at)}
                  </p>
                  {video.tags && video.tags.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-[#2ED3B7]">
                      {video.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}
                    </p>
                  )}
                </div>

                {/* Right action rail */}
                <div className="absolute bottom-20 right-2 flex flex-col items-center gap-4">
                  <button type="button" onClick={() => void like(video)} className="flex flex-col items-center gap-0.5" aria-pressed={Boolean(liked[video.id])}>
                    <span className={`grid h-10 w-10 place-items-center rounded-full bg-black/50 ${liked[video.id] ? "text-rose-400" : "text-white"}`}>
                      <Heart className="h-5 w-5" fill={liked[video.id] ? "currentColor" : "none"} />
                    </span>
                    <span className="text-[10px] font-bold text-white">
                      {compactCount(video.like_count + (liked[video.id] ? 1 : 0))}
                    </span>
                  </button>

                  <button type="button" onClick={() => setCommentFor(video.id)} className="flex flex-col items-center gap-0.5">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <span className="text-[10px] font-bold text-white">
                      {compactCount(video.comment_count)}
                    </span>
                  </button>

                  <button type="button" onClick={() => void save(video)} className="flex flex-col items-center gap-0.5" aria-pressed={Boolean(saved[video.id])}>
                    <span className={`grid h-10 w-10 place-items-center rounded-full bg-black/50 ${saved[video.id] ? "text-[#16C784]" : "text-white"}`}>
                      <Bookmark className="h-5 w-5" fill={saved[video.id] ? "currentColor" : "none"} />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`${window.location.origin}/watch/${video.id}`);
                    }}
                    className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white"
                    aria-label="Share"
                  >
                    <Share2 className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white"
                    aria-label={muted ? "Unmute" : "Mute"}
                  >
                    {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => void follow(video)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-[#16C784] text-[#0B1020]"
                    aria-label="Follow creator"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {commentFor && (
        <form onSubmit={submitComment} className="creator-card flex gap-2 p-3">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment…"
            className="creator-input"
          />
          <button type="submit" disabled={!draft.trim()} className="creator-btn-primary h-9 px-4 text-xs">
            Send
          </button>
          <button
            type="button"
            onClick={() => setCommentFor(null)}
            className="creator-btn-ghost h-9 px-3 text-xs"
          >
            Cancel
          </button>
        </form>
      )}
    </CreatorShell>
  );
}
