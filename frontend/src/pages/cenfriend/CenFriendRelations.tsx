import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { UserCheck, Users } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { FollowButton, PersonRow, SocialEmpty, SocialLoading } from "@/components/cenfriend/ui";
import { useFollowMap } from "@/components/cenfriend/useSocialActions";
import { ErrorNote } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listFollowers, listFollowing, removeFollower } from "@/lib/social";
import type { PersonCard } from "@/lib/social";

/**
 * Followers and Following for one account.
 *
 * The same page serves both lists because the only real differences are which
 * endpoint is read and which action each row offers — "Remove" on a follower,
 * "Follow"/"Following" on someone I follow. Splitting them into two files
 * would duplicate the paging, error and empty handling for no gain.
 *
 * A private account's lists are refused by the API (403) unless the viewer is
 * an accepted follower, so this page never has to decide that itself.
 */
export default function CenFriendRelations({ mode }: { mode: "followers" | "following" }) {
  const { id } = useParams<{ id: string }>();
  const { profile: me } = useAuth();
  const targetId = id ?? me?.id ?? "";

  const [people, setPeople] = useState<PersonCard[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const follow = useFollowMap({});
  const isMine = targetId === me?.id;

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError("");
    try {
      const res = mode === "followers" ? await listFollowers(targetId, 20, 0) : await listFollowing(targetId, 20, 0);
      setPeople(res.items);
      setTotal(res.total ?? res.items.length);
      setOffset(res.next_offset);
      for (const person of res.items) {
        if (person.follow_state !== "me") follow.set(person.id, person.follow_state);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this list.");
      setPeople([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (offset === null) return;
    try {
      const res =
        mode === "followers" ? await listFollowers(targetId, 20, offset) : await listFollowing(targetId, 20, offset);
      setPeople((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
      });
      setOffset(res.next_offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more.");
    }
  }

  async function remove(person: PersonCard) {
    setBusy((prev) => new Set(prev).add(person.id));
    setError("");
    try {
      await removeFollower(person.id);
      setPeople((prev) => prev.filter((p) => p.id !== person.id));
      setTotal((n) => (n === null ? n : Math.max(0, n - 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this follower.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(person.id);
        return next;
      });
    }
  }

  const title = mode === "followers" ? "Followers" : "Following";

  return (
    <CenFriendShell activeOverride="profile">
      <div className="mb-3">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">
          {title}
          {total !== null && <span className="ml-1.5 text-sm font-bold text-slate-400">{total}</span>}
        </h1>
        <p className="text-[11px] text-slate-500">
          {mode === "followers"
            ? isMine
              ? "Accounts that follow you. Remove anyone you no longer want in your audience."
              : "Accounts that follow this member."
            : isMine
              ? "Accounts you follow. Their posts appear in your Following feed."
              : "Accounts this member follows."}
        </p>
      </div>

      {(error || follow.error) && (
        <div className="mb-3">
          <ErrorNote message={error || follow.error} />
        </div>
      )}

      <section className="creator-card overflow-hidden">
        {loading ? (
          <SocialLoading label={`Loading ${title.toLowerCase()}…`} />
        ) : people.length === 0 ? (
          <SocialEmpty
            icon={mode === "followers" ? Users : UserCheck}
            title={mode === "followers" ? "No followers yet" : "Not following anyone yet"}
            description={
              mode === "followers"
                ? "When people follow this account, they will be listed here."
                : "Follow farmers and creators from Explore to fill this list."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {people.map((person) => (
              <li key={person.id}>
                <PersonRow
                  person={person}
                  action={
                    mode === "followers" && isMine ? (
                      <button
                        type="button"
                        onClick={() => void remove(person)}
                        disabled={busy.has(person.id)}
                        className="h-7 shrink-0 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      >
                        {busy.has(person.id) ? "…" : "Remove"}
                      </button>
                    ) : (
                      <FollowButton
                        state={follow.states[person.id] ?? person.follow_state}
                        busy={follow.busy.has(person.id)}
                        onPress={() => void follow.toggle(person.id)}
                      />
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {offset !== null && people.length > 0 && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              className="text-[11px] font-bold text-brand-700 hover:underline"
            >
              Load more
            </button>
          </div>
        )}
      </section>
    </CenFriendShell>
  );
}
