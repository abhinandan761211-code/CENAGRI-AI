import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import EquipmentLayout, { EQUIPMENT_ROUTES, equipmentEditPath } from "@/components/equipment/EquipmentLayout";
import { SectionHeading } from "@/components/equipment/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  MAINTENANCE_KINDS,
  MAINTENANCE_LABEL,
  describeEquipmentError,
  formatDate,
  formatINR,
  listEquipment,
  listMaintenance,
  nextServiceLabel,
  recordMaintenance,
  todayISO,
} from "@/lib/equipment";
import type { Equipment, MaintenanceKind, MaintenanceRecord } from "@/lib/equipment";

/**
 * Equipment Maintenance.
 *
 * A maintenance record keeps service history; the repair window is separately
 * blocked on the calendar so the machine cannot be booked while it is off the
 * road. Logging a repair or breakdown marks the machine "under maintenance";
 * logging a routine service does not, because the machine usually keeps working.
 */
export default function EquipmentMaintenance() {
  const D = describeEquipmentError;
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const records = useWorkerData<MaintenanceRecord[]>(() => listMaintenance(), [], D);

  const [open, setOpen] = useState(false);
  const [filterId, setFilterId] = useState("all");

  const equipmentList = equipment.data ?? [];
  const recordList = records.data ?? [];
  const eqById = useMemo(() => new Map(equipmentList.map((e) => [e.id, e])), [equipmentList]);

  const mine = filterId === "all" ? equipmentList : equipmentList.filter((e) => e.id === filterId);
  const filtered = filterId === "all" ? recordList : recordList.filter((r) => r.equipment_id === filterId);

  const totalCost = recordList.reduce((s, r) => s + Number(r.cost_inr), 0);
  const thisYear = recordList
    .filter((r) => r.service_on.slice(0, 4) === todayISO().slice(0, 4))
    .reduce((s, r) => s + Number(r.cost_inr), 0);
  const breakdowns = recordList.filter((r) => r.kind === "breakdown").length;

  if (equipment.state === "loading") {
    return (
      <EquipmentLayout title="Equipment Maintenance">
        <Loading label="Loading maintenance…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout
      title="Equipment Maintenance"
      subtitle="Service history, repairs and downtime"
      action={
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={equipmentList.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Log maintenance
        </button>
      }
    >
      {equipment.state === "error" && <ErrorNotice message={equipment.error} onRetry={equipment.reload} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Records" value={String(recordList.length)} hint="All time" />
        <Tile label="Total cost" value={formatINR(totalCost)} hint="Across the fleet" />
        <Tile label="This year" value={formatINR(thisYear)} hint="Maintenance spend" />
        <Tile
          label="Breakdowns"
          value={String(breakdowns)}
          hint={breakdowns > 0 ? "Unplanned stops" : "None logged"}
          tone={breakdowns > 0 ? "warn" : undefined}
        />
      </section>

      <section>
        <SectionHeading title="Service due" hint="Next service date per machine" />
        <Panel title="Reminders" description="Sorted by urgency">
          {mine.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No machine registered.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {mine
                .map((e) => ({ e, service: nextServiceLabel(e.next_service_on) }))
                .sort((a, b) => (a.service.days ?? 9999) - (b.service.days ?? 9999))
                .map(({ e, service }) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={equipmentEditPath(e.id)}
                        className="truncate text-[12px] font-semibold text-forest hover:underline"
                      >
                        {e.title}
                      </Link>
                      <p className="text-[10.5px] text-slate-500">
                        Last service {e.last_service_on ? formatDate(e.last_service_on) : "not recorded"}
                        {e.next_service_on ? ` · next ${formatDate(e.next_service_on)}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${service.overdue
                          ? "bg-rose-100 text-rose-800"
                          : service.days != null && service.days <= 30
                            ? "bg-amber-100 text-amber-800"
                            : service.days == null
                              ? "bg-slate-100 text-slate-500"
                              : "bg-emerald-100 text-emerald-800"
                        }`}
                    >
                      {service.label}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </section>

      <Panel
        title="Service history"
        description={`${filtered.length} record(s)`}
        action={
          <select
            value={filterId}
            onChange={(e) => setFilterId(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11.5px] text-slate-700"
          >
            <option value="all">All machines</option>
            {equipmentList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No maintenance recorded"
            description="Log a service, repair or breakdown to keep the machine's history and its service dates in step. A repair can block the calendar in the same step, so the machine is not bookable while it is off the road."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">Date</th>
                  <th className="px-4 py-2 font-bold">Machine</th>
                  <th className="px-4 py-2 font-bold">Kind</th>
                  <th className="px-4 py-2 font-bold">Description</th>
                  <th className="px-4 py-2 font-bold">Cost</th>
                  <th className="px-4 py-2 font-bold">Next due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-500">{formatDate(r.service_on)}</td>
                    <td className="px-4 py-2.5 font-semibold text-forest">
                      {eqById.get(r.equipment_id)?.title ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.kind === "breakdown"
                            ? "bg-rose-100 text-rose-800"
                            : r.kind === "repair"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                      >
                        {MAINTENANCE_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-2.5 text-slate-600" title={r.description}>
                      {r.description}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">
                      {Number(r.cost_inr) > 0 ? formatINR(Number(r.cost_inr)) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.next_due_on ? formatDate(r.next_due_on) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Statuses and what they block" description="So a machine is never promised while broken">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li className="flex gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            Marking a repair or breakdown sets the machine to <strong>Under maintenance</strong>.
          </li>
          <li className="flex gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            Blocking the downtime dates is what actually stops a booking — the database refuses any
            overlap.
          </li>
          <li className="flex gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            A block cannot be placed over an existing booking; cancel or move it first.
          </li>
        </ul>
        <div className="border-t border-slate-100 px-4 py-3">
          <Link to={EQUIPMENT_ROUTES.availability} className="text-[11px] font-bold text-brand-700 hover:underline">
            Open availability →
          </Link>
        </div>
      </Panel>

      {open && (
        <MaintenanceModal
          equipment={equipmentList}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            records.reload();
            equipment.reload();
          }}
        />
      )}
    </EquipmentLayout>
  );
}

function MaintenanceModal({
  equipment,
  onClose,
  onSaved,
}: {
  equipment: Equipment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeEquipmentError;
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");
  const [kind, setKind] = useState<MaintenanceKind>("service");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [parts, setParts] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [odometer, setOdometer] = useState("");
  const [serviceOn, setServiceOn] = useState(todayISO());
  const [nextDue, setNextDue] = useState("");
  const [downtime, setDowntime] = useState("");
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = equipment.find((e) => e.id === equipmentId) ?? null;

  async function handleSave() {
    if (!equipmentId) {
      setError("Choose a machine.");
      return;
    }
    if (description.trim().length < 3) {
      setError("Describe the work — 'service' alone is not a usable record.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await recordMaintenance({
        equipment_id: equipmentId,
        kind,
        description: description.trim(),
        cost_inr: Number(cost) || 0,
        parts: parts.trim() || null,
        workshop: workshop.trim() || null,
        odometer_hours: odometer.trim() ? Number(odometer) : null,
        service_on: serviceOn,
        next_due_on: nextDue || null,
        downtime_days: downtime.trim() ? Number(downtime) : null,
        // `recordMaintenance` creates the availability block itself when this is
        // true, in the same flow as the record — do not create it again here.
        createBlock: block,
      });

      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Log maintenance"
      subtitle={selected ? `${selected.title} · ${selected.category ?? ""}` : undefined}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Machine" required>
            <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={inputClass}>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kind" required>
            <select value={kind} onChange={(e) => setKind(e.target.value as MaintenanceKind)} className={inputClass}>
              {MAINTENANCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MAINTENANCE_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="What was done" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1000}
            className={`${inputClass} resize-none`}
            placeholder="e.g. engine oil and filter change, radiator flush"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cost (₹)">
            <input value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Workshop">
            <input value={workshop} onChange={(e) => setWorkshop(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Spare parts used">
            <input value={parts} onChange={(e) => setParts(e.target.value)} className={inputClass} placeholder="e.g. oil filter, 2 belts" />
          </Field>
          <Field label="Hour meter reading">
            <input value={odometer} onChange={(e) => setOdometer(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Service date">
            <input type="date" value={serviceOn} onChange={(e) => setServiceOn(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Next service due">
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={block}
              onChange={(e) => setBlock(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-700"
            />
            <span className="text-[11.5px] text-slate-700">Block the machine for this downtime</span>
          </label>
          {block && (
            <div className="mt-2">
              <Field label="Downtime (days)" hint="Counted from the service date.">
                <input value={downtime} onChange={(e) => setDowntime(e.target.value)} className={inputClass} inputMode="numeric" />
              </Field>
            </div>
          )}
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
            Blocking is what stops a renter booking the machine while it is being repaired. A block that
            clashes with an existing booking will be refused.
          </p>
        </div>

        {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            <Wrench className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Save record"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warn";
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold ${tone === "warn" ? "text-amber-700" : "text-forest"}`}>
        {value}
      </p>
      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
