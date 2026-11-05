import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  BookOpen,
  Compass,
  Eye,
  Hash,
  Leaf,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Sprout,
  TrendingUp,
  Users,
} from "lucide-react";

import { Avatar, FollowButton, RoleChip } from "@/components/cenfriend/ui";
import { SuggestSkeleton } from "@/components/cenfriend/Skeletons";
import { useAuth } from "@/hooks/useAuth";
import type { FollowState } from "@/lib/social";
import { compact, getCommentInbox, getSuggestedAccounts, getTrendingHashtags, handleOf, roleLabel, timeAgo } from "@/lib/social";
import type { InboxComment, PersonCard } from "@/lib/social";
import type { SocialProfile } from "@/lib/social";
import { getProfile } from "@/lib/social";

/**
 * The right column.
 *
 * Everything here is either the viewer's own data or public profile data the
 * API already returns. Anything that has no real source is not rendered at
 * all — an empty section is better than a section with invented numbers.
 *
 * The column is a set of small independent cards rather than one long panel
 * because each one loads at its own speed: the profile summary is instant, the
 * comment activity can take a round-trip, and a slow hashtag query must not
 * hold up the follow button next to it.
 */

export type RightSidebarFollow = {
  states: Record<string, FollowState>;
  busy: Set<string>;
  toggle: (userId: string) => void;
};

/* ── Panel shell ──────────────────────────────────────────────────────── */

function Panel({
  title,
  icon: Icon,
  action,
  children,
  dense = false,
}: {
  title: string;
  icon: typeof Hash;
  action?: ReactNode;
  children: ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="creator-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
        <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <Icon className="h-3.5 w-3.5 text-brand-700" />
          {title}
        </h2>
        {action}
      </div>
      <div className={dense ? "" : "py-1"}>{children}</div>
    </section>
  );
}

function EmptyLine({ children }: { children: string }) {
  return <p className="px-3.5 py-3 text-[11px] leading-relaxed text-slate-400">{children}</p>;
}

/**
 * A failed load is NOT an empty result.
 *
 * Reporting "Nothing trending this week" when the request actually 401'd or
 * timed out is the single most misleading state this column can show: it tells
 * the farmer there is nothing to see, when the truth is we could not ask. The
 * row below says so and offers a retry.
 */
function FailedLine({ onRetry, label = "Could not load" }: { onRetry: () => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 py-3">
      <p className="text-[11px] leading-relaxed text-slate-400">{label}.</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-brand-200 hover:text-brand-700"
      >
        Retry
      </button>
    </div>
  );
}

/* ── Profile summary ──────────────────────────────────────────────────── */

