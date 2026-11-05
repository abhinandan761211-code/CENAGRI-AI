import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { CommentRow, PostCard, SocialEmpty, SocialLoading } from "@/components/cenfriend/ui";
import { usePostInteractions } from "@/components/cenfriend/useSocialActions";
import { ErrorNote, inputClass } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import {
  addComment,
  deleteComment,
  getPost,
  likeComment,
  reportContent,
  sharePost,
  unlikeComment,
} from "@/lib/social";
import type { PostDetail, SocialComment, SocialPost } from "@/lib/social";

/**
 * One post, with its comment thread.
 *
 * Comments arrive already nested one level (a reply belongs to its parent), so
 * the page renders the tree it was given instead of rebuilding relationships
 * from a flat list — which is what makes the reply-to-a-reply case collapse
 * safely instead of nesting forever.
 */
export default function CenFriendPost() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<SocialComment | null>(null);
  const [sending, setSending] = useState(false);

  const actions = usePostInteractions((updater) => {
    setPost((prev) => (prev ? ({ ...prev, ...updater([prev])[0] }) as PostDetail : prev));
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      setPost(await getPost(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this post.");
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!post) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError("");
    try {
      await addComment(post.id, body, replyingTo?.id ?? null);
      setDraft("");
      setReplyingTo(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the comment.");
    } finally {
      setSending(false);
    }
  }

  async function toggleCommentLike(comment: SocialComment) {
    // Optimistic, then reconciled by a reload on failure.
    const apply = (liked: boolean, count: number) => {
      setPost((prev) => {
        if (!prev) return prev;
        const walk = (list: SocialComment[]): SocialComment[] =>
          list.map((c) =>
            c.id === comment.id
              ? { ...c, liked, like_count: count }
              : { ...c, replies: walk(c.replies ?? []) }
          );
        return { ...prev, comments: walk(prev.comments) };
      });
    };
    apply(!comment.liked, Math.max(0, comment.like_count + (comment.liked ? -1 : 1)));
    try {
      if (comment.liked) await unlikeComment(comment.id);
      else await likeComment(comment.id);
    } catch (err) {
      apply(comment.liked, comment.like_count);
      setError(err instanceof Error ? err.message : "Could not update the like.");
    }
  }

  async function removeComment(comment: SocialComment) {
    try {
      await deleteComment(comment.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the comment.");
    }
  }

  async function handleShare(p: SocialPost) {
    const url = `${window.location.origin}/cenfriend/post/${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "CenFriend post", url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied.");
        window.setTimeout(() => setNotice(""), 2400);
      }
      await sharePost(p.id);
    } catch {
      /* cancelled */
    }
  }

  const commentCount = post ? post.comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0) : 0;

  return (
    <CenFriendShell>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {(error || actions.error) && (
        <div className="mb-3">
          <ErrorNote message={error || actions.error} />
        </div>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {notice}
        </p>
      )}

      {loading ? (
        <SocialLoading label="Loading post…" />
      ) : !post ? (
        <div className="creator-card">
          <SocialEmpty
            icon={MessageCircle}
            title="Post not available"
            description="It may have been deleted, or it belongs to a private account you do not follow."
            action={
              <Link to="/cenfriend" className="text-xs font-bold text-brand-700 hover:underline">
                Back to feed
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          <PostCard
            post={post}
            actions={{
              onLike: actions.toggleLike,
              onSave: actions.toggleSave,
              onComment: () => document.getElementById("comment-box")?.focus(),
              onShare: handleShare,
              onReport: async () => {
                try {
                  await reportContent("post", post.id, "other", "Reported from the post screen");
                  setNotice("Report sent to moderation.");
                } catch {
                  /* the error note above already covers transport failures */
                }
              },
            }}
            followState={post.author_id === profile?.id ? "me" : "follow"}
            showFollowButton={false}
          />

          <section className="creator-card">
            <p className="border-b border-slate-100 px-3.5 py-2.5 text-xs font-bold text-forest">
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </p>

            {post.comments.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-xs text-slate-500">No comments yet. Start the conversation.</p>
            ) : (
              <div className="px-3.5 py-1">
                {post.comments.map((comment) => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    onLike={toggleCommentLike}
                    onReply={(c) => {
                      setReplyingTo(c);
                      document.getElementById("comment-box")?.focus();
                    }}
                    onDelete={removeComment}
                  />
                ))}
              </div>
            )}

            <form onSubmit={submitComment} className="border-t border-slate-100 p-3">
              {replyingTo && (
                <p className="mb-1.5 flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                  <span>
                    Replying to <span className="font-bold">{replyingTo.author?.full_name ?? "a member"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="font-bold text-slate-400 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </p>
              )}
              <div className="flex items-end gap-2">
                <input
                  id="comment-box"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={1000}
                  placeholder={replyingTo ? "Write a reply…" : "Add a comment…"}
                  aria-label="Comment"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  aria-label="Send comment"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-white disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </CenFriendShell>
  );
}
