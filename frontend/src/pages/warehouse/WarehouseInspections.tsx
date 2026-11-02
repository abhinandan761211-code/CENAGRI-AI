import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Camera,
  ClipboardCheck,
  Plus,
  X,
} from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import { SectionHeading } from "@/components/warehouse/ui";
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
  INSPECTION_KINDS,
  describeWarehouseError,
  formatDate,
  formatDateTime,
  formatWeight,
  listInspections,
  listLotsForOwner,
  listWarehouses,
  recordInspection,
  uploadPrivateFile,
} from "@/lib/warehouse";
import type {
  InspectionKind,
  InventoryLot,
  StorageInspection,
  Warehouse,
} from "@/lib/warehouse";

const KIND_LABEL: Record<InspectionKind, string> = {
  inward: "Incoming inspection",
  periodic: "Periodic storage check",
  pre_dispatch: "Pre-dispatch check",
  complaint: "Complaint / dispute",
};

const RESULT_STYLE: Record<StorageInspection["result"], string> = {
  passed: "bg-emerald-100 text-emerald-800",
  conditional: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-800",
};

/**
 * Quality Inspection & Loss Management.
 *
 * An inspection RECORDS what was found. It deliberately does not reduce the
 * customer's stored quantity: a loss is only applied through the inventory
 * adjustment workflow on the Inventory screen, with its own written reason and
 * actor. That separation is what makes a dispute possible to settle.
 */