function ProfileSummary({ profileId, onOpen }: { profileId?: string; onOpen?: () => void }) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<SocialProfile | null>(null);

  // Counts are a nice-to-have: if the profile call fails the card still shows
  // the name and role from the session, so no error row is needed here.
  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    getProfile(profileId)
      .then((p) => alive && setStats(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [profileId]);

  const to = profileId ? `/cenfriend/u/${profileId}` : "/cenfriend/settings";
  const followers = stats?.follower_count ?? 0;
  const following = stats?.following_count ?? 0;
  const posts = stats?.post_count ?? 0;

  return (
    <section className="creator-card overflow-hidden">
      <div className="bg-gradient-to-br from-forest to-brand-800 px-3.5 pb-3 pt-4 text-white">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/15 p-0.5">
            <Avatar person={profile ?? {}} size="md" />
          </span>
          <div className="min-w-0 flex-1">
            <Link to={to} onClick={onOpen} className="block truncate text-sm font-bold hover:underline">
              {profile?.full_name ?? "Your account"}
            </Link>
            <p className="truncate text-[11px] text-white/70">
              {roleLabel(profile?.role) ?? "Kalika member"}
              {profile?.details?.district ? ` · ${profile.details.district}` : ""}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-1 text-center">
          {[
            { label: "Posts", value: posts },
            { label: "Followers", value: followers },
            { label: "Following", value: following },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white/10 py-1.5">
              <dt className="text-[9px] uppercase tracking-wide text-white/60">{s.label}</dt>
              <dd className="text-xs font-bold">{compact(s.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex gap-2 p-2.5">
        <Link
          to="/cenfriend/create"
          className="flex-1 rounded-lg bg-brand-700 py-1.5 text-center text-[11px] font-bold text-white hover:bg-brand-800"
        >
          Create post
        </Link>
        <Link
          to="/cenfriend/settings"
          className="flex-1 rounded-lg border border-slate-200 py-1.5 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-50"
        >
          Edit profile
        </Link>
      </div>
    </section>
  );
}

/* ── Suggested accounts ───────────────────────────────────────────────── */

function SuggestedAccounts({ follow }: { follow: RightSidebarFollow }) {
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setPeople(null);
    return getSuggestedAccounts(5)
      .then((res) => setPeople(res.items))
      .catch(() => {
        setPeople([]);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      title="Suggested accounts"
      icon={Users}
      action={
        <Link to="/cenfriend/explore?tab=people" className="text-[11px] font-bold text-brand-700 hover:underline">
          See all
        </Link>
      }
    >
      {people === null ? (
        <SuggestSkeleton />
      ) : failed ? (
        <FailedLine onRetry={load} label="Could not load suggested accounts" />
      ) : people.length === 0 ? (
        <EmptyLine>No new accounts to suggest yet. Follow people from Explore to grow your network.</EmptyLine>
      ) : (
        <ul className="divide-y divide-slate-50">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <Link to={`/cenfriend/u/${p.id}`} className="shrink-0">
                <Avatar person={p} size="md" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/cenfriend/u/${p.id}`} className="block truncate text-xs font-bold text-forest hover:underline">
                  {p.full_name ?? handleOf(p)}
                </Link>
                <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-[10px] text-slate-500">
                  <RoleChip role={p.role} compactLabel />
                  {p.follower_count > 0 && <span className="whitespace-nowrap">{compact(p.follower_count)} followers</span>}
                </p>
              </div>
              <FollowButton
                state={follow.states[p.id] ?? p.follow_state ?? "follow"}
                busy={follow.busy.has(p.id)}
                onPress={() => follow.toggle(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Trending hashtags ────────────────────────────────────────────────── */

function TrendingHashtags({ onPick }: { onPick: (tag: string) => void }) {
  const [tags, setTags] = useState<{ tag: string; posts: number }[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setTags(null);
    return getTrendingHashtags(8)
      .then((res) => setTags(res.items))
      .catch(() => {
        setTags([]);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel title="Trending hashtags" icon={TrendingUp}>
      {tags === null ? (
        <SuggestSkeleton rows={2} />
      ) : failed ? (
        <FailedLine onRetry={load} label="Could not load trending hashtags" />
      ) : tags.length === 0 ? (
        <EmptyLine>No hashtags are trending this week. Tag your post — #paddy, #organic, #rabi.</EmptyLine>
      ) : (
        <ul className="divide-y divide-slate-50">
          {tags.map((t) => (
            <li key={t.tag}>
              <button
                type="button"
                onClick={() => onPick(t.tag)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Hash className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-forest">#{t.tag}</span>
                  <span className="block text-[10px] text-slate-500">{t.posts} posts this week</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Popular topics ───────────────────────────────────────────────────── */

const TOPICS = [
  { label: "Crop production", query: "crop", icon: Sprout, trend: "This season" },
  { label: "Agriculture technology", query: "technology", icon: Sparkles, trend: "Growing" },
  { label: "Organic farming", query: "organic", icon: Leaf, trend: "Popular" },
  { label: "Success stories", query: "success", icon: TrendingUp, trend: "Most read" },
];

function PopularTopics({ onPick }: { onPick: (query: string) => void }) {
  return (
    <Panel title="Popular topics" icon={Compass}>
      <ul className="divide-y divide-slate-50">
        {TOPICS.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.label}>
              <button
                type="button"
                onClick={() => onPick(t.query)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-forest">{t.label}</span>
                  {/* Labelled as the editorial theme it is, never as a live count. */}
                  <span className="block text-[10px] text-slate-500">{t.trend}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Suggested creators ───────────────────────────────────────────────── */

function SuggestedCreators({ follow }: { follow: RightSidebarFollow }) {
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setPeople(null);
    return getSuggestedAccounts(3, "creator")
      .then((res) => setPeople(res.items))
      .catch(() => {
        setPeople([]);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel title="Suggested creators" icon={BadgeCheck}>
      {people === null ? (
        <SuggestSkeleton rows={2} />
      ) : failed ? (
        <FailedLine onRetry={load} label="Could not load suggested creators" />
      ) : people.length === 0 ? (
        <EmptyLine>No creators to suggest yet. Creator Studio accounts will appear here once they publish.</EmptyLine>
      ) : (
        <ul className="divide-y divide-slate-50">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <Link to={`/cenfriend/u/${p.id}`} className="shrink-0">
                <Avatar person={p} size="md" ring />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/cenfriend/u/${p.id}`} className="flex items-center gap-1 truncate text-xs font-bold text-forest hover:underline">
                  <span className="truncate">{p.full_name ?? handleOf(p)}</span>
                  <BadgeCheck className="h-3 w-3 shrink-0 text-brand-600" />
                </Link>
                <p className="truncate text-[10px] text-slate-500">{p.bio ?? "Content Creator"}</p>
              </div>
              <FollowButton
                state={follow.states[p.id] ?? p.follow_state ?? "follow"}
                busy={follow.busy.has(p.id)}
                onPress={() => follow.toggle(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Activity ─────────────────────────────────────────────────────────── */

function Activity() {
  const [items, setItems] = useState<InboxComment[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setItems(null);
    return getCommentInbox(4)
      .then((res) => setItems(res.items))
      .catch(() => {
        setItems([]);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      title="New on your posts"
      icon={MessageSquare}
      action={
        <Link to="/cenfriend/comments" className="text-[11px] font-bold text-brand-700 hover:underline">
          Inbox
        </Link>
      }
    >
      {items === null ? (
        <SuggestSkeleton rows={2} />
      ) : failed ? (
        <FailedLine onRetry={load} label="Could not load new comments" />
      ) : items.length === 0 ? (
        <EmptyLine>No comments yet. Post a photo of your crop to start a conversation.</EmptyLine>
      ) : (
        <ul className="divide-y divide-slate-50">
          {items.map((c) => (
            <li key={c.id} className="flex gap-2.5 px-3.5 py-2.5">
              <Link to={`/cenfriend/u/${c.author.id}`} className="shrink-0">
                <Avatar person={c.author} size="sm" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px]">
                  <Link to={`/cenfriend/u/${c.author.id}`} className="font-bold text-forest hover:underline">
                    {c.author.username ?? c.author.full_name ?? "Member"}
                  </Link>{" "}
                  <span className="text-slate-500">commented</span>
                </p>
                <Link to={`/cenfriend/post/${c.post_id}`} className="line-clamp-2 text-[11px] text-slate-600 hover:underline">
                  {c.body}
                </Link>
                <p className="text-[10px] text-slate-400">{timeAgo(c.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Community links ──────────────────────────────────────────────────── */

function CommunityPanel() {
  const links = [
    { label: "Community guidelines", to: "/cenfriend/settings#guidelines", icon: ShieldCheck },
    { label: "Privacy & safety", to: "/cenfriend/settings", icon: Eye },
    { label: "Farming knowledge hub", to: "/crop-advisory", icon: BookOpen },
    { label: "Find people in Explore", to: "/cenfriend/explore?tab=people", icon: Compass },
  ];
  return (
    <Panel title="Community" icon={ShieldCheck}>
      <ul className="divide-y divide-slate-50">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <li key={l.label}>
              <Link to={l.to} className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-brand-800">
                <Icon className="h-3.5 w-3.5 text-slate-400" />
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-3.5 pb-3 pt-1 text-[10px] leading-relaxed text-slate-400">
        Share what worked on your land. Do not share phone numbers or bank details in public posts.
      </p>
    </Panel>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────── */

export function RightSidebar({
  follow,
  onPickTag,
  onPickTopic,
}: {
  follow: RightSidebarFollow;
  onPickTag: (tag: string) => void;
  onPickTopic: (query: string) => void;
}) {
  const { profile } = useAuth();
  return (
    <div className="space-y-3">
      <ProfileSummary profileId={profile?.id} />
      <SuggestedAccounts follow={follow} />
      <TrendingHashtags onPick={onPickTag} />
      <PopularTopics onPick={onPickTopic} />
      <SuggestedCreators follow={follow} />
      <Activity />
      <CommunityPanel />
      <p className="px-1 pb-2 text-[10px] leading-relaxed text-slate-400">
        CenFriend is part of Kalika · Farming community ·{" "}
        <Link to="/cenfriend/settings" className="hover:text-brand-700">
          Account settings
        </Link>
      </p>
    </div>
  );
}

export default RightSidebar;
