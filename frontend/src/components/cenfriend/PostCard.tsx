import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  Send,
  Trash2,
} from "lucide-react";

import { Avatar, CommentRow, FollowButton, PostBody, RoleChip } from "@/components/cenfriend/ui";
import { compact, getPostComments, handleOf, roleLabel, timeAgo } from "@/lib/social";
import type { FollowState, SocialComment, SocialPost } from "@/lib/social";

/**
 * The feed post.
 *
 * Layout follows Instagram's proportions because they solve a real problem on
 * a 640px column: the author is one line, the media keeps a sane aspect ratio
 * instead of being cropped to a square, and the actions sit in a fixed order
 * so the eye learns the card in one post and stops reading the chrome.
 *
 * Two rules are preserved from the previous card and must stay:
 *   • media is `object-contain` for video and bounded by a max height, so a
 *     portrait phone photo is never distorted into a landscape box;
 *   • the like count shown is the SERVER's, reconciled by `usePostInteractions`
 *     after the optimistic flip.
 */

export type PostActions = {
  onLike: (post: SocialPost) => void;
  onSave: (post: SocialPost) => void;
  onComment: (post: SocialPost) => void;
  onShare: (post: SocialPost) => void;
  onReport?: (post: SocialPost) => void;
  onDelete?: (post: SocialPost) => void;
  onEdit?: (post: SocialPost) => void;
  onOpenMenu?: (post: SocialPost) => void;
  /** When provided, comments open inside the card instead of navigating away. */
  onInlineComment?: (post: SocialPost, body: string) => Promise<void>;
};

const MAX_MEDIA_HEIGHT = "max-h-[560px]";

/* ── Carousel ─────────────────────────────────────────────────────────── */

/**
 * Photos and video with a counter and arrows.
 *
 * Built on native horizontal scroll + `snap`, not a JS transform: on a phone
 * this gives real momentum scrolling and a swipe that cannot be broken by a
 * re-render. The arrows are a desktop convenience layered on top by scrolling
 * the same container, so there is only ever one source of position.
 */
