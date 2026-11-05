import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Check, Clock, Heart, Loader2, Lock, Share2 } from "lucide-react";

import { compact, handleOf, roleLabel, timeAgo, tokenizeBody } from "@/lib/social";
import type { FeedMode, FollowState, PersonCard, SocialAuthor, SocialComment } from "@/lib/social";

/**
 * CenFriend UI kit.
 *
 * Every piece here is built from the app's existing design language — the
 * `creator-card` surface, `brand`/`forest` palette, and the sizes used in
 * `farmerUI`. Nothing here introduces a second colour system or a parallel
 * button style, so CenFriend sits inside the farmer account rather than beside it.
 */

/* ── Avatar ───────────────────────────────────────────────────────────── */

const SIZE = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
} as const;

export function Avatar({
  person,
  size = "sm",
  ring = false,
  className = "",
}: {
  person: { avatar_url?: string | null; full_name?: string | null; username?: string | null };
  size?: keyof typeof SIZE;
  ring?: boolean;
  className?: string;
}) {
  const initials =
    (person.full_name ?? person.username ?? "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-700 font-bold text-white ${SIZE[size]} ${ring ? "ring-2 ring-white ring-offset-2 ring-offset-brand-100" : ""
        } ${className}`}
    >
      {person.avatar_url ? (
        <img src={person.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials
      )}
    </span>
  );
}

/* ── Role / verification ──────────────────────────────────────────────── */

/** Agriculture-specific account-type pill. Colour ties to the role so a feed
 *  is scannable: farmers and creators read differently at a glance. */
export function RoleChip({ role, compactLabel = false }: { role?: string | null; compactLabel?: boolean }) {
  const label = roleLabel(role);
  if (!label) return null;
  const isCreator = role === "Content Creator" || role === "creator";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold ${isCreator ? "bg-violet-50 text-violet-700" : "bg-brand-50 text-brand-700"
        }`}
      title={label}
    >
      {isCreator && <BadgeCheck className="h-2.5 w-2.5" />}
      {compactLabel ? label.split(" ")[0] : label}
    </span>
  );
}

/* ── Follow button ────────────────────────────────────────────────────── */

/**
 * One button, four states, all driven by what the SERVER said.
 *
 * The parent owns the state; this component only renders it and reports the
 * click. Keeping the decision above means a list of 40 cards cannot end up
 * with 40 separate opinions about whether it is following someone.
 */
export function FollowButton({
  state,
  busy = false,
  onPress,
  size = "sm",
  className = "",
}: {
  state: FollowState;
  busy?: boolean;
  onPress: () => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const pad = size === "md" ? "h-9 px-4 text-xs" : "h-7 px-3 text-[11px]";

  if (state === "me") return null;

  const look =
    state === "following"
      ? "border border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
      : state === "requested"
        ? "border border-slate-200 bg-slate-100 text-slate-500"
        : "bg-brand-700 text-white hover:bg-brand-800";

  const label =
    state === "following" ? "Following" : state === "requested" ? "Requested" : state === "follow_back" ? "Follow back" : "Follow";

  const Icon = state === "requested" ? Clock : state === "following" ? Check : undefined;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy || state === "requested"}
      aria-pressed={state === "following"}
      className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${pad} ${look} ${className}`}
      title={state === "following" ? "Following — tap to unfollow" : undefined}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : Icon && <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}

/* ── Person rows ──────────────────────────────────────────────────────── */

/**
 * A person in a list — followers, search results, suggestions.
 *
 * The trailing control is passed in rather than assumed, because the same row
 * appears in "Followers" (remove), "Requests" (accept/decline), search
 * (follow) and "Blocked" (unblock).
 */
export function PersonRow({
  person,
  subtitle,
  action,
  footer,
}: {
  person: PersonCard | SocialAuthor;
  subtitle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  const unfollowable = person.role;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Link to={`/cenfriend/u/${person.id}`} className="shrink-0" aria-label={`Open ${handleOf(person)}`}>
        <Avatar person={person} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/cenfriend/u/${person.id}`} className="flex min-w-0 flex-wrap items-center gap-1.5 hover:underline">
          <span className="truncate text-xs font-bold text-forest">{person.full_name ?? handleOf(person)}</span>
          <RoleChip role={unfollowable} />
          {"is_private" in person && person.is_private && <Lock className="h-3 w-3 shrink-0 text-slate-400" />}
        </Link>
        <p className="truncate text-[11px] text-slate-500">
          {subtitle ?? (
            <>
              {person.username ? `@${person.username}` : "No handle"}
              {"follower_count" in person && person.follower_count > 0 && (
                <span className="text-slate-400"> · {compact(person.follower_count)} followers</span>
              )}
            </>
          )}
        </p>
        {footer}
      </div>
      {action}
    </div>
  );
}

