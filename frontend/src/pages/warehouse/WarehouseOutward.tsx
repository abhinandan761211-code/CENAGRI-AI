import { useMemo, useState } from "react";
import { ArrowUpFromLine, CheckCircle2, FileText, PackageMinus, Truck } from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import { BookingStatusPill, SectionHeading } from "@/components/warehouse/ui";
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
  describeWarehouseError,
  formatDate,
  formatDateTime,
  formatWeight,
  listDispatches,
  listLotsForOwner,
  listStorageBookings,
  recordDispatch,
} from "@/lib/warehouse";
import type {
  GoodsDispatch,
  InventoryLot,
  StorageBooking,
} from "@/lib/warehouse";

/**
 * Goods Outward — releasing stock to its depositor.
 *
 * A release can never exceed the lot's recorded quantity. That rule is enforced
 * twice: here for a clear message, and in the dispatch trigger under a row lock
 * so two gate passes cannot both succeed on the last bag.
 */
export default function WarehouseOutward() {
  const D = describeWarehouseError;
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const lots = useWorkerData<InventoryLot[]>(() => listLotsForOwner(), [], D);
  const dispatches = useWorkerData<GoodsDispatch[]>(() => listDispatches(), [], D);

  const [target, setTarget] = useState<{ booking: StorageBooking; lot: InventoryLot } | null>(null);

  const bookingList = bookings.data ?? [];
  const lotList = lots.data ?? [];
  const dispatchList = dispatches.data ?? [];

  /** Lots that still hold stock — the only things that can be released. */
  const releasable = useMemo(
    () =>
      lotList
        .filter((l) => l.status !== "released" && Number(l.current_kg) > 0)
        .map((lot) => ({
          lot,
          booking: bookingList.find((b) => b.id === lot.booking_id) ?? null,
        }))
        .filter((row): row is { lot: InventoryLot; booking: StorageBooking } => row.booking != null),
    [lotList, bookingList]
  );

  /** Bookings where the depositor has asked for a release. */
  const requested = bookingList.filter((b) =>
    ["release_requested", "partially_released"].includes(b.status)
  );

  const totalHeld = lotList
    .filter((l) => l.status !== "released")
    .reduce((s, l) => s + Number(l.current_kg), 0);

  const totalReleased = dispatchList.reduce((s, d) => s + Number(d.dispatched_kg), 0);

  if (bookings.state === "loading") {
    return (
      <WarehouseLayout title="Goods Outward">
        <Loading label="Loading releases…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Goods Outward"
      subtitle="Release requests, dispatch and gate passes"
    >
      {bookings.state === "error" && <ErrorNotice message={bookings.error} onRetry={bookings.reload} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Release requested" value={String(requested.length)} hint="Awaiting your action" />
        <Tile label="Releasable lots" value={String(releasable.length)} hint="With stock remaining" />
        <Tile label="Held now" value={formatWeight(totalHeld)} hint="In your custody" />
        <Tile label="Released to date" value={formatWeight(totalReleased)} hint="All dispatches" />
      </section>

      {requested.length > 0 && (
        <section>
          <SectionHeading title="Release requests" hint="The depositor wants stock back" />
          <Panel title="Waiting on you" description="Check the lot, then dispatch">
            <ul className="divide-y divide-slate-100">
              {requested.map((b) => {
                const lots = lotList.filter((l) => l.booking_id === b.id && l.status !== "released");
                return (
                  <li key={b.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-forest">
                          {b.crop_name ?? "Crop"} · {b.depositor_name ?? "Depositor"}
                        </p>
                        <p className="text-[10.5px] text-slate-500">
                          Held {formatWeight(Number(b.stored_kg ?? 0))} of{" "}
                          {formatWeight(Number(b.received_kg))} · {lots.length} lot(s)
                        </p>
                      </div>
                      <BookingStatusPill status={b.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {lots.map((lot) => (
                        <button
                          key={lot.id}
                          type="button"
                          onClick={() => setTarget({ booking: b, lot })}
                          className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10.5px] font-semibold text-brand-800 hover:bg-brand-100"
                        >
                          <PackageMinus className="h-3 w-3" />
                          {lot.lot_no} · {formatWeight(Number(lot.current_kg))}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </section>
      )}

      <section>
        <SectionHeading title="Release stock" hint="Full or partial, from a specific lot" />
        <Panel title="Lots in custody" description="Ownership stays with the depositor">
          {releasable.length === 0 ? (
            <EmptyState
              icon={ArrowUpFromLine}
              title="Nothing to release"
              description="Stock appears here once it has been received against a booking."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-[11.5px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-bold">Lot</th>
                    <th className="px-4 py-2 font-bold">Crop</th>
                    <th className="px-4 py-2 font-bold">Held</th>
                    <th className="px-4 py-2 font-bold">Depositor</th>
                    <th className="px-4 py-2 font-bold">Received</th>
                    <th className="px-4 py-2 font-bold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {releasable.map(({ lot, booking }) => (
                    <tr key={lot.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-mono text-[10.5px] font-bold text-forest">
                        {lot.lot_no}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-700">{lot.crop_name}</p>
                        <p className="text-[10px] text-slate-500">{lot.variety ?? "—"}</p>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        {formatWeight(Number(lot.current_kg))}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{booking.depositor_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(lot.received_on)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setTarget({ booking, lot })}
                          className="rounded-lg bg-brand-700 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-800"
                        >
                          Release
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      <Panel title="Dispatch history" description="Delivery notes and gate passes issued">
        {dispatchList.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
            Nothing has been dispatched yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">Dispatch</th>
                  <th className="px-4 py-2 font-bold">Gate pass</th>
                  <th className="px-4 py-2 font-bold">Quantity</th>
                  <th className="px-4 py-2 font-bold">Vehicle</th>
                  <th className="px-4 py-2 font-bold">Type</th>
                  <th className="px-4 py-2 font-bold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dispatchList.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-[10.5px] font-bold text-forest">{d.dispatch_no}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{d.gate_pass_no ?? "—"}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">
                      {formatWeight(Number(d.dispatched_kg))}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{d.vehicle_no ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          d.partial ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {d.partial ? "Partial" : "Full"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(d.dispatched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {target && (
        <DispatchModal
          booking={target.booking}
          lot={target.lot}
          onClose={() => setTarget(null)}
          onSaved={() => {
            setTarget(null);
            bookings.reload();
            lots.reload();
            dispatches.reload();
          }}
        />
      )}
    </WarehouseLayout>
  );
}

/* ── Dispatch modal ────────────────────────────────────────────────────── */

function DispatchModal({
  booking,
  lot,
  onClose,
  onSaved,
}: {
  booking: StorageBooking;
  lot: InventoryLot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const available = Number(lot.current_kg);

  const [mode, setMode] = useState<"full" | "partial">("full");
  const [kg, setKg] = useState(String(available));
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [weightSlip, setWeightSlip] = useState("");
  const [gatePass, setGatePass] = useState(`GP-${Date.now().toString().slice(-6)}`);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const value = mode === "full" ? available : Number(kg);
  const remaining = available - value;

  async function handleSave() {
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the quantity to release.");
      return;
    }
    if (value > available) {
      setError(`Only ${formatWeight(available)} remains in this lot.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await recordDispatch({
        booking_id: booking.id,
        lot_id: lot.id,
        warehouse_id: lot.warehouse_id,
        requested_kg: available,
        dispatched_kg: value,
        vehicle_no: vehicleNo.trim() || null,
        driver_name: driverName.trim() || null,
        driver_phone: driverPhone.trim() || null,
        dispatch_weight_slip: weightSlip.trim() || null,
        gate_pass_no: gatePass.trim() || null,
        photos: [],
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
    <Modal
      open
      onClose={onClose}
      wide
      title="Release stock"
      subtitle={`${lot.lot_no} · ${lot.crop_name} · ${formatWeight(available)} held`}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-[11.5px]">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Depositor</p>
            <p className="font-semibold text-forest">{booking.depositor_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Held</p>
            <p className="font-bold text-forest">{formatWeight(available)}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">After release</p>
            <p className={`font-bold ${remaining === 0 ? "text-slate-500" : "text-emerald-700"}`}>
              {formatWeight(remaining)}
            </p>
          </div>
        </div>

        <Field label="Release type">
          <div className="flex gap-2">
            {(["full", "partial"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setKg(m === "full" ? String(available) : "");
                }}
                aria-pressed={mode === m}
                className={`flex-1 rounded-lg px-3 py-2 text-[11.5px] font-semibold transition ${
                  mode === m ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {m === "full" ? `Full release (${formatWeight(available)})` : "Partial release"}
              </button>
            ))}
          </div>
        </Field>

        {mode === "partial" && (
          <Field label="Quantity to release (kg)" required>
            <input value={kg} onChange={(e) => setKg(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle number">
            <input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className={inputClass} placeholder="WB 12 AB 3456" />
          </Field>
          <Field label="Gate pass number" hint="Generated — edit if your register uses another series.">
            <input value={gatePass} onChange={(e) => setGatePass(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Driver name">
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Driver phone">
            <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} className={inputClass} inputMode="tel" />
          </Field>
        </div>

        <Field label="Dispatch weight slip">
          <input value={weightSlip} onChange={(e) => setWeightSlip(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
            placeholder="Vehicle condition, who collected it, anything worth recording."
          />
        </Field>

        {remaining === 0 && (
          <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This empties the lot and closes the booking's stock. The capacity it used is freed
            immediately.
          </p>
        )}

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
            <FileText className="h-3.5 w-3.5" /> {busy ? "Issuing…" : "Issue gate pass"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-1.5">
        <Truck className="h-3 w-3 text-slate-400" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className="mt-0.5 text-[15px] font-extrabold text-forest">{value}</p>
      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