export function PostCarousel({ post }: { post: SocialPost }) {
  const media = post.media_urls ?? [];
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const count = post.video_url ? 1 : media.length;

  const go = useCallback(
    (next: number) => {
      const el = trackRef.current;
      if (!el) return;
      const target = Math.max(0, Math.min(next, count - 1));
      el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
      setIndex(target);
    },
    [count]
  );

  // Track the real scroll position, so a swipe and an arrow agree.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || count < 2) return;
    const onScroll = () => {
      const width = el.clientWidth || 1;
      setIndex(Math.round(el.scrollLeft / width));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  if (post.video_url) {
    return (
      <div className="relative bg-black">
        <video
          src={post.video_url}
          controls
          playsInline
          preload="metadata"
          poster={media[0]}
          // A fixed 16:9 frame, not the stream's own height: a portrait phone
          // clip otherwise renders 900px tall and pushes the caption and the
          // whole next card out of view.
          className={`aspect-video ${MAX_MEDIA_HEIGHT} w-full bg-black object-contain`}
        />
        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
          <Play className="h-2.5 w-2.5 fill-white" /> Video
        </span>
      </div>
    );
  }

  if (media.length === 0) return null;

  return (
    <div className="relative bg-slate-100">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-none"
        aria-roledescription="carousel"
        aria-label={`${media.length} photos`}
      >
        {media.map((url, i) => (
          <div key={`${url}-${i}`} className="w-full shrink-0 snap-center">
            <img
              src={url}
              alt={`${post.body.slice(0, 60) || "Post"} — photo ${i + 1} of ${media.length}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              // `object-contain` with a bounded height keeps the real aspect
              // ratio. `object-cover` on a fixed box would crop the part of a
              // plant the farmer actually wanted to show.
              className={`${MAX_MEDIA_HEIGHT} w-full bg-slate-100 object-contain`}
            />
          </div>
        ))}
      </div>

      {media.length > 1 && (
        <>
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow transition hover:bg-white sm:grid"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {index < count - 1 && (
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow transition hover:bg-white sm:grid"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
            {index + 1}/{media.length}
          </span>
          <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1">
            {media.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Inline comments ──────────────────────────────────────────────────── */

/** Small preview: the two newest comments, loaded on first open. */
function InlineComments({ post }: { post: SocialPost }) {
  const [comments, setComments] = useState<SocialComment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getPostComments(post.id)
      .then((rows) => alive && setComments(rows))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Could not load comments."));
    return () => {
      alive = false;
    };
  }, [post.id]);

  if (error) return <p className="px-4 pb-1 text-[11px] text-rose-600">{error}</p>;
  if (!comments) {
    return (
      <p className="flex items-center gap-1.5 px-4 pb-1 pt-1 text-[11px] text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading comments…
      </p>
    );
  }
  const shown = comments.slice(-2);
  if (shown.length === 0) return null;

  return (
    <div className="space-y-0.5 px-3 pb-1">
      {shown.map((c) => (
        <CommentRow
          key={c.id}
          comment={c}
          onLike={() => {
            /* likes on a preview comment stay on the post screen */
          }}
          onReply={() => {
            /* see above */
          }}
        />
      ))}
      {comments.length > shown.length && (
        <Link to={`/cenfriend/post/${post.id}`} className="px-1 text-[11px] font-semibold text-slate-400 hover:text-brand-700">
          View all {comments.length} comments
        </Link>
      )}
    </div>
  );
}

/* ── Card ─────────────────────────────────────────────────────────────── */

export function PostCard({
  post,
  actions,
  followState,
  onFollow,
  followBusy,
  compactMode = false,
  showFollowButton = true,
}: {
  post: SocialPost;
  actions: PostActions;
  followState?: FollowState;
  onFollow?: () => void;
  followBusy?: boolean;
  compactMode?: boolean;
  showFollowButton?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const isOwn = followState === "me" || post.author?.follow_state === "me";

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !actions.onInlineComment) return;
    setSending(true);
    setSendError("");
    try {
      await actions.onInlineComment(post, body);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not post the comment.");
    } finally {
      setSending(false);
    }
  }

  if (compactMode) {
    return (
      <Link to={`/cenfriend/post/${post.id}`} className="group relative block aspect-square overflow-hidden bg-slate-100">
        {post.media_urls?.[0] ? (
          <img src={post.media_urls[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : post.video_url ? (
          <div className="grid h-full w-full place-items-center bg-forest text-[11px] font-semibold text-white">
            <Play className="h-6 w-6" />
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center p-3">
            <p className="line-clamp-6 text-center text-[11px] leading-relaxed text-slate-600">{post.body}</p>
          </div>
        )}
        <span className="absolute inset-0 hidden items-center justify-center gap-3 bg-black/35 text-xs font-bold text-white group-hover:flex">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5 fill-white" /> {compact(post.like_count)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> {compact(post.comment_count)}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <article className="creator-card overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center gap-2.5 px-4 py-2.5">
        <Link to={`/cenfriend/u/${post.author_id}`} aria-label={`Open ${handleOf(post.author)}`} className="shrink-0">
          <span className="block rounded-full bg-gradient-to-tr from-brand-600 via-teal-400 to-amber-300 p-[2px]">
            <span className="block rounded-full bg-white p-[1.5px]">
              <Avatar person={post.author} size="sm" />
            </span>
          </span>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link to={`/cenfriend/u/${post.author_id}`} className="min-w-0 truncate text-[13px] font-bold text-forest hover:underline">
              {post.author?.username ? post.author.username : post.author?.full_name ?? handleOf(post.author)}
            </Link>
            {post.author?.role === "Content Creator" && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-label="Verified creator" />
            )}
            {post.author?.is_private && <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-label="Private account" />}
            {/* The role pill is useful but not essential; on a phone it pushes
                the three-dot menu out, so only a creator check survives there. */}
            <span className="hidden sm:inline-flex">
              <RoleChip role={post.author?.role} compactLabel />
            </span>
          </div>
          <p className="flex min-w-0 items-center gap-x-1.5 overflow-hidden text-[11px] text-slate-500">
            {/* Account type leads, name second: the username above already says
                who it is, and "who they are to the market" is the useful bit. */}
            <span className="shrink-0 font-semibold text-slate-500">{roleLabel(post.author?.role) ?? "Kalika member"}</span>
            <span aria-hidden="true">·</span>
            <time className="shrink-0" dateTime={post.created_at} title={new Date(post.created_at).toLocaleString("en-IN")}>
              {timeAgo(post.created_at)}
            </time>
            {post.location_name && (
              <span className="flex min-w-0 items-center gap-0.5">
                <span aria-hidden="true">·</span>
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{post.location_name}</span>
              </span>
            )}
            {post.edited_at && <span className="shrink-0 text-slate-400">· edited</span>}
          </p>
        </div>

        {showFollowButton && followState && followState !== "me" && onFollow && (
          <FollowButton state={followState} busy={followBusy} onPress={onFollow} />
        )}

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Post options"
            aria-expanded={menuOpen}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-card-hover">
                {isOwn && actions.onEdit && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setMenuOpen(false);
                      actions.onEdit?.(post);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit post
                  </button>
                )}
                {isOwn && actions.onDelete && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      setMenuOpen(false);
                      actions.onDelete?.(post);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete post
                  </button>
                )}
                {!isOwn && actions.onReport && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      setMenuOpen(false);
                      actions.onReport?.(post);
                    }}
                  >
                    <Flag className="h-3.5 w-3.5" /> Report post
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setMenuOpen(false);
                    void actions.onShare(post);
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" /> Copy link
                </button>
                {actions.onOpenMenu && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setMenuOpen(false);
                      actions.onOpenMenu?.(post);
                    }}
                  >
                    More options
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Media ── */}
      <PostCarousel post={post} />

      {/* ── Actions ── */}
      <div className="flex items-center gap-1 px-2.5 pt-2">
        <button
          type="button"
          onClick={() => actions.onLike(post)}
          aria-pressed={post.liked}
          aria-label={post.liked ? "Unlike" : "Like"}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold transition ${post.liked ? "text-rose-600" : "text-slate-700 hover:text-rose-600"}`}
        >
          <Heart className={`h-5 w-5 transition-transform ${post.liked ? "scale-105 fill-rose-600" : ""}`} />
          {compact(post.like_count)}
        </button>

        <button
          type="button"
          onClick={() => {
            if (actions.onInlineComment) setCommentsOpen((v) => !v);
            else actions.onComment(post);
          }}
          aria-label="Comments"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold text-slate-700 transition hover:text-brand-700"
        >
          <MessageCircle className="h-5 w-5" />
          {compact(post.comment_count)}
        </button>

        <button
          type="button"
          onClick={() => actions.onShare(post)}
          aria-label="Share post"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold text-slate-700 transition hover:text-brand-700"
        >
          <Send className="h-5 w-5" />
          {post.share_count > 0 ? compact(post.share_count) : ""}
        </button>

        <button
          type="button"
          onClick={() => actions.onSave(post)}
          aria-pressed={post.saved}
          aria-label={post.saved ? "Remove from saved" : "Save post"}
          className={`ml-auto inline-flex items-center rounded-md px-2 py-1.5 transition ${post.saved ? "text-brand-700" : "text-slate-500 hover:text-brand-700"}`}
        >
          <Bookmark className={`h-5 w-5 ${post.saved ? "fill-brand-700" : ""}`} />
        </button>
      </div>

      {/* ── Caption + tags ── */}
      <div className="px-4 pb-2 pt-1">
        {post.crop && (
          <Link
            to={`/cenfriend/explore?q=${encodeURIComponent(post.crop)}`}
            className="mb-1 inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 hover:bg-brand-100"
          >
            {post.crop}
          </Link>
        )}
        {post.author?.username && (
          <span className="mr-1 text-[13px] font-bold text-forest">
            <Link to={`/cenfriend/u/${post.author_id}`} className="hover:underline">
              {post.author.username}
            </Link>
          </span>
        )}
        <PostBody body={post.body} className="inline" />
        {post.hashtags?.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {post.hashtags.slice(0, 8).map((tag) => (
              <Link
                key={tag}
                to={`/cenfriend/explore?q=${encodeURIComponent(`#${tag}`)}`}
                className="text-[12px] font-semibold text-brand-700 hover:underline"
              >
                #{tag}
              </Link>
            ))}
          </p>
        )}
      </div>

      {post.comment_count > 0 && !commentsOpen && (
        <button
          type="button"
          onClick={() => (actions.onInlineComment ? setCommentsOpen(true) : actions.onComment(post))}
          className="block w-full px-4 pb-2 text-left text-[12px] font-medium text-slate-400 hover:text-slate-600"
        >
          View all {post.comment_count} comments
        </button>
      )}

      {commentsOpen && <InlineComments post={post} />}

      {actions.onInlineComment && (
        <form onSubmit={submitComment} className="flex items-center gap-2 border-t border-slate-100 px-3.5 py-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            aria-label="Write a comment"
            maxLength={1000}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            // 36px tall, not just the text height: a phone thumb needs a real
            // target and "Post" is the most-tapped control in the card.
            className="grid h-9 min-w-9 place-items-center px-1 text-xs font-bold text-brand-700 transition disabled:text-slate-300"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </button>
        </form>
      )}
      {sendError && <p className="px-4 pb-2 text-[11px] text-rose-600">{sendError}</p>}
    </article>
  );
}

export default PostCard;
