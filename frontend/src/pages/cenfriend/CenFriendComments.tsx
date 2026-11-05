import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, RefreshCw } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { Avatar } from "@/components/cenfriend/ui";
import { SuggestSkeleton } from "@/components/cenfriend/Skeletons";
import { ErrorNote } from "@/components/farm/farmerUI";
import { getCommentInbox, timeAgo } from "@/lib/social";
import type { InboxComment } from "@/lib/social";

/**
 * Comments on my posts.
 *
 * A plain reverse-chronological inbox rather than a threaded screen: the point
 * is to answer people, and the answer happens on the post where the reply can
 * be seen by everyone in the thread. Each row links there.
 */
export default function CenFriendComments() {
  const [items, setItems] = useState<InboxComment[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    setItems(null);
    getCommentInbox(30)
      .then((res) => setItems(res.items))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load your comments.");
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  return (
    <CenFriendShell activeOverride="comments">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">Comments</h1>
          <p className="text-[11px] text-slate-500">Recent comments on the posts you shared.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-brand-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}

      <section className="creator-card overflow-hidden">
        {items === null ? (
          <SuggestSkeleton rows={5} />
        ) : items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <MessageSquare className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-forest">No comments yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
              When someone comments on your posts it will appear here.
            </p>
            <Link
              to="/cenfriend/create"
              className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-bold text-white hover:bg-brand-800"
            >
              Create a post
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <Link to={`/cenfriend/u/${c.author.id}`} className="shrink-0">
                  <Avatar person={c.author} size="md" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <Link to={`/cenfriend/u/${c.author.id}`} className="font-bold text-forest hover:underline">
                      {c.author.full_name ?? c.author.username ?? "Kalika member"}
                    </Link>
                    <span className="text-slate-400">{timeAgo(c.created_at)}</span>
                  </p>
                  <p className="mt-0.5 break-words text-[13px] leading-relaxed text-slate-700">{c.body}</p>
                  <Link
                    to={`/cenfriend/post/${c.post_id}`}
                    className="mt-1 line-clamp-1 text-[11px] text-slate-400 hover:text-brand-700"
                  >
                    On: {c.post.body?.slice(0, 90) ?? "your post"}
                  </Link>
                </div>
                {c.post.media_urls[0] && (
                  <Link to={`/cenfriend/post/${c.post_id}`} className="shrink-0">
                    <img src={c.post.media_urls[0]} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </CenFriendShell>
  );
}
