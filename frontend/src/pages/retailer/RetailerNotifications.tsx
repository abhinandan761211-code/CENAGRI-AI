import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  IndianRupee,
  ShoppingCart,
  Sprout,
} from "lucide-react";
import { Link } from "react-router-dom";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import { Badge, EmptyState, ErrorNotice, Loading } from "@/components/retailer/ui";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  formatDateTime,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/retailer";
import type { NotificationKind, RetailerNotification } from "@/lib/retailer";

const KIND_META: Record<NotificationKind, { label: string; icon: typeof Bell; className: string }> = {
  order: { label: "Orders", icon: ShoppingCart, className: "bg-blue-50 text-blue-700" },
  payment: { label: "Payments", icon: IndianRupee, className: "bg-emerald-50 text-emerald-700" },
  low_stock: { label: "Stock alerts", icon: AlertTriangle, className: "bg-amber-50 text-amber-700" },
  expiry: { label: "Expiry", icon: CalendarClock, className: "bg-orange-50 text-orange-700" },
  procurement: { label: "Procurement", icon: Sprout, className: "bg-violet-50 text-violet-700" },
  system: { label: "System", icon: BellOff, className: "bg-slate-100 text-slate-600" },
};

const FILTERS = ["all", "unread", "order", "payment", "low_stock", "expiry", "procurement"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  unread: "Unread",
  order: "Orders",
  payment: "Payments",
  low_stock: "Low stock",
  expiry: "Expiry",
  procurement: "Procurement",
};

/**
 * Notifications — order, payment, low-stock and expiry alerts.
 *
 * Most rows are written by DB triggers (low stock, expiry, new order) so the
 * bell is accurate even if nobody opens this screen; marking them read is the
 * only write this page performs.
 */
export default function RetailerNotifications() {
  const { data, setData, state, error, reload } = useRetailerData<RetailerNotification[]>(
    () => listNotifications(),
    []
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);

  const rows = data ?? [];
  const unreadCount = rows.filter((n) => !n.read_at).length;

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "unread") return rows.filter((n) => !n.read_at);
    return rows.filter((n) => n.kind === filter);
  }, [rows, filter]);

  async function handleRead(notification: RetailerNotification) {
    if (notification.read_at) return;
    try {
      await markNotificationRead(notification.id);
      setData(rows.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)));
    } catch {
      /* keep the row unread if the write fails */
    }
  }

  async function handleReadAll() {
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
    <RetailerLayout
      title="Notifications"
      subtitle={`${unreadCount} unread of ${rows.length}`}
      action={
        unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleReadAll()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {FILTERS.map((key) => {
          const active = filter === key;
          const count =
            key === "all"
              ? rows.length
              : key === "unread"
                ? unreadCount
                : rows.filter((n) => n.kind === key).length;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                active ? "bg-slate-100 text-forest" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {FILTER_LABEL[key]}
              <span className="ml-1.5 text-[10px] text-slate-400">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {state === "loading" && <Loading label="Loading notifications…" />}
        {state === "error" && <ErrorNotice message={error} onRetry={() => void reload()} />}

        {state === "ready" && visible.length === 0 && (
          <div className="card">
            <EmptyState
              icon={Bell}
              title={rows.length === 0 ? "No notifications yet" : "Nothing in this filter"}
              description="Order, payment, low-stock and expiry alerts are raised automatically and land here."
            />
          </div>
        )}

        {state === "ready" && visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((notification) => {
              const meta = KIND_META[notification.kind];
              const Icon = meta.icon;
              const unread = !notification.read_at;
              return (
                <li
                  key={notification.id}
                  className={`card flex items-start gap-3 p-4 ${
                    unread ? "border-l-4 border-l-brand-600" : ""
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.className}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-[13px] ${unread ? "font-bold text-forest" : "font-semibold text-slate-700"}`}>
                        {notification.title}
                      </p>
                      <Badge className="bg-slate-100 text-slate-600">{meta.label}</Badge>
                      {unread && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                    </div>
                    {notification.body && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{notification.body}</p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {notification.link && (
                      <Link
                        to={notification.link}
                        className="h-7 rounded-lg border border-slate-200 px-2 text-[10px] font-bold leading-7 text-slate-600 transition hover:bg-slate-50"
                      >
                        Open
                      </Link>
                    )}
                    {unread && (
                      <button
                        type="button"
                        onClick={() => void handleRead(notification)}
                        className="h-7 rounded-lg px-2 text-[10px] font-bold text-brand-700 transition hover:bg-brand-50"
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
      </div>
    </RetailerLayout>
  );
}
