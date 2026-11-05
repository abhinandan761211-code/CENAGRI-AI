import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Ban,
  BellOff,
  Flag,
  Lock,
  MessageCircle,
  Pencil,
  Settings,
  ShieldAlert,
  UserPlus,
  UserX,
} from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import {
  Avatar,
  FollowButton,
  RoleChip,
  SocialEmpty,
  SocialLoading,
} from "@/components/cenfriend/ui";
import { ErrorNote, Modal } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import {
  blockUser,
  compact,
  followUser,
  getProfile,
  getProfilePosts,
  muteUser,
  reportContent,
  unfollowUser,
  unblockUser,
} from "@/lib/social";
import type { FollowState, ReportReason, SocialPost, SocialProfile } from "@/lib/social";

/**
 * A CenFriend profile.
 *
 * The privacy contract is enforced by the API and merely *presented* here: for
 * a private account the response carries no posts at all, so this page has
 * nothing to hide — it renders the locked state because there is nothing else
 * to render. That is deliberate. A UI that receives the posts and chooses not
 * to draw them would still be leaking them to anyone with devtools open.
 */

const REASONS: { key: ReportReason; label: string }[] = [
  { key: "spam", label: "Spam or advertising" },
  { key: "harassment", label: "Harassment or abuse" },
  { key: "misinformation", label: "False farming information" },
  { key: "hate", label: "Hate speech" },
  { key: "nudity", label: "Nudity or sexual content" },
  { key: "violence", label: "Violence or graphic content" },
  { key: "other", label: "Something else" },
];

