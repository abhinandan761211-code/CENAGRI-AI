import { useState } from "react";
import { Bell, Briefcase, CheckCircle2, MailCheck, MessageSquare, Users } from "lucide-react";
import { Link } from "react-router-dom";
import EmployerLayout from "@/components/employer/EmployerLayout";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeEmployerError,
  listEmployerNotifications,
  markEmployerNotificationsRead,
} from "@/lib/employer";
import type { EmployerNotification } from "@/lib/employer";
import { formatDateTime } from "@/lib/worker";

const KIND_ICON = {
  application: Users,
  message: MessageSquare,
  work: Briefcase,
  system: Bell,
} as const;

const KIND_STYLE: Record<EmployerNotification["kind"], string> = {
  application: "bg-violet-50 text-violet-700",
  message: "bg-blue-50 text-blue-700",
  work: "bg-emerald-50 text-emerald-700",
  system: "bg-slate-50 text-slate-600",
};

/**
 * Employer notifications.
 *
 * Written by the same database trigger that tells the worker their application
 * was sent — the employer side of the same event, in one transaction.
 */
export default function EmployerNotifications() {
  const notifications = useWorkerData<EmployerNotification[]>(() => listEmployerNotifications(), [], describeEmployerError);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = notifications.data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;

  async function markAll() {
    setBusy(true);
    setError("");
    try {
      await markEmployerNotificationsRead();
      notifications.reload();
    } catch (err) {
      setError(describeEmployerError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EmployerLayout
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : "You are all caught up"}
      action={
        unread > 0 ? (
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <MailCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        ) : undefined
      }
    >
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {notifications.state === "loading" && <Loading label="Loading notifications…" />}
      {notifications.state === "error" && (
        <ErrorNotice message={notifications.error} onRetry={notifications.reload} />
      )}

      {notifications.state === "ready" && (
        <Panel title="Your alerts">
          {rows.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="You will be told here when a worker applies to one of your jobs or sends you a message."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const Icon = KIND_ICON[row.kind] ?? Bell;
                const isUnread = !row.read_at;
                const body = (
                  <div className="flex items-start gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${KIND_STYLE[row.kind]}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[12.5px] ${isUnread ? "font-bold text-forest" : "font-semibold text-slate-600"}`}>
                        {row.title}
                      </p>
                      {row.body && (
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{row.body}</p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(row.created_at)}</p>
                    </div>
                    {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                  </div>
                );
                return (
                  <li key={row.id} className={`px-4 py-3 ${isUnread ? "bg-brand-50/30" : ""}`}>
                    {row.link ? (
                      <Link to={row.link} className="block">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {rows.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Notifications are created by Kalika when a worker applies or writes to you.
        </p>
      )}
    </EmployerLayout>
  );
}
