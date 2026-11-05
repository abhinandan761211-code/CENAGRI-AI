import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { PostCard, SocialEmpty, SocialLoading } from "@/components/cenfriend/ui";
import { usePostInteractions } from "@/components/cenfriend/useSocialActions";
import { ErrorNote } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listSaved, reportContent, sharePost } from "@/lib/social";
import type { SocialPost } from "@/lib/social";

/**
 * Saved posts.
 *
 * Private by design: `saved_posts` is readable only by the person who saved
 * it, at the database policy level — so this list cannot be fetched for
 * somebody else even with a crafted request.
 */
export default function CenFriendSaved() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [offset, setOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const actions = usePostInteractions(setPosts);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSaved(20, 0);
      setPosts(res.items);
      setOffset(res.next_offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your saved posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleShare(post: SocialPost) {
    const url = `${window.location.origin}/cenfriend/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "CenFriend post", url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied.");
        window.setTimeout(() => setNotice(""), 2400);
      }
      await sharePost(post.id);
    } catch {
      /* cancelled */
    }
  }

  return (
    <CenFriendShell activeOverride="saved">
      <div className="mb-3">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">Saved posts</h1>
        <p className="text-[11px] text-slate-500">Only you can see this list.</p>
      </div>

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
        <SocialLoading label="Loading saved posts…" />
      ) : posts.length === 0 ? (
        <div className="creator-card">
          <SocialEmpty
            icon={Bookmark}
            title="Nothing saved yet"
            description="Tap the bookmark on any post to keep it here — useful for advice you want to come back to."
            action={
              <Link to="/cenfriend/explore" className="text-xs font-bold text-brand-700 hover:underline">
                Browse Explore
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              actions={{
                onLike: actions.toggleLike,
                onSave: async (p) => {
                  // Unsaving from this screen removes it from the list.
                  await actions.toggleSave(p);
                  setPosts((rows) => rows.filter((r) => r.id !== p.id || r.saved));
                },
                onComment: () => window.location.assign(`/cenfriend/post/${post.id}`),
                onShare: handleShare,
                onReport: async (p) => {
                  await reportContent("post", p.id, "other", "Reported from saved posts").catch(() => undefined);
                },
              }}
              followState={post.author_id === profile?.id ? "me" : "follow"}
              showFollowButton={false}
            />
          ))}
          {offset !== null && (
            <div className="pb-2 text-center">
              <button
                type="button"
                onClick={async () => {
                  if (offset === null) return;
                  try {
                    const res = await listSaved(20, offset);
                    setPosts((prev) => [...prev, ...res.items.filter((p) => !prev.some((x) => x.id === p.id))]);
                    setOffset(res.next_offset);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not load more.");
                  }
                }}
                className="text-[11px] font-bold text-brand-700 hover:underline"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </CenFriendShell>
  );
}