/* ── Post body ────────────────────────────────────────────────────────── */

/** Post text with working #hashtags and @mentions. */
export function PostBody({ body, className = "" }: { body: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-700 ${className}`}>
      {tokenizeBody(body).map((token, i) => {
        if (token.type === "tag") {
          return (
            <Link
              key={i}
              to={`/cenfriend/explore?q=${encodeURIComponent(token.value.slice(1))}`}
              className="font-semibold text-brand-700 hover:underline"
            >
              {token.value}
            </Link>
          );
        }
        if (token.type === "mention") {
          return (
            <Link
              key={i}
              to={`/cenfriend/explore?q=${encodeURIComponent(token.value.slice(1))}`}
              className="font-semibold text-violet-700 hover:underline"
            >
              {token.value}
            </Link>
          );
        }
        return <span key={i}>{token.value}</span>;
      })}
    </p>
  );
}

/* ── Post card ────────────────────────────────────────────────────────── */

/**
 * The card moved to `PostCard.tsx` when it outgrew this file (carousel,
 * menu, inline comments). It is re-exported here so every existing screen
 * that imports `PostCard` or `PostActions` from the kit keeps working
 * unchanged.
 */
export { PostCard, PostCarousel } from "@/components/cenfriend/PostCard";
export type { PostActions } from "@/components/cenfriend/PostCard";

/* ── Comment ──────────────────────────────────────────────────────────── */

export function CommentRow({
  comment,
  onLike,
  onReply,
  onDelete,
  depth = 0,
}: {
  comment: SocialComment;
  onLike: (c: SocialComment) => void;
  onReply: (c: SocialComment) => void;
  onDelete?: (c: SocialComment) => void;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-9 border-l border-slate-200 pl-3" : ""}>
      <div className="flex gap-2 py-2">
        <Link to={`/cenfriend/u/${comment.author?.id}`} className="shrink-0">
          <Avatar person={comment.author ?? {}} size="xs" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Link
              to={`/cenfriend/u/${comment.author?.id}`}
              className="font-bold text-forest hover:underline"
            >
              {comment.author?.full_name ?? handleOf(comment.author ?? {})}
            </Link>
            <RoleChip role={comment.author?.role} compactLabel />
            <span className="text-slate-400">{timeAgo(comment.created_at)}</span>
          </p>
          <PostBody body={comment.body} className="mt-0.5 !text-[12px]" />
          <div className="mt-1 flex items-center gap-3 text-[10px] font-semibold">
            <button
              type="button"
              onClick={() => onLike(comment)}
              aria-pressed={comment.liked}
              className={`inline-flex items-center gap-1 ${comment.liked ? "text-rose-600" : "text-slate-400 hover:text-rose-600"}`}
            >
              <Heart className={`h-3 w-3 ${comment.liked ? "fill-rose-600" : ""}`} />
              {comment.like_count > 0 ? compact(comment.like_count) : "Like"}
            </button>
            {depth === 0 && (
              <button type="button" onClick={() => onReply(comment)} className="text-slate-400 hover:text-brand-700">
                Reply
              </button>
            )}
            {comment.is_mine && onDelete && (
              <button type="button" onClick={() => onDelete(comment)} className="text-slate-400 hover:text-rose-600">
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
      {comment.replies?.map((reply) => (
        <CommentRow
          key={reply.id}
          comment={reply}
          onLike={onLike}
          onReply={onReply}
          onDelete={onDelete}
          depth={Math.min(depth + 1, 1)}
        />
      ))}
    </div>
  );
}

/* ── Feed tabs ────────────────────────────────────────────────────────── */

export function FeedTabs({ value, onChange }: { value: FeedMode; onChange: (m: FeedMode) => void }) {
  const tabs: { key: FeedMode; label: string }[] = [
    { key: "following", label: "Following" },
    { key: "recommended", label: "Recommended" },
    { key: "latest", label: "Latest" },
  ];
  return (
    <div role="tablist" aria-label="Feed filter" className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-bold transition ${value === t.key ? "bg-white text-forest shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Empty / loading ──────────────────────────────────────────────────── */

export function SocialEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Share2;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-forest">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SocialLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}
    </p>
  );
}
