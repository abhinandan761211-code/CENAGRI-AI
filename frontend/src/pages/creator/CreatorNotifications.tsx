import { useMemo, useState } from "react";
import { Bell, CheckCheck, MessageCircle, ThumbsUp, Users, Video } from "lucide-react";
import { Link } from "react-router-dom";
import CreatorShell, {
  CreatorEmpty,
  CreatorError,
  CreatorLoading,
} from "@/components/creator/CreatorShell";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  listCreatorNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  timeAgo,
} from "@/lib/creator";
import type { CreatorNotification } from "@/lib/creator";

const META: Record<
  CreatorNotification["kind"],
  { label: string; icon: typeof Bell; className: string }
> = {
  subscriber: { label: "Subscribers", icon: Users, className: "bg-[#16C784]/15 text-[#16C784]" },
  comment: { label: "Comments", icon: MessageCircle, className: "bg-sky-500/15 text-sky-300" },
  reply: { label: "Replies", icon: MessageCircle, className: "bg-sky-500/15 text-sky-300" },
  published: { label: "Publishing", icon: Video, className: "bg-violet-500/15 text-violet-300" },
  processing: { label: "Publishing", icon: Video, className: "bg-violet-500/15 text-violet-300" },
  moderation: { label: "Moderation", icon: ThumbsUp, className: "bg-amber-500/15 text-amber-300" },
  system: { label: "System", icon: Bell, className: "bg-white/10 text-slate-300" },
};

const FILTERS = ["all", "unread", "subscriber", "comment", "published", "system"] as const;
type Filter = (typeof FILTERS)[number];

/** Notifications raised by the SQL triggers plus platform messages. */
export default function CreatorNotifications() {
  const { data, setData, state, error, reload } = useRetailerData<CreatorNotification[]>(
    () => listCreatorNotifications(),
    []
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);

  const rows = data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "unread") return rows.filter((n) => !n.read_at);
    if (filter === "comment") return rows.filter((n) => n.kind === "comment" || n.kind === "reply");
    if (filter === "published")
      return rows.filter((n) => n.kind === "published" || n.kind === "processing");
    return rows.filter((n) => n.kind === filter);
  }, [rows, filter]);

  async function readOne(notification: CreatorNotification) {
    if (notification.read_at) return;
    try {
      await markNotificationRead(notification.id);
      setData(
        rows.map((n) =>
          n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
    } catch {
      /* leave it unread */
    }
  }

  async function readAll() {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setData(rows.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CreatorShell
      title="Notifications"
      subtitle={`${unread} unread of ${rows.length}`}
      action={
        unread > 0 ? (
          <button
            type="button"
            onClick={() => void readAll()}
            disabled={busy}
            className="creator-btn-ghost h-9 px-3 text-xs"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`creator-chip ${filter === key ? "is-active" : ""}`}
          >
            {key[0].toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {state === "error" && <CreatorError message={error} onRetry={() => void reload()} />}
      {state === "loading" && <CreatorLoading label="Loading notifications…" />}

      {state === "ready" && visible.length === 0 && (
        <div className="creator-card">
          <CreatorEmpty
            icon={Bell}
            title="Nothing here yet"
            description="New subscribers, comments and publishing updates land here automatically."
          />
        </div>
      )}

      {state === "ready" && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((notification) => {
            const meta = META[notification.kind] ?? META.system;
            const Icon = meta.icon;
            const isUnread = !notification.read_at;
            return (
              <li
                key={notification.id}
                className={`creator-card flex items-start gap-3 p-3.5 ${
                  isUnread ? "border-l-4 border-l-[#16C784]" : ""
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.className}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] ${isUnread ? "creator-heading font-bold" : "font-semibold text-slate-600"}`}>
                    {notification.title}
                  </p>
                  {notification.body && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                      {notification.body}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-slate-500">
                    {meta.label} · {timeAgo(notification.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {notification.link && (
                    <Link
                      to={notification.link}
                      onClick={() => void readOne(notification)}
                      className="creator-btn-ghost h-7 px-2 text-[10px]"
                    >
                      Open
                    </Link>
                  )}
                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => void readOne(notification)}
                      className="px-1 text-[10px] font-bold text-[#16C784]"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CreatorShell>
  );
}
