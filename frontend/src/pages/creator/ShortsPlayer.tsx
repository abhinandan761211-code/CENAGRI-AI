import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Play,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import CreatorShell, { CreatorError, CreatorLoading } from "@/components/creator/CreatorShell";
import { useAuth } from "@/hooks/useAuth";
import {
  addComment,
  compactCount,
  getVideo,
  hasLiked,
  listComments,
  listShorts,
  recordView,
  timeAgo,
  toggleLike,
} from "@/lib/creator";
import type { Video, VideoComment } from "@/lib/creator";

/**
 * Shorts player — the vertical viewing experience.
 *
 * One Short fills the screen and neighbours are one wheel / swipe / click away.
 * Playback advances the list with the `?i=` index so a reload or a shared link
 * opens the same Short. Muted by default (browsers block autoplay with sound),
 * with an explicit tap-to-unmute.
 */
export default function ShortsPlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [queue, setQueue] = useState<Video[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [draft, setDraft] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    Promise.all([getVideo(id ?? ""), listShorts(12)])
      .then(([current, shorts]) => {
        if (!alive) return;
        if (!current) {
          setState("missing");
          return;
        }
        // Keep the opened Short first, then the rest of the feed in order.
        const rest = shorts.filter((s) => s.id !== current.id);
        setQueue([current, ...rest]);
        setState("ready");
        void listComments(current.id).then((rows) => alive && setComments(rows)).catch(() => undefined);
        if (user) void hasLiked(current.id).then((v) => alive && setLiked(v)).catch(() => undefined);
      })
      .catch((err) => {
        if (!alive) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Could not load this Short.");
      });
    return () => {
      alive = false;
    };
  }, [id, user]);

  const current = queue[0];
  const logged = useRef<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setPaused(false);
    setShowComments(false);
    setLikeCount(current.like_count);
    if (logged.current === current.id) return;
    logged.current = current.id;
    void recordView(current.id).catch(() => undefined);
  }, [current]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (queue.length < 2) return;
      // Advance inside the loaded queue; refetch the id only when at the end.
      const next = dir === 1 ? queue.slice(1) : queue.slice(-1).concat(queue.slice(0, -1));
      setQueue(next);
      navigate(`/shorts/${next[0].id}`, { replace: true });
    },
    [queue, navigate]
  );

  // Wheel and arrow keys move between Shorts, the way a vertical feed does.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") go(1);
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  async function handleLike() {
    if (!current) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((n) => n + (next ? 1 : -1));
    try {
      await toggleLike(current.id, liked);
    } catch {
      setLiked(liked);
      setLikeCount(current.like_count);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: current?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* dismissed */
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !draft.trim()) return;
    try {
      await addComment(current.id, draft.trim());
      setDraft("");
      setComments(await listComments(current.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the comment.");
    }
  }

  if (state === "loading") {
    return (
      <CreatorShell hub>
        <CreatorLoading label="Loading Short…" />
      </CreatorShell>
    );
  }

  if (state === "missing") {
    return (
      <CreatorShell hub title="Short unavailable">
        <div className="creator-card p-10 text-center">
          <p className="text-sm font-semibold text-white">This Short is not available</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            It may be private or removed by its creator.
          </p>
          <Link to="/video-hub#shorts" className="creator-btn-primary mt-4 h-9 px-4 text-xs">
            Back to Shorts
          </Link>
        </div>
      </CreatorShell>
    );
  }

  if (state === "error" || !current) {
    return (
      <CreatorShell hub>
        <CreatorError message={error} />
      </CreatorShell>
    );
  }

  const channel = current.creator;

  return (
    <CreatorShell hub>
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 lg:flex-row lg:items-start">
        {/* ── Player ── */}
        <div className="relative mx-auto w-full max-w-[380px] shrink-0">
          <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
            {current.video_url ? (
              <video
                ref={videoRef}
                key={current.id}
                src={current.video_url}
                poster={current.thumbnail_url ?? undefined}
                autoPlay
                muted={muted}
                loop
                playsInline
                className="h-full w-full object-cover"
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
              />
            ) : (
              <div className="relative h-full w-full">
                {current.thumbnail_url ? (
                  <img src={current.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center bg-gradient-to-br from-[#1b2740] to-[#0b1020]">
                    <Play className="h-10 w-10 text-slate-600" />
                  </div>
                )}
                <p className="absolute inset-x-0 bottom-16 text-center text-[10px] text-slate-400">
                  This Short has no video file attached.
                </p>
              </div>
            )}

            {current.video_url && (
              <button
                type="button"
                onClick={() => {
                  setMuted((m) => !m);
                  if (videoRef.current) videoRef.current.muted = !muted;
                }}
                aria-label={muted ? "Unmute" : "Mute"}
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}

            {!paused && current.video_url && (
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                Short
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={queue.length < 2}
              className="creator-btn-ghost h-8 px-3 text-[11px]"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <span className="text-[10px] text-slate-500">
              Arrow keys or scroll to move
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={queue.length < 2}
              className="creator-btn-ghost h-8 px-3 text-[11px]"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="creator-card p-4">
            <h1 className="text-base font-extrabold leading-snug text-white">{current.title}</h1>
            <p className="mt-1 text-[11px] text-slate-400">
              {compactCount(current.view_count)} views · {timeAgo(current.published_at)}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                to={`/channel/${current.creator_id}`}
                className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-3 hover:bg-white/10"
              >
                <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-[var(--cr-green)]/15 text-[11px] font-bold text-[var(--cr-green)]">
                  {channel?.avatar_url ? (
                    <img src={channel.avatar_url} alt="" className="h-8 w-8 object-cover" />
                  ) : (
                    (channel?.channel_name ?? "CA").slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="flex items-center gap-1 text-[12px] font-semibold text-white">
                  {channel?.channel_name ?? "Creator"}
                  {channel?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--cr-green)]" />}
                </span>
              </Link>

              <button
                type="button"
                onClick={() => void handleLike()}
                aria-pressed={liked}
                className={`creator-chip ${liked ? "is-active" : ""}`}
              >
                <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                {compactCount(likeCount)}
              </button>
              <button
                type="button"
                onClick={() => setShowComments((v) => !v)}
                aria-expanded={showComments}
                className={`creator-chip ${showComments ? "is-active" : ""}`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {comments.length}
              </button>
              <button type="button" onClick={() => void share()} className="creator-chip">
                <Share2 className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Share"}
              </button>
            </div>

            {current.description && (
              <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">
                {current.description}
              </p>
            )}

            {current.tags && current.tags.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {current.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/video-hub?q=${encodeURIComponent(tag)}`}
                    className="text-[11px] font-semibold text-[var(--cr-teal)] hover:underline"
                  >
                    #{tag}
                  </Link>
                ))}
              </p>
            )}
          </div>

          {showComments && (
            <div className="creator-card overflow-hidden">
              <div className="border-b border-[var(--cr-border)] px-4 py-2.5">
                <h2 className="text-sm font-bold text-white">
                  {comments.length} comment{comments.length === 1 ? "" : "s"}
                </h2>
              </div>
              {current.allow_comments ? (
                <>
                  <form onSubmit={submitComment} className="flex gap-2 border-b border-[var(--cr-border)] p-3">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Add a comment…"
                      className="creator-input"
                    />
                    <button type="submit" disabled={!draft.trim()} className="creator-btn-primary h-9 shrink-0 px-3 text-xs">
                      Post
                    </button>
                  </form>
                  {comments.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[11px] text-slate-500">
                      No comments yet. Ask the creator a question.
                    </p>
                  ) : (
                    <ul className="max-h-72 divide-y divide-[var(--cr-border)] overflow-y-auto">
                      {comments.map((c) => (
                        <li key={c.id} className="px-4 py-2.5">
                          <p className="text-[11px] font-semibold text-white">
                            {c.author_name}{" "}
                            <span className="font-normal text-slate-500">· {timeAgo(c.created_at)}</span>
                          </p>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-300">{c.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="px-4 py-6 text-center text-[11px] text-slate-500">
                  Comments are turned off for this Short.
                </p>
              )}
            </div>
          )}

          <p className="text-center text-[11px] text-slate-500 lg:text-left">
            <Link to="/video-hub#shorts" className="font-semibold text-[var(--cr-green)] hover:underline">
              Back to all Shorts
            </Link>
          </p>
        </div>
      </div>
    </CreatorShell>
  );
}
