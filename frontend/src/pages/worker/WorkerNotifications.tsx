import { useMemo, useState } from "react";
import {
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  FileText,
  IndianRupee,
  MailCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import WorkerLayout from "@/components/worker/WorkerLayout";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeWorkerError,
  formatDateTime,
  listWorkerNotifications,
  markAllWorkerNotificationsRead,
  markWorkerNotificationRead,
} from "@/lib/worker";
import type { WorkerNotification } from "@/lib/worker";

const KIND_ICON = {
  job: Briefcase,
  application: FileText,
  schedule: CalendarDays,
  payment: IndianRupee,
  verification: CheckCircle2,
  system: Bell,
} as const;

const KIND_STYLE: Record<WorkerNotification["kind"], string> = {
  job: "bg-blue-50 text-blue-700",
  application: "bg-violet-50 text-violet-700",
  schedule: "bg-amber-50 text-amber-700",
  payment: "bg-emerald-50 text-emerald-700",
  verification: "bg-teal-50 text-teal-700",
  system: "bg-slate-50 text-slate-600",
};

/**
 * Notifications.
 *
 * Rows come from `worker_notifications`, which the database writes when an
 * application is sent or accepted. Marking read is the only mutation here.
 */
export default function WorkerNotifications() {
  const notifications = useWorkerData<WorkerNotification[]>(() => listWorkerNotifications());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const rows = notifications.data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;
  const visible = useMemo(
    () => (filter === "unread" ? rows.filter((r) => !r.read_at) : rows),
    [rows, filter]
  );

  async function markAll() {
    setBusy(true);
    setError("");
    try {
      await markAllWorkerNotificationsRead();
      notifications.reload();
    } catch (err) {
      setError(describeWorkerError(err));
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    try {
      await markWorkerNotificationRead(id);
      notifications.reload();
    } catch (err) {
      setError(describeWorkerError(err));
    }
  }

  return (
    <WorkerLayout
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
      <div className="flex gap-1">
        {(["all", "unread"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-lg px-3 py-1.5 text-[11.5px] font-semibold capitalize transition ${filter === key
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
          >
            {key}
            {key === "unread" && unread > 0 && (
              <span className={`ml-1.5 text-[10px] ${filter === key ? "text-white/70" : "text-slate-400"}`}>
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {notifications.state === "loading" && <Loading label="Loading notifications…" />}
      {notifications.state === "error" && (
        <ErrorNotice message={notifications.error} onRetry={notifications.reload} />
      )}

      {notifications.state === "ready" && (
        <Panel title="Your alerts">
          {visible.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
              description="Job opportunities, application updates, schedule reminders and payment notices will appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((row) => {
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
                  <li key={row.id} className={`px-4 py-3 transition ${isUnread ? "bg-brand-50/30" : ""}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {row.link ? (
                          <Link to={row.link} onClick={() => isUnread && void markOne(row.id)} className="block">
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </div>
                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => void markOne(row.id)}
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 hover:bg-brand-50"
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
        </Panel>
      )}
    </WorkerLayout>
  );
}