export default function WarehouseInspections() {
  const D = describeWarehouseError;
  const inspections = useWorkerData<StorageInspection[]>(() => listInspections(), [], D);
  const lots = useWorkerData<InventoryLot[]>(() => listLotsForOwner(), [], D);
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);

  const [newOpen, setNewOpen] = useState(false);

  const inspectionList = inspections.data ?? [];
  const lotList = lots.data ?? [];
  const warehouseList = warehouses.data ?? [];

  const lotById = useMemo(() => new Map(lotList.map((l) => [l.id, l])), [lotList]);
  const whById = useMemo(() => new Map(warehouseList.map((w) => [w.id, w])), [warehouseList]);

  const damagedKg = inspectionList.reduce((s, i) => s + Number(i.damaged_kg), 0);
  const rejectedKg = inspectionList.reduce((s, i) => s + Number(i.rejected_kg), 0);
  const failed = inspectionList.filter((i) => i.result === "failed").length;
  const pestCases = inspectionList.filter((i) => i.pest_damage).length;

  if (inspections.state === "loading") {
    return (
      <WarehouseLayout title="Quality Inspection">
        <Loading label="Loading inspections…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Quality Inspection"
      subtitle="Grading, damage and pest records"
      action={
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          disabled={warehouseList.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> New inspection
        </button>
      }
    >
      {inspections.state === "error" && (
        <ErrorNotice message={inspections.error} onRetry={inspections.reload} />
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Inspections" value={String(inspectionList.length)} hint="Recorded to date" />
        <Tile label="Damaged" value={formatWeight(damagedKg)} hint="Reported quantity" tone={damagedKg > 0 ? "warn" : undefined} />
        <Tile label="Rejected" value={formatWeight(rejectedKg)} hint="Not fit for storage" tone={rejectedKg > 0 ? "warn" : undefined} />
        <Tile label="Pest cases" value={String(pestCases)} hint={`${failed} failed inspection(s)`} tone={pestCases > 0 ? "bad" : undefined} />
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] leading-relaxed text-sky-900">
        <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          An inspection records the <strong className="font-bold">finding</strong>; it never changes the
          stored quantity. To actually remove damaged stock, use <strong>Adjust</strong> on the Inventory
          screen, where a reason is required and the ledger records who did it.
        </span>
      </div>

      <section>
        <SectionHeading title="Inspection history" hint="Newest first" />
        <Panel title="Inspections" description="What was checked, found, and by whom">
          {inspectionList.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No inspections recorded"
              description="Inspect goods when they arrive and periodically while stored. A record protects both you and the depositor if a dispute arises later."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {inspectionList.map((ins) => {
                const lot = ins.lot_id ? lotById.get(ins.lot_id) : null;
                return (
                  <li key={ins.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-forest">
                          {KIND_LABEL[ins.kind]} · {lot?.crop_name ?? "Warehouse-wide"}
                        </p>
                        <p className="text-[10.5px] text-slate-500">
                          {whById.get(ins.warehouse_id)?.name ?? "—"}
                          {lot ? ` · ${lot.lot_no}` : ""} ·{" "}
                          {formatDateTime(ins.inspected_at)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${RESULT_STYLE[ins.result]}`}
                      >
                        {ins.result}
                      </span>
                    </div>

                    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] text-slate-600 sm:grid-cols-4">
                      <div>
                        <dt className="text-[9.5px] uppercase tracking-wider text-slate-400">Moisture</dt>
                        <dd className="font-semibold">{ins.moisture_pct != null ? `${ins.moisture_pct}%` : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[9.5px] uppercase tracking-wider text-slate-400">Grade</dt>
                        <dd className="font-semibold">{ins.grade ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[9.5px] uppercase tracking-wider text-slate-400">Damaged</dt>
                        <dd className="font-semibold text-amber-800">
                          {Number(ins.damaged_kg) > 0 ? formatWeight(Number(ins.damaged_kg)) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[9.5px] uppercase tracking-wider text-slate-400">Rejected</dt>
                        <dd className="font-semibold text-rose-800">
                          {Number(ins.rejected_kg) > 0 ? formatWeight(Number(ins.rejected_kg)) : "—"}
                        </dd>
                      </div>
                    </dl>

                    {ins.damage_notes && (
                      <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10.5px] text-slate-600">
                        {ins.damage_notes}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      {ins.pest_damage && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 font-bold text-rose-800">
                          <Bug className="h-3 w-3" /> pest damage
                        </span>
                      )}
                      {ins.inspector_name && <span>by {ins.inspector_name}</span>}
                      {ins.photos.length > 0 && <span>{ins.photos.length} photo(s)</span>}
                      {ins.adjustment_applied && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
                          stock adjusted
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      <Panel title="Dispute resolution" description="When a depositor disagrees with a finding">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li className="flex gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            Record an inspection of kind <strong>Complaint / dispute</strong> and attach photographs. Both
            sides then share one written record.
          </li>
          <li className="flex gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            Do not change stock until the finding is agreed — an unexplained reduction is what escalates
            a dispute.
          </li>
          <li className="flex gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            The booking can be moved to <strong>Disputed</strong> on the Bookings screen so nobody forgets
            it is unresolved.
          </li>
        </ul>
      </Panel>

      {newOpen && (
        <InspectionModal
          warehouses={warehouseList}
          lots={lotList.filter((l) => l.status !== "released")}
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            inspections.reload();
            lots.reload();
          }}
        />
      )}
    </WarehouseLayout>
  );
}

/* ── New inspection ────────────────────────────────────────────────────── */

function InspectionModal({
  warehouses,
  lots,
  onClose,
  onSaved,
}: {
  warehouses: Warehouse[];
  lots: InventoryLot[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [lotId, setLotId] = useState("");
  const [kind, setKind] = useState<InspectionKind>("periodic");
  const [inspector, setInspector] = useState("");
  const [moisture, setMoisture] = useState("");
  const [grade, setGrade] = useState("");
  const [pest, setPest] = useState(false);
  const [damageNotes, setDamageNotes] = useState("");
  const [damagedKg, setDamagedKg] = useState("");
  const [rejectedKg, setRejectedKg] = useState("");
  const [result, setResult] = useState<StorageInspection["result"]>("passed");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = lots.filter((l) => l.warehouse_id === warehouseId);
  const selectedLot = options.find((l) => l.id === lotId) ?? null;

  async function handleSave() {
    if (!warehouseId) {
      setError("Choose a warehouse.");
      return;
    }
    if (result === "failed" && !damageNotes.trim()) {
      setError("A failed inspection needs a description of the damage.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const paths: string[] = [];
      for (const file of photos) {
        paths.push(await uploadPrivateFile(file, "inspection"));
      }

      await recordInspection({
        warehouse_id: warehouseId,
        booking_id: selectedLot?.booking_id ?? null,
        lot_id: lotId || null,
        kind,
        inspector_name: inspector.trim() || null,
        moisture_pct: moisture.trim() ? Number(moisture) : null,
        grade: grade.trim() || null,
        pest_damage: pest,
        damage_notes: damageNotes.trim() || null,
        damaged_kg: damagedKg.trim() ? Number(damagedKg) : 0,
        rejected_kg: rejectedKg.trim() ? Number(rejectedKg) : 0,
        photos: paths,
        result,
        quantity_before_kg: selectedLot ? Number(selectedLot.current_kg) : null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide title="Record inspection" subtitle="Findings only — stock is not changed here">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Warehouse" required>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setLotId("");
              }}
              className={inputClass}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lot" hint="Leave empty for a warehouse-wide check.">
            <select value={lotId} onChange={(e) => setLotId(e.target.value)} className={inputClass}>
              <option value="">Warehouse-wide</option>
              {options.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lot_no} — {l.crop_name} ({formatWeight(Number(l.current_kg))})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Inspection type" required>
            <select value={kind} onChange={(e) => setKind(e.target.value as InspectionKind)} className={inputClass}>
              {INSPECTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Inspected by">
            <input value={inspector} onChange={(e) => setInspector(e.target.value)} className={inputClass} placeholder="Name of the person who checked" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Moisture (%)">
            <input value={moisture} onChange={(e) => setMoisture(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Grade">
            <input value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClass} placeholder="e.g. A, B, FAQ" />
          </Field>
          <Field label="Result" required>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as StorageInspection["result"])}
              className={inputClass}
            >
              <option value="passed">Passed</option>
              <option value="conditional">Conditional</option>
              <option value="failed">Failed</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Damaged quantity (kg)">
            <input value={damagedKg} onChange={(e) => setDamagedKg(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Rejected quantity (kg)">
            <input value={rejectedKg} onChange={(e) => setRejectedKg(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <input
            type="checkbox"
            checked={pest}
            onChange={(e) => setPest(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-700"
          />
          <span className="text-[11.5px] text-slate-700">Pest damage observed</span>
        </label>

        <Field label="Damage description" hint="Required when the result is failed.">
          <textarea
            value={damageNotes}
            onChange={(e) => setDamageNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            className={`${inputClass} resize-none`}
            placeholder="e.g. 12 bags with weevil damage at the bottom of rack 4"
          />
        </Field>

        <Field label="Inspection photographs" hint="Stored privately. These are your evidence in a dispute.">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Camera className="h-3.5 w-3.5" /> Add photo
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPhotos((prev) => [...prev, ...files].slice(0, 6));
                }}
              />
            </label>
            {photos.map((p, i) => (
              <span
                key={`${p.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10.5px] font-semibold text-emerald-800"
              >
                {p.name.slice(0, 18)}
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove photo"
                  className="text-emerald-700 hover:text-emerald-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </Field>

        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </Field>

        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          This record does not reduce {selectedLot ? selectedLot.lot_no : "any lot"}. Use Inventory →
          Adjust with a reason to take stock out, so the depositor sees exactly what was removed and why.
        </p>

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
            {busy ? "Saving…" : "Save inspection"}
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
  tone?: "warn" | "bad";
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-[15px] font-extrabold ${tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-forest"
          }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
