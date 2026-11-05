import { useCallback, useState } from "react";

import {
  followUser,
  likePost,
  savePost,
  unfollowUser,
  unlikePost,
  unsavePost,
} from "@/lib/social";
import type { FollowState, SocialPost } from "@/lib/social";

/**
 * Optimistic post interactions.
 *
 * The pattern the brief asks for is "optimistic UI, reconciled with the actual
 * backend response". Concretely:
 *
 *   1. flip the local row immediately, so the tap feels instant;
 *   2. send the request;
 *   3. overwrite the local row with the count the SERVER returned;
 *   4. on failure, put the original row back and surface the error.
 *
 * Step 3 matters more than it looks. Liking from two tabs, or double-tapping,
 * means the optimistic +1 can be wrong — and a heart that shows "24" over a
 * database that says 23 is a bug users notice.
 */
export function usePostInteractions(
  setPosts: (updater: (rows: SocialPost[]) => SocialPost[]) => void
) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  const mark = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleLike = useCallback(
    async (post: SocialPost) => {
      const nextLiked = !post.liked;
      setError("");

      setPosts((rows) =>
        rows.map((r) =>
          r.id === post.id
            ? { ...r, liked: nextLiked, like_count: Math.max(0, r.like_count + (nextLiked ? 1 : -1)) }
            : r
        )
      );
      mark(post.id, true);

      try {
        const res = nextLiked ? await likePost(post.id) : await unlikePost(post.id);
        // Reconcile with the truth, not the guess.
        setPosts((rows) =>
          rows.map((r) => (r.id === post.id ? { ...r, liked: res.liked, like_count: res.like_count } : r))
        );
      } catch (err) {
        // Roll back to exactly the row we started with.
        setPosts((rows) => rows.map((r) => (r.id === post.id ? post : r)));
        setError(err instanceof Error ? err.message : "Could not update the like.");
      } finally {
        mark(post.id, false);
      }
    },
    [mark, setPosts]
  );

  const toggleSave = useCallback(
    async (post: SocialPost) => {
      const nextSaved = !post.saved;
      setError("");
      setPosts((rows) => rows.map((r) => (r.id === post.id ? { ...r, saved: nextSaved } : r)));
      try {
        if (nextSaved) await savePost(post.id);
        else await unsavePost(post.id);
      } catch (err) {
        setPosts((rows) => rows.map((r) => (r.id === post.id ? post : r)));
        setError(err instanceof Error ? err.message : "Could not update your saved posts.");
      }
    },
    [setPosts]
  );

  return { toggleLike, toggleSave, error, setError, pending, mark };
}

/** Follow state for a set of people, keyed by user id.
 *
 * A feed can show the same author many times. Holding the relationship in one
 * map means following a creator updates every card by that creator at once,
 * instead of leaving the rest of the feed disagreeing.
 */
export function useFollowMap(initial: Record<string, FollowState> = {}) {
  const [states, setStates] = useState<Record<string, FollowState>>(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const set = useCallback((userId: string, state: FollowState) => {
    setStates((prev) => ({ ...prev, [userId]: state }));
  }, []);

  const toggle = useCallback(
    async (userId: string) => {
      const current = states[userId] ?? "follow";
      setError("");
      setBusy((prev) => new Set(prev).add(userId));
      try {
        if (current === "following" || current === "requested") {
          await unfollowUser(userId);
          set(userId, "follow");
        } else {
          const result = await followUser(userId);
          set(userId, result === "requested" ? "requested" : "following");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update the follow.");
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    },
    [set, states]
  );

  return { states, set, toggle, busy, error, setError };
}
