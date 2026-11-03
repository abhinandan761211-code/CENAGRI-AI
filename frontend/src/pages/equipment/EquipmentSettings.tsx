import { useMemo, useState } from "react";
import { Bell, BellOff, CheckCheck, LogOut, Settings2, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeEquipmentError,
  formatDateTime,
  listEquipment,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/equipment";
import type { Equipment, EquipmentNotification } from "@/lib/equipment";

/**
 * Settings.
 *
 * Notification inbox plus the account-level information that belongs to this
 * module. Sign-out uses the shared auth session — there is no second one.
 */
export default function EquipmentSettings() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const D = describeEquipmentError;

  const notifications = useWorkerData<EquipmentNotification[]>(() => listNotifications(), [], D);
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const list = notifications.data ?? [];
  const equipmentList = equipment.data ?? [];
  const unread = useMemo(() => list.filter((n) => !n.read_at), [list]);

  async function handleMarkAll() {
    setBusy(true);
    setError("");
    try {
      await markAllNotificationsRead();
      notifications.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkOne(id: string) {
    setError("");
    try {
      await markNotificationRead(id);
      notifications.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  if (notifications.state === "loading") {
    return (
      <EquipmentLayout title="Settings">
        <Loading label="Loading settings…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout title="Settings" subtitle="Notifications, account and module information">
      {notifications.state === "error" && (
        <ErrorNotice message={notifications.error} onRetry={notifications.reload} />
      )}
      {error && <ErrorNotice message={error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Notifications"
          description={`${unread.length} unread`}
          className="lg:col-span-2"
          action={
            unread.length > 0 ? (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            ) : undefined
          }
        >
          {list.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <BellOff className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-[11.5px] text-slate-500">
                No notifications yet. New requests, bookings, operator assignments and payment updates
                appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-2.5 px-4 py-2.5 ${n.read_at ? "" : "bg-brand-50/40"}`}
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${n.read_at ? "bg-slate-100 text-slate-500" : "bg-brand-100 text-brand-800"
                      }`}
                  >
                    <Bell className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold text-forest">{n.title}</p>
                    {n.body && <p className="text-[10.5px] text-slate-500">{n.body}</p>}
                    <p className="text-[10px] text-slate-400">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <button
                      type="button"
                      onClick={() => void handleMarkOne(n.id)}
                      className="shrink-0 text-[10px] font-bold text-brand-700 hover:underline"
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <aside className="space-y-4">
          <Panel title="Account" description="Shared across every CenAGRI account">
            <div className="space-y-2 p-4 text-[11.5px]">
              <Row label="Name" value={profile?.full_name ?? user?.email?.split("@")[0] ?? "—"} />
              <Row label="Email" value={user?.email ?? "—"} />
              <Row label="Phone" value={profile?.phone ?? "—"} />
              <Row label="Role" value={profile?.role ?? "Equipment"} />
              <p className="pt-1 text-[10px] leading-relaxed text-slate-400">
                These come from your CenAGRI profile — changing them here would create a second copy.
              </p>
            </div>
          </Panel>

          <Panel title="Session">
            <div className="p-4">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </Panel>
        </aside>
      </div>

      <Panel title="Module information" description="How this account is wired">
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>
              Access is scoped by row-level security to{" "}
              <strong>{user?.id?.slice(0, 8) ?? "your account"}</strong>. You only see your own machines,
              bookings, operators and invoices; a renter only sees the machine they booked and the operator
              assigned to them.
            </span>
          </div>
          <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
            <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{equipmentList.length} machine(s) linked to this account. Operator permissions and licence files stay private to you.</span>
          </div>
        </div>
      </Panel>
    </EquipmentLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-semibold text-forest">{value}</span>
    </div>
  );
}
