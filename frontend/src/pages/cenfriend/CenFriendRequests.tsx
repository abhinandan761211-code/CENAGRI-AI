import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Send, UserPlus, X } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { PersonRow, SocialEmpty, SocialLoading } from "@/components/cenfriend/ui";
import { ErrorNote } from "@/components/farm/farmerUI";
import {
  acceptFollowRequest,
  cancelFollowRequest,
  listFollowRequests,
  listSentRequests,
  rejectFollowRequest,
} from "@/lib/social";
import type { PersonCard } from "@/lib/social";

/**
 * Follow requests.
 *
 * Two lists, because they are two different jobs: an INBOX of people asking to
 * follow me (accept / decline), and the OUTBOX of requests I have sent that
 * nobody has answered (cancel). Showing only one of them is the usual bug —
 * a user with a pending request has no way to withdraw it.
 *
 * Only the account being asked can read the inbox, and only the account that
 * sent a request can cancel it; both rules are enforced by the API.
 */
export default function CenFriendRequests() {
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [incoming, setIncoming] = useState<PersonCard[]>([]);
  const [sent, setSent] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inRes, sentRes] = await Promise.all([listFollowRequests(), listSentRequests()]);
      setIncoming(inRes.items);
      setSent(sentRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load follow requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(person: PersonCard, accept: boolean) {
    setBusy((prev) => new Set(prev).add(person.id));
    setError("");
    try {
      if (accept) await acceptFollowRequest(person.id);
      else await rejectFollowRequest(person.id);
      setIncoming((prev) => prev.filter((p) => p.id !== person.id));
      setNotice(accept ? `You accepted ${person.full_name ?? "the request"}.` : "Request declined.");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the request.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(person.id);
        return next;
      });
    }
  }

  async function cancel(person: PersonCard) {
    setBusy((prev) => new Set(prev).add(person.id));
    try {
      await cancelFollowRequest(person.id);
      setSent((prev) => prev.filter((p) => p.id !== person.id));
      setNotice("Request cancelled.");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the request.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(person.id);
        return next;
      });
    }
  }

  const items = tab === "received" ? incoming : sent;

  return (
    <CenFriendShell activeOverride="requests">
      <div className="mb-3">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">Follow requests</h1>
        <p className="text-[11px] text-slate-500">
          Private accounts approve who can follow them. Nothing is shared until you accept.
        </p>
      </div>

      <div role="tablist" className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          role="tab"
          type="button"
          aria-selected={tab === "received"}
          onClick={() => setTab("received")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold transition ${tab === "received" ? "bg-white text-forest shadow-sm" : "text-slate-500"
            }`}
        >
          <UserPlus className="h-3.5 w-3.5" /> Received
          {incoming.length > 0 && (
            <span className="rounded-full bg-rose-600 px-1.5 text-[9px] font-bold text-white">{incoming.length}</span>
          )}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === "sent"}
          onClick={() => setTab("sent")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold transition ${tab === "sent" ? "bg-white text-forest shadow-sm" : "text-slate-500"
            }`}
        >
          <Send className="h-3.5 w-3.5" /> Sent
          {sent.length > 0 && (
            <span className="rounded-full bg-slate-400 px-1.5 text-[9px] font-bold text-white">{sent.length}</span>
          )}
        </button>
      </div>

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

      <section className="creator-card overflow-hidden">
        {loading ? (
          <SocialLoading label="Loading requests…" />
        ) : items.length === 0 ? (
          <SocialEmpty
            icon={tab === "received" ? Clock : Send}
            title={tab === "received" ? "No pending requests" : "No sent requests waiting"}
            description={
              tab === "received"
                ? "When someone asks to follow your private account, their request appears here."
                : "Requests you send to private accounts stay here until they approve or decline."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((person) => (
              <li key={person.id}>
                <PersonRow
                  person={person}
                  subtitle={`${person.role ?? "Member"}${person.district ? ` · ${person.district}` : ""}`}
                  action={
                    tab === "received" ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void decide(person, true)}
                          disabled={busy.has(person.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-brand-700 px-2.5 text-[11px] font-bold text-white disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void decide(person, false)}
                          disabled={busy.has(person.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> Decline
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void cancel(person)}
                        disabled={busy.has(person.id)}
                        className="h-7 shrink-0 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold text-slate-600 disabled:opacity-50"
                      >
                        {busy.has(person.id) ? "…" : "Cancel"}
                      </button>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </CenFriendShell>
  );
}
