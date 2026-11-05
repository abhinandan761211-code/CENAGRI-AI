import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Compass, PenSquare, RefreshCw, Users } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { FollowButton, FeedTabs, PostCard, SocialEmpty, SocialLoading } from "@/components/cenfriend/ui";
import { useFollowMap, usePostInteractions } from "@/components/cenfriend/useSocialActions";
import { ErrorNote, PrimaryButton } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { addComment, deletePost, getFeed, getSuggestedAccounts, reportContent, sharePost } from "@/lib/social";
import type { FeedMode, PersonCard, SocialPost } from "@/lib/social";

/**
 * CenFriend home feed.
 *
 * Three filters, one contract:
 *   Following   — accounts I follow, chronological, privacy-filtered by the API
 *   Recommended — public posts I have not seen from people I follow
 *   Latest      — the same public pool, strictly newest first
 *
 * "Never show private posts to unauthorized users" is enforced on the server,
 * not here. This page cannot leak a private post because the API never sends
 * one — the filter is the API's job and is tested as such.
 */
export default function CenFriendHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<FeedMode>("following");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [suggested, setSuggested] = useState<PersonCard[]>([]);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const actions = usePostInteractions(setPosts);
  const follow = useFollowMap({});

  const load = useCallback(
    async (nextMode: FeedMode) => {
      setLoading(true);
      setError("");
      try {
        const res = await getFeed(nextMode, null, 12);
        setPosts(res.items);
        setCursor(res.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the feed.");
        setPosts([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(mode);
  }, [mode, load]);

  useEffect(() => {
    getSuggestedAccounts(5)
      .then((res) => setSuggested(res.items))
      .catch(() => setSuggested([]));
  }, []);

  // Infinite scroll: fetch the next page when the sentinel is on screen.
  useEffect(() => {
    if (!sentinel.current || !cursor) return;
    const node = sentinel.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingMore) return;
        setLoadingMore(true);
        getFeed(mode, cursor, 12)
          .then((res) => {
            // De-dupe: a post inserted between two requests could repeat.
            setPosts((prev) => {
              const seen = new Set(prev.map((p) => p.id));
              return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
            });
            setCursor(res.next_cursor);
          })
          .catch(() => setCursor(null))
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, mode, loadingMore]);

  async function handleShare(post: SocialPost) {
    const url = `${window.location.origin}/cenfriend/post/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "CenFriend post", url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied.");
        window.setTimeout(() => setNotice(""), 2400);
      }
      await sharePost(post.id);
      setPosts((rows) => rows.map((r) => (r.id === post.id ? { ...r, share_count: r.share_count + 1 } : r)));
    } catch {
      /* the user cancelled the share sheet — not an error worth showing */
    }
  }

  async function handleReport(post: SocialPost) {
    try {
      await reportContent("post", post.id, "other", "Reported from the feed");
      setNotice("Report sent to moderation. Thank you.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : "Could not send the report.");
    }
  }

  async function handleDelete(post: SocialPost) {
    try {
      await deletePost(post.id);
      setPosts((rows) => rows.filter((r) => r.id !== post.id));
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : "Could not delete the post.");
    }
  }

  const message =
    error ||
    actions.error ||
    follow.error ||
    "";

  return (
    <CenFriendShell activeOverride="home" wide>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">CenFriend</h1>
          <p className="text-[11px] text-slate-500">
            Your agriculture community — share what worked, learn what didn't.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/cenfriend/create"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-bold text-white hover:bg-brand-800"
          >
            <PenSquare className="h-3.5 w-3.5" /> Create post
          </Link>
          <button
            type="button"
            onClick={() => void load(mode)}
            aria-label="Refresh feed"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-brand-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <FeedTabs value={mode} onChange={setMode} />
      </div>

      {message && (
        <div className="mb-3">
          <ErrorNote message={message} />
        </div>
      )}

      {notice && (
        <p role="status" className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {notice}
        </p>
      )}

      {loading ? (
        <SocialLoading label="Loading your feed…" />
      ) : posts.length === 0 ? (
        <div className="creator-card">
          {mode === "following" ? (
            <SocialEmpty
              icon={Users}
              title="Your feed is empty"
              description="Follow farmers, buyers and creators to see their posts here. Start with someone from your district."
              action={
                <Link
                  to="/cenfriend/explore"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-bold text-white hover:bg-brand-800"
                >
                  <Compass className="h-3.5 w-3.5" /> Find people
                </Link>
              }
            />
          ) : (
            <SocialEmpty
              icon={Compass}
              title="Nothing here yet"
              description="No public posts match this filter right now. Try Latest, or be the first to post."
              action={
                <PrimaryButton onClick={() => setMode("following")}>Back to Following</PrimaryButton>
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              actions={{
                onLike: actions.toggleLike,
                onSave: actions.toggleSave,
                onComment: (p) => navigate(`/cenfriend/post/${p.id}`),
                onInlineComment: async (p, body) => {
                  await addComment(p.id, body);
                  setPosts((rows) => rows.map((r) => (r.id === p.id ? { ...r, comment_count: r.comment_count + 1 } : r)));
                },
                onShare: handleShare,
                onReport: handleReport,
                onDelete: post.author_id === profile?.id ? handleDelete : undefined,
              }}
              followState={follow.states[post.author_id] ?? (post.author_id === profile?.id ? "me" : "follow")}
              onFollow={() => void follow.toggle(post.author_id)}
              followBusy={follow.busy.has(post.author_id)}
              showFollowButton={post.author_id !== profile?.id}
            />
          ))}
          <div ref={sentinel} className="h-1" />
          {loadingMore && <SocialLoading label="Loading more…" />}
          {!cursor && posts.length > 0 && (
            <p className="pb-2 text-center text-[11px] text-slate-400">You're all caught up.</p>
          )}
        </div>
      )}

      {/* Suggested accounts under the feed on phones, where the rail is hidden */}
      {suggested.length > 0 && (
        <section className="creator-card mt-4 md:hidden">
          <p className="border-b border-slate-100 px-3.5 py-2.5 text-xs font-bold text-forest">People to follow</p>
          <ul className="divide-y divide-slate-50">
            {suggested.slice(0, 4).map((person) => (
              <li key={person.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <Link to={`/cenfriend/u/${person.id}`} className="shrink-0">
                  <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-brand-700 text-[10px] font-bold text-white">
                    {person.avatar_url ? (
                      <img src={person.avatar_url} alt="" className="h-8 w-8 object-cover" />
                    ) : (
                      (person.full_name ?? "?").slice(0, 2).toUpperCase()
                    )}
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-forest">{person.full_name ?? "Kalika member"}</p>
                  <p className="truncate text-[10px] text-slate-500">{person.role ?? "Member"}</p>
                </div>
                <FollowButton
                  state={follow.states[person.id] ?? "follow"}
                  busy={follow.busy.has(person.id)}
                  onPress={() => void follow.toggle(person.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </CenFriendShell>
  );
}
