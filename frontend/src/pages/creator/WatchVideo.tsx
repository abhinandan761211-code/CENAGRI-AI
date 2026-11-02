import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bookmark,
  Flag,
  MapPin,
  MessageCircle,
  Send,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import CreatorShell, {
  CreatorError,
  CreatorLoading,
} from "@/components/creator/CreatorShell";
import VideoCard from "@/components/creator/VideoCard";
import { useAuth } from "@/hooks/useAuth";
import {
  addComment,
  compactCount,
  deleteComment,
  editComment,
  getVideo,
  hasLiked,
  hasSaved,
  isSubscribed,
  listComments,
  listRelated,
  recordView,
  timeAgo,
  categoryLabel,
  toggleLike,
  toggleSave,
  toggleSubscribe,
} from "@/lib/creator";
import type { Video, VideoComment } from "@/lib/creator";

/**
 * Watch page.
 *
 * Plays the video from Storage, records a view once per mount, and offers
 * like / save / share / subscribe plus comments. Private videos are invisible
 * to non-owners because the query itself is filtered by RLS.
 */
export default function WatchVideo() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [video, setVideo] = useState<Video | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [error, setError] = useState("");

  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const viewLogged = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    setError("");
    try {
      const found = await getVideo(id);
      if (!found) {
        setState("missing");
        return;
      }
      setVideo(found);
      setState("ready");

      void listRelated(found).then(setRelated).catch(() => setRelated([]));
      void listComments(found.id).then(setComments).catch(() => setComments([]));

      if (user) {
        void hasLiked(found.id).then(setLiked).catch(() => undefined);
        void hasSaved(found.id).then(setSaved).catch(() => undefined);
        void isSubscribed(found.creator_id).then(setSubscribed).catch(() => undefined);
      }
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not load this video.");
    }
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // One view per mount — a reload counts again, a re-render does not.
  useEffect(() => {
    if (!video || viewLogged.current) return;
    viewLogged.current = true;
    void recordView(video.id).catch(() => undefined);
  }, [video]);

  async function handleLike() {
    if (!video) return;
    const next = !liked;
    setLiked(next);
    setVideo({ ...video, like_count: video.like_count + (next ? 1 : -1) });
    try {
      await toggleLike(video.id, liked);
    } catch {
      setLiked(liked);
      setVideo({ ...video, like_count: video.like_count });
    }
  }

  async function handleSave() {
    if (!video) return;
    const next = !saved;
    setSaved(next);
    try {
      await toggleSave(video.id, saved);
    } catch {
      setSaved(saved);
    }
  }

  async function handleSubscribe() {
    if (!video) return;
    const next = !subscribed;
    setSubscribed(next);
    try {
      await toggleSubscribe(video.creator_id, subscribed);
    } catch {
      setSubscribed(subscribed);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: video?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* the user dismissed the share sheet */
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!video || !draft.trim()) return;
    setCommentBusy(true);
    try {
      await addComment(video.id, draft.trim(), replyTo);
      setDraft("");
      setReplyTo(null);
      setComments(await listComments(video.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!video) return;
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteComment(commentId);
      setComments(await listComments(video.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the comment.");
    }
  }

  async function saveEdit(commentId: string, body: string) {
    if (!video) return;
    try {
      await editComment(commentId, body);
      setComments(await listComments(video.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not edit the comment.");
    }
  }

  if (state === "loading") {
    return (
      <CreatorShell>
        <CreatorLoading label="Loading video…" />
      </CreatorShell>
    );
  }

  if (state === "missing") {
    return (
      <CreatorShell title="Video unavailable">
        <div className="creator-card p-10 text-center">
          <p className="text-sm font-semibold text-white">This video is not available</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            It may be private, unlisted, or removed by its creator.
          </p>
          <Link to="/video-hub" className="creator-btn-primary mt-4 h-9 px-4 text-xs">
            Back to the Video Hub
          </Link>
        </div>
      </CreatorShell>
    );
  }

  if (state === "error" || !video) {
    return (
      <CreatorShell>
        <CreatorError message={error} onRetry={() => void load()} />
      </CreatorShell>
    );
  }

  const channel = video.creator;

  return (
    <CreatorShell hub>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Main ── */}
        <div className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-xl bg-black">
            {video.video_url ? (
              <video
                src={video.video_url}
                poster={video.thumbnail_url ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full"
              />
            ) : (
              <div className="grid aspect-video place-items-center">
                <p className="text-xs text-slate-400">This video has no file attached.</p>
              </div>
            )}
          </div>

          <h1 className="text-lg font-extrabold leading-snug text-white">{video.title}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-slate-400">
              {compactCount(video.view_count)} views · {timeAgo(video.published_at)}
            </p>

            {video.category && (
              <Link
                to={`/video-hub?category=${video.category}`}
                className="rounded-full bg-[var(--cr-green)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--cr-green)] hover:bg-[var(--cr-green)]/25"
              >
                {categoryLabel(video.category)}
              </Link>
            )}

            {video.crop_name && (
              <span className="rounded-full bg-[#2ED3B7]/10 px-2 py-0.5 text-[10px] font-bold text-[#2ED3B7]">
                {video.crop_name}
              </span>
            )}
            {video.season && (
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {video.season}
              </span>
            )}
            {(video.district || video.state) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                <MapPin className="h-2.5 w-2.5" />
                {[video.district, video.state].filter(Boolean).join(", ")}
              </span>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleLike()}
                aria-pressed={liked}
                className={`creator-chip ${liked ? "is-active" : ""}`}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                {compactCount(video.like_count)}
              </button>
              <button type="button" onClick={() => void handleSave()} aria-pressed={saved} className={`creator-chip ${saved ? "is-active" : ""}`}>
                <Bookmark className="h-3.5 w-3.5" />
                {saved ? "Saved" : "Save"}
              </button>
              <button type="button" onClick={() => void share()} className="creator-chip">
                <Share2 className="h-3.5 w-3.5" />
                {copied ? "Link copied" : "Share"}
              </button>
              <button
                type="button"
                onClick={() => window.alert("Report sent to the CenAGRI moderation team.")}
                className="creator-chip"
                title="Report this video"
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Channel row */}
          <div className="creator-card flex flex-wrap items-center gap-3 p-3">
            <Link
              to={`/channel/${video.creator_id}`}
              className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#16C784]/15 text-sm font-bold text-[#16C784]"
            >
              {channel?.avatar_url ? (
                <img src={channel.avatar_url} alt="" className="h-10 w-10 object-cover" />
              ) : (
                (channel?.channel_name ?? "CA").slice(0, 2).toUpperCase()
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to={`/channel/${video.creator_id}`}
                className="flex items-center gap-1 text-[13px] font-bold text-white hover:text-[#16C784]"
              >
                {channel?.channel_name ?? "Creator"}
                {channel?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[#16C784]" />}
              </Link>
              <p className="text-[11px] text-slate-400">Farming creator on CenAGRI</p>
            </div>
            {user?.id !== video.owner_id && (
              <button
                type="button"
                onClick={() => void handleSubscribe()}
                className={subscribed ? "creator-btn-ghost h-9 px-4 text-xs" : "creator-btn-primary h-9 px-4 text-xs"}
              >
                {subscribed ? "Subscribed" : "Subscribe"}
              </button>
            )}
          </div>

          {video.description && (
            <div className="creator-card p-4">
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">
                {video.description}
              </p>
              {video.tags && video.tags.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {video.tags.map((tag) => (
                    <span key={tag} className="text-[11px] font-semibold text-[#2ED3B7]">
                      #{tag}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}

          {/* Comments */}
          <div className="creator-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <MessageCircle className="h-4 w-4 text-[#16C784]" />
              <h2 className="text-sm font-bold text-white">
                {comments.length} comment{comments.length === 1 ? "" : "s"}
              </h2>
            </div>

            {video.allow_comments ? (
              <>
                <form onSubmit={submitComment} className="flex items-start gap-2 border-b border-white/10 p-4">
                  <textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={replyTo ? "Write a reply…" : "Add a public comment…"}
                    className="creator-input resize-none"
                  />
                  <button
                    type="submit"
                    disabled={commentBusy || !draft.trim()}
                    className="creator-btn-primary h-9 shrink-0 px-3 text-xs"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
                {replyTo && (
                  <p className="px-4 pb-2 text-[11px] text-slate-400">
                    Replying to a comment ·{" "}
                    <button type="button" onClick={() => setReplyTo(null)} className="font-bold text-[#16C784]">
                      cancel
                    </button>
                  </p>
                )}

                {comments.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[11px] text-slate-500">
                    No comments yet. Be the first to ask a question.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {comments.map((comment) => (
                      <CommentRow
                        key={comment.id}
                        comment={comment}
                        isOwner={user?.id === video.owner_id}
                        onReply={() => setReplyTo(comment.id)}
                        onDelete={removeComment}
                        onEdit={saveEdit}
                      />
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="px-4 py-8 text-center text-[11px] text-slate-500">
                Comments are turned off for this video.
              </p>
            )}
          </div>
        </div>

        {/* ── Related ── */}
        <aside className="space-y-3">
          <h2 className="text-sm font-bold text-white">Related videos</h2>
          {related.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nothing related yet.</p>
          ) : (
            <div className="space-y-2">
              {related.map((item) => (
                <VideoCard key={item.id} video={item} variant="row" />
              ))}
            </div>
          )}
        </aside>
      </div>
    </CreatorShell>
  );
}

function CommentRow({
  comment,
  isOwner,
  onReply,
  onDelete,
  onEdit,
}: {
  comment: VideoComment;
  isOwner: boolean;
  onReply: () => void;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment.body);
  const mine = user?.id === comment.author_id;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-slate-200">
          {(comment.author_name ?? "CA").slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className="font-semibold text-white">{comment.author_name}</span>
            <span>· {timeAgo(comment.created_at)}</span>
            {comment.is_hidden && (
              <span className="rounded bg-amber-500/20 px-1.5 text-[9px] font-bold uppercase text-amber-300">
                hidden
              </span>
            )}
          </p>

          {editing ? (
            <div className="mt-1 flex gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="creator-input"
              />
              <button
                type="button"
                onClick={() => {
                  void onEdit(comment.id, value).then(() => setEditing(false));
                }}
                className="creator-btn-primary h-9 px-3 text-[11px]"
              >
                Save
              </button>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-200">
              {comment.body}
            </p>
          )}

          <div className="mt-1 flex gap-3 text-[10px] font-semibold text-slate-400">
            <button type="button" onClick={onReply} className="hover:text-white">
              Reply
            </button>
            {mine && (
              <button type="button" onClick={() => setEditing(true)} className="hover:text-white">
                Edit
              </button>
            )}
            {(mine || isOwner) && (
              <button
                type="button"
                onClick={() => void onDelete(comment.id)}
                className="hover:text-rose-300"
              >
                Delete
              </button>
            )}
          </div>

          {comment.replies && comment.replies.length > 0 && (
            <ul className="mt-2 space-y-2 border-l border-white/10 pl-3">
              {comment.replies.map((reply) => (
                <li key={reply.id}>
                  <p className="text-[11px] font-semibold text-white">
                    {reply.author_name}{" "}
                    <span className="font-normal text-slate-500">· {timeAgo(reply.created_at)}</span>
                  </p>
                  <p className="text-[12px] leading-relaxed text-slate-300">{reply.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
