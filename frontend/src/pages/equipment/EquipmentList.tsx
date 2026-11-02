import { useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Search, Tractor, Trash2, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import EquipmentLayout, { EQUIPMENT_ROUTES, equipmentEditPath } from "@/components/equipment/EquipmentLayout";
import {
  ConditionTag,
  EquipmentEmptyIcon,
  EquipmentStatusPill,
  SectionHeading,
} from "@/components/equipment/ui";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  Modal,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABEL,
  RATE_UNIT_LABEL,
  archiveEquipment,
  describeEquipmentError,
  formatDate,
  formatINR,
  listBookings,
  listEquipment,
  listEquipmentStats,
  nextServiceLabel,
  setEquipmentStatus,
  toggleListing,
} from "@/lib/equipment";
import type { Equipment, EquipmentBooking, EquipmentStatus, EquipmentStats } from "@/lib/equipment";

/**
 * My Equipment.
 *
 * The grid is the owner's fleet. Booking activity and revenue come from
 * `equipment_stats_view` so the numbers here agree with the dashboard.
 *
 * Deleting is archiving: a machine with history must stay referable, and one
 * with an active booking cannot be archived at all.
 */
export default function EquipmentList() {
  const D = describeEquipmentError;
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const stats = useWorkerData<EquipmentStats[]>(() => listEquipmentStats(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "all">("all");
  const [category, setCategory] = useState("all");
  const [archiveTarget, setArchiveTarget] = useState<Equipment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const list = equipment.data ?? [];
  const statList = stats.data ?? [];
  const bookingList = bookings.data ?? [];
  const statById = useMemo(() => new Map(statList.map((s) => [s.id, s])), [statList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((e) => {
      if (status !== "all" && e.status !== status) return false;
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.brand ?? "").toLowerCase().includes(q) ||
        (e.model ?? "").toLowerCase().includes(q) ||
        (e.registration_no ?? "").toLowerCase().includes(q)
      );
    });
  }, [list, search, status, category]);

  function hasActiveBooking(equipmentId: string): boolean {
    return bookingList.some(
      (b) =>
        b.equipment_id === equipmentId &&
        !["closed", "rejected", "declined", "cancelled"].includes(b.status)
    );
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    setError("");
    try {
      await archiveEquipment(archiveTarget.id, hasActiveBooking(archiveTarget.id));
      setArchiveTarget(null);
      equipment.reload();
      stats.reload();
    } catch (err) {
      setError(D(err));
      setArchiveTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleListing(item: Equipment) {
    setError("");
    try {
      await toggleListing(item.id, !item.is_listed);
      equipment.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  async function handleStatus(item: Equipment, next: EquipmentStatus) {
    setError("");
    try {
      await setEquipmentStatus(item.id, next);
      equipment.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  if (equipment.state === "loading") {
    return (
      <EquipmentLayout title="My Equipment">
        <Loading label="Loading your fleet…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout
      title="My Equipment"
      subtitle="Every machine, its status and its earning"
      action={
        <Link
          to={EQUIPMENT_ROUTES.add}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add equipment
        </Link>
      }
    >
      {equipment.state === "error" && <ErrorNotice message={equipment.error} onRetry={equipment.reload} />}
      {error && <ErrorNotice message={error} />}

      <Panel title="Filters" description="Find a machine quickly">
        <div className="grid gap-2 p-4 sm:grid-cols-3 sm:p-5">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, brand, registration"
              className={`${inputClass} pl-8`}
            />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus | "all")} className={inputClass}>
            <option value="all">All statuses</option>
            {EQUIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EQUIPMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            <option value="all">All categories</option>
            {EQUIPMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <section>
        <SectionHeading
          title="Fleet"
          hint={`${filtered.length} of ${list.length} machine(s) shown`}
        />
        {list.length === 0 ? (
          <Panel title="Equipment">
            <EmptyState
              icon={EquipmentEmptyIcon}
              title="No equipment yet"
              description="Register your first machine — a tractor, harvester, seed drill, pump or drone. Add its price and working area, and it appears to renters in your district."
              action={
                <Link
                  to={EQUIPMENT_ROUTES.add}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                >
                  <Plus className="h-3.5 w-3.5" /> Add equipment
                </Link>
              }
            />
          </Panel>
        ) : filtered.length === 0 ? (
          <Panel title="Equipment">
            <div className="px-4 py-10 text-center text-[11.5px] text-slate-500">
              Nothing matches these filters.
            </div>
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const stat = statById.get(item.id);
              const service = nextServiceLabel(item.next_service_on);
              return (
                <article key={item.id} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={equipmentEditPath(item.id)}
                        className="truncate text-[13.5px] font-bold text-forest hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="truncate text-[10.5px] text-slate-500">
                        {item.category ?? "Uncategorised"}
                        {item.brand ? ` · ${item.brand}` : ""}
                        {item.model ? ` ${item.model}` : ""}
                      </p>
                    </div>
                    <EquipmentStatusPill status={item.status} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ConditionTag score={item.condition_score} />
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-800">
                      {formatINR(Number(item.rate_inr))} · {RATE_UNIT_LABEL[item.rate_unit].toLowerCase()}
                    </span>
                    {!item.is_listed && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        Hidden
                      </span>
                    )}
                  </div>

                  <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[10.5px]">
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bookings</dt>
                      <dd className="font-semibold text-forest">{stat?.active_bookings ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Revenue</dt>
                      <dd className="font-semibold text-forest">{formatINR(Number(stat?.revenue_inr ?? 0))}</dd>
                    </div>
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Service</dt>
                      <dd
                        className={`font-semibold ${service.overdue ? "text-rose-700" : service.days != null && service.days <= 30 ? "text-amber-700" : "text-forest"}`}
                      >
                        {service.label}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    <Link
                      to={equipmentEditPath(item.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleListing(item)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {item.is_listed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {item.is_listed ? "Hide" : "List"}
                    </button>
                    <select
                      value={item.status}
                      onChange={(e) => void handleStatus(item, e.target.value as EquipmentStatus)}
                      className="h-8 rounded-lg border border-slate-300 bg-white px-1.5 text-[10.5px] font-semibold text-slate-700"
                      aria-label="Equipment status"
                    >
                      {EQUIPMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {EQUIPMENT_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(item)}
                      aria-label={`Archive ${item.title}`}
                      className="ml-auto rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Panel title="How machine status works" description="What each status blocks">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li className="flex gap-1.5">
            <Tractor className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            <strong>Available</strong> — renters can request any free date.
          </li>
          <li className="flex gap-1.5">
            <Tractor className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            <strong>Booked / In use</strong> — set automatically by the booking as it advances.
          </li>
          <li className="flex gap-1.5">
            <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            <strong>Under maintenance</strong> — block the dates on the Availability screen; the database
            refuses a booking that overlaps them.
          </li>
          <li className="flex gap-1.5">
            <Tractor className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            Hiding a machine keeps it fully manageable — it just stops appearing to renters.
          </li>
        </ul>
      </Panel>

      <Modal
        open={archiveTarget != null}
        onClose={() => setArchiveTarget(null)}
        title="Archive this machine?"
        subtitle={archiveTarget?.title}
      >
        <div className="space-y-3">
          {archiveTarget && hasActiveBooking(archiveTarget.id) && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              This machine has an active booking. Close or cancel it first.
            </p>
          )}
          <p className="text-[12px] leading-relaxed text-slate-600">
            Archiving removes it from your fleet and from renter search. Past bookings, invoices and
            reviews stay intact so the history remains accurate.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setArchiveTarget(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={busy || (archiveTarget ? hasActiveBooking(archiveTarget.id) : false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> {busy ? "Archiving…" : "Archive"}
            </button>
          </div>
        </div>
      </Modal>
    </EquipmentLayout>
  );
}
