import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Heart, MessageCircle, UserPlus, AtSign, Repeat2, Reply } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { Avatar, SocialEmpty, SocialLoading } from "@/components/cenfriend/ui";
import { ErrorNote } from "@/components/farm/farmerUI";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  timeAgo,
} from "@/lib/social";
import type { SocialNotification } from "@/lib/social";

/**
 * Social notifications.
 *
 * The events themselves are written by database triggers, not by this app, so
 * a like is notified whether it came from the web client or a future mobile
 * one. This screen only reads and marks them read.
 *
 * Grouping is by most-recent and collapses nothing: a like and a follow are
 * different jobs for the reader (one is attention, one is a decision), and
 * merging them into "X and 4 others" is how a useful signal gets lost.
 */

const KIND_STYLE: Record<SocialNotification["kind"], { icon: LucideIcon; tone: string }> = {
  follow: { icon: UserPlus, tone: "bg-brand-50 text-brand-700" },
  follow_request: { icon: UserPlus, tone: "bg-amber-50 text-amber-700" },
  follow_accepted: { icon: CheckCheck, tone: "bg-brand-50 text-brand-700" },
  like: { icon: Heart, tone: "bg-rose-50 text-rose-600" },
  comment: { icon: MessageCircle, tone: "bg-sky-50 text-sky-700" },
  reply: { icon: Reply, tone: "bg-sky-50 text-sky-700" },
  mention: { icon: AtSign, tone: "bg-violet-50 text-violet-700" },
  share: { icon: Repeat2, tone: "bg-slate-100 text-slate-600" },
  system: { icon: Bell, tone: "bg-slate-100 text-slate-600" },
};

export default function CenFriendNotifications() {
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [offset, setOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listNotifications({ limit: 20 });
      setItems(res.items);
      setUnread(res.unread);
      setOffset(res.next_offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAll() {
    // Optimistic: the badge should clear the moment the user asks.
    const previous = items;
    const previousUnread = unread;
    const stamp = new Date().toISOString();
    setItems((rows) => rows.map((n) => ({ ...n, read_at: n.read_at ?? stamp })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setItems(previous);
      setUnread(previousUnread);
      setError(err instanceof Error ? err.message : "Could not mark notifications read.");
    }
  }

  async function markOne(n: SocialNotification) {
    if (n.read_at) return;
    setItems((rows) => rows.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
    setUnread((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(n.id);
    } catch {
      /* a badge is not worth an error banner */
    }
  }

  async function loadMore() {
    if (offset === null) return;
    try {
      const res = await listNotifications({ limit: 20, offset });
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...res.items.filter((n) => !seen.has(n.id))];
      });
      setOffset(res.next_offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more.");
    }
  }

  return (
    <CenFriendShell activeOverride="notifications">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">Notifications</h1>
          <p className="text-[11px] text-slate-500">
            {unread > 0 ? `${unread} unread` : "You are all caught up."}
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => void markAll()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3">
          <ErrorNote message={error} />
        </div>
      )}

      <section className="creator-card overflow-hidden">
        {loading ? (
          <SocialLoading label="Loading notifications…" />
        ) : items.length === 0 ? (
          <SocialEmpty
            icon={Bell}
            title="No notifications yet"
            description="Likes, comments, new followers and follow requests will show up here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const style = KIND_STYLE[n.kind] ?? KIND_STYLE.system;
              const Icon = style.icon;
              const content = (
                <div className={`flex items-start gap-2.5 px-3.5 py-2.5 ${n.read_at ? "" : "bg-brand-50/40"}`}>
                  <span className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full ${style.tone}`}>
                    <Icon className="h-4 w-4" />
                    {n.actor && (
                      <span className="absolute -bottom-1 -right-1">
                        <Avatar person={n.actor} size="xs" className="ring-2 ring-white" />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs leading-snug ${n.read_at ? "text-slate-600" : "font-semibold text-forest"}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{n.body}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-400">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                </div>
              );

              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link to={n.link} onClick={() => void markOne(n)} className="block hover:bg-slate-50">
                      {content}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => void markOne(n)} className="block w-full text-left hover:bg-slate-50">
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {offset !== null && items.length > 0 && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button type="button" onClick={() => void loadMore()} className="text-[11px] font-bold text-brand-700 hover:underline">
              Load more
            </button>
          </div>
        )}
      </section>
    </CenFriendShell>
  );
}