export default function CenFriendProfile() {
  const { id } = useParams<{ id: string }>();
  const { profile: me } = useAuth();

  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [tab, setTab] = useState<"posts" | "photos" | "videos" | "about">("posts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportNote, setReportNote] = useState("");

  const targetId = id ?? me?.id ?? "";

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError("");
    try {
      const data = await getProfile(targetId);
      setProfile(data);
      if (data.is_restricted) {
        setPosts([]);
      } else {
        const grid = await getProfilePosts(targetId, null, 24);
        setPosts(grid.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this profile.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow() {
    if (!profile || profile.is_self) return;
    setFollowBusy(true);
    setError("");
    try {
      const current: FollowState = profile.follow_state;
      if (current === "following" || current === "requested") {
        await unfollowUser(profile.id);
        setProfile({
          ...profile,
          follow_state: "follow",
          follower_count: Math.max(0, profile.follower_count - 1),
        });
        setNotice(current === "requested" ? "Request cancelled." : "Unfollowed.");
      } else {
        const result = await followUser(profile.id);
        const nowFollowing = result === "following";
        setProfile({
          ...profile,
          follow_state: nowFollowing ? "following" : "requested",
          // A private account's count does not move until they approve, so only
          // the public case increments it optimistically.
          follower_count: nowFollowing ? profile.follower_count + 1 : profile.follower_count,
          is_restricted: !nowFollowing && profile.is_restricted,
        });
        setNotice(nowFollowing ? "Following." : "Request sent. They will approve it first.");
        if (nowFollowing && profile.is_restricted) await load();
      }
      window.setTimeout(() => setNotice(""), 2600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the follow.");
    } finally {
      setFollowBusy(false);
    }
  }

  async function submitReport() {
    if (!profile || !reportReason) return;
    try {
      await reportContent("user", profile.id, reportReason, reportNote);
      setNotice("Report sent. Our team will review this account.");
      setShowSafety(false);
      setReportReason(null);
      setReportNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report.");
    }
  }

  const filteredPosts =
    tab === "photos"
      ? posts.filter((p) => p.post_kind === "image" || p.post_kind === "gallery")
      : tab === "videos"
        ? posts.filter((p) => p.post_kind === "video" || p.post_kind === "short")
        : posts;

  const handle = profile?.username ? `@${profile.username}` : null;

  return (
    <CenFriendShell activeOverride="profile">
      {loading ? (
        <SocialLoading label="Loading profile…" />
      ) : !profile ? (
        <div className="creator-card">
          <SocialEmpty
            icon={UserX}
            title="Profile not available"
            description="This account may have been removed, or it has blocked you."
            action={
              <Link to="/cenfriend/explore" className="text-xs font-bold text-brand-700 hover:underline">
                Find someone else
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-3">
              <ErrorNote message={error} />
            </div>
          )}
          {notice && (
            <p role="status" className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
              {notice}
            </p>
          )}

          {/* Header */}
          <section className="creator-card overflow-hidden">
            <div className="h-24 bg-forest sm:h-32">
              {profile.cover_url && (
                <img src={profile.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </div>

            <div className="px-4 pb-4">
              <div className="-mt-10 flex items-end justify-between gap-3 sm:-mt-12">
                <Avatar person={{ avatar_url: profile.avatar_url, full_name: profile.full_name, username: profile.username }} size="xl" className="border-4 border-white" />
                {profile.is_self ? (
                  <div className="mb-1 flex items-center gap-1.5">
                    <Link
                      to="/cenfriend/settings"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Settings className="h-3 w-3" /> Edit profile
                    </Link>
                  </div>
                ) : (
                  <div className="mb-1 flex items-center gap-1.5">
                    <FollowButton
                      state={profile.follow_state}
                      busy={followBusy}
                      onPress={() => void toggleFollow()}
                      size="md"
                    />
                    {profile.can_message && (
                      <Link
                        to="/messages"
                        aria-label="Message"
                        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSafety(true)}
                      aria-label="More options"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-2.5">
                <h1 className="flex flex-wrap items-center gap-1.5 font-display text-lg font-extrabold tracking-tight text-forest">
                  {profile.full_name ?? "Kalika member"}
                  {profile.is_private && <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Private account" />}
                  {profile.creator_mode && <BadgeCheck className="h-4 w-4 text-violet-600" aria-label="Creator" />}
                </h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  {handle && <span className="font-semibold text-slate-600">{handle}</span>}
                  <RoleChip role={profile.role} />
                  {profile.district && <span>· {[profile.district, profile.state].filter(Boolean).join(", ")}</span>}
                </p>
                {profile.bio && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{profile.bio}</p>}
              </div>

              <dl className="mt-3 flex gap-5 text-center">
                <div>
                  <dt className="sr-only">Posts</dt>
                  <dd className="text-sm font-extrabold text-forest">{compact(profile.post_count)}</dd>
                  <dd className="text-[10px] text-slate-500">Posts</dd>
                </div>
                <Link to={`/cenfriend/u/${profile.id}/followers`} className="hover:opacity-80">
                  <dt className="sr-only">Followers</dt>
                  <dd className="text-sm font-extrabold text-forest">{compact(profile.follower_count)}</dd>
                  <dd className="text-[10px] text-slate-500">Followers</dd>
                </Link>
                <Link to={`/cenfriend/u/${profile.id}/following`} className="hover:opacity-80">
                  <dt className="sr-only">Following</dt>
                  <dd className="text-sm font-extrabold text-forest">{compact(profile.following_count)}</dd>
                  <dd className="text-[10px] text-slate-500">Following</dd>
                </Link>
              </dl>

              {profile.is_self && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Link
                    to={`/cenfriend/u/${profile.id}/followers`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Followers
                  </Link>
                  <Link
                    to={`/cenfriend/u/${profile.id}/following`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Following
                  </Link>
                  <Link
                    to="/cenfriend/requests"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                  >
                    <UserPlus className="h-3 w-3" /> Requests
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* Locked / posts */}
          {profile.is_restricted ? (
            <section className="creator-card mt-3">
              <SocialEmpty
                icon={Lock}
                title="This account is private"
                description="Follow this account to see their posts, photos and videos. Requests are approved by the owner."
                action={
                  <FollowButton
                    state={profile.follow_state}
                    busy={followBusy}
                    onPress={() => void toggleFollow()}
                    size="md"
                  />
                }
              />
            </section>
          ) : (
            <section className="mt-3">
              <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
                {([
                  { key: "posts", label: "Posts" },
                  { key: "photos", label: "Photos" },
                  { key: "videos", label: "Videos" },
                  { key: "about", label: "About" },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    aria-selected={tab === t.key}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${tab === t.key ? "bg-white text-forest shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "about" ? (
                <div className="creator-card divide-y divide-slate-100">
                  {[
                    ["Account type", profile.role ?? "—"],
                    ["Username", handle ?? "Not set"],
                    ["District", profile.district ?? "—"],
                    ["State", profile.state ?? "—"],
                    ["Privacy", profile.is_private ? "Private — owner approves follows" : "Public"],
                    ["Creator mode", profile.creator_mode ? "Enabled (Kisan Video Hub)" : "Not enabled"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                      <span className="text-right text-[11px] font-bold text-forest">{value}</span>
                    </div>
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="creator-card">
                  <SocialEmpty
                    icon={profile.is_self ? Pencil : Lock}
                    title={profile.is_self ? "Nothing here yet" : "No posts yet"}
                    description={
                      profile.is_self
                        ? "Your posts will appear here. Share something from the field."
                        : "This account has not posted any visible content yet."
                    }
                    action={
                      profile.is_self ? (
                        <Link to="/cenfriend/create" className="text-xs font-bold text-brand-700 hover:underline">
                          Create a post
                        </Link>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
                  {filteredPosts.map((post) => (
                    <Link
                      key={post.id}
                      to={`/cenfriend/post/${post.id}`}
                      className="group relative aspect-square overflow-hidden bg-slate-100"
                    >
                      {post.media_urls?.[0] ? (
                        <img
                          src={post.media_urls[0]}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition group-hover:opacity-90"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center p-2">
                          <span className="line-clamp-5 text-center text-[10px] leading-snug text-slate-600">
                            {post.body}
                          </span>
                        </span>
                      )}
                      {post.post_kind === "video" || post.post_kind === "short" ? (
                        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[8px] font-bold text-white">
                          Video
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Safety sheet */}
          {showSafety && (
            <Modal title="Account safety" description="Block, mute or report this account" onClose={() => setShowSafety(false)}>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await blockUser(profile.id);
                      setNotice("Blocked. They can no longer see or interact with your content.");
                      setShowSafety(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not block.");
                    }
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-left hover:border-rose-300 hover:bg-rose-50"
                >
                  <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    <span className="block text-xs font-bold text-forest">Block this account</span>
                    <span className="block text-[11px] text-slate-500">
                      Removes any follow in both directions and hides their posts from you.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await muteUser(profile.id);
                      setNotice("Muted. Their posts will not appear in your feed.");
                      setShowSafety(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not mute.");
                    }
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span>
                    <span className="block text-xs font-bold text-forest">Mute</span>
                    <span className="block text-[11px] text-slate-500">
                      Keeps the follow, hides their posts from your feed.
                    </span>
                  </span>
                </button>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-forest">
                    <Flag className="h-3.5 w-3.5 text-rose-600" /> Report this account
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {REASONS.map((r) => (
                      <label key={r.key} className="flex items-center gap-2 text-[11px] text-slate-600">
                        <input
                          type="radio"
                          name="reason"
                          checked={reportReason === r.key}
                          onChange={() => setReportReason(r.key)}
                          className="accent-brand-700"
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Anything else we should know? (optional)"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] outline-none focus:border-brand-600"
                  />
                  <button
                    type="button"
                    disabled={!reportReason}
                    onClick={() => void submitReport()}
                    className="mt-2 inline-flex h-8 items-center rounded-lg bg-rose-600 px-3 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    Send report
                  </button>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await unblockUser(profile.id);
                      setNotice("Unblocked.");
                      setShowSafety(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not unblock.");
                    }
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-forest"
                >
                  Unblock (if you had blocked them)
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </CenFriendShell>
  );
}
