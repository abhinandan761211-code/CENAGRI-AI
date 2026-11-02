import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Camera,
  CheckCircle2,
  Truck,
  X,
} from "lucide-react";
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
  listCapacity,
  listReceipts,
  listSections,
  listStorageBookings,
  recordReceipt,
  uploadPrivateFile,
} from "@/lib/warehouse";
import type {
  GoodsReceipt,
  StorageBooking,
  WarehouseCapacity,
  WarehouseSection,
} from "@/lib/warehouse";

/**
 * Goods Inward — receiving what was booked.
 *
 * Recording a receipt does a lot in one transaction (all in the database): it
 * creates the inventory lot, writes the ledger entry, moves capacity from
 * "reserved" to "occupied", and advances the booking. If capacity is short,
 * nothing is written at all.
 *
 * A delivery that does not match the booking is flagged, not quietly accepted.
 */
export default function WarehouseInward() {
  const D = describeWarehouseError;
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const receipts = useWorkerData<GoodsReceipt[]>(() => listReceipts(), [], D);
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);

  const [receiveTarget, setReceiveTarget] = useState<StorageBooking | null>(null);

  const bookingList = bookings.data ?? [];
  const receiptList = receipts.data ?? [];
  const capacityList = capacity.data ?? [];

  /** Bookings whose goods are due: confirmed or already expected. */
  const expected = useMemo(
    () =>
      bookingList
        .filter((b) => ["confirmed", "goods_expected"].includes(b.status))
        .sort((a, b) => (a.expected_inward_on ?? a.starts_on).localeCompare(b.expected_inward_on ?? b.starts_on)),
    [bookingList]
  );

  /** Partially received bookings can take a second lorry. */
  const partial = useMemo(
    () =>
      bookingList.filter(
        (b) => ["goods_received", "stored"].includes(b.status) && Number(b.received_kg) < Number(b.quantity_kg)
      ),
    [bookingList]
  );

  const discrepancies = receiptList.filter((r) => r.discrepancy);

  if (bookings.state === "loading") {
    return (
      <WarehouseLayout title="Goods Inward">
        <Loading label="Loading expected deliveries…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Goods Inward"
      subtitle="Schedule, receive and record incoming stock"
    >
      {bookings.state === "error" && <ErrorNotice message={bookings.error} onRetry={bookings.reload} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Expected" value={String(expected.length)} hint="Awaiting arrival" />
        <Tile label="Partial" value={String(partial.length)} hint="More stock to come" />
        <Tile label="GRNs today" value={String(receiptList.filter((r) => r.received_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length)} hint="Receipts issued" />
        <Tile
          label="Discrepancies"
          value={String(discrepancies.length)}
          hint={discrepancies.length > 0 ? "Needs review" : "None flagged"}
          tone={discrepancies.length > 0 ? "warn" : undefined}
        />
      </section>

      <section>
        <SectionHeading title="Expected deliveries" hint="Confirmed bookings waiting for goods" />
        <Panel title="Schedule" description="Receive against the booking to keep capacity accurate">
          {expected.length === 0 && partial.length === 0 ? (
            <EmptyState
              icon={ArrowDownToLine}
              title="Nothing expected"
              description="When a booking is confirmed it appears here, ready to receive. Confirming a booking is what reserves its capacity."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...expected, ...partial].map((b) => {
                const remaining = Number(b.quantity_kg) - Number(b.received_kg);
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-forest">
                        {b.crop_name ?? "Crop"}
                        {b.variety ? ` · ${b.variety}` : ""}
                      </p>
                      <p className="text-[10.5px] text-slate-500">
                        {b.depositor_name ?? "Depositor"} · {b.warehouse_name ?? "—"} · due{" "}
                        {formatDate(b.expected_inward_on ?? b.starts_on)}
                      </p>
                      <p className="text-[10.5px] text-slate-500">
                        Booked {formatWeight(Number(b.quantity_kg))} · received{" "}
                        {formatWeight(Number(b.received_kg))} · remaining {formatWeight(remaining)}
                      </p>
                    </div>
                    <BookingStatusPill status={b.status} />
                    <button
                      type="button"
                      onClick={() => setReceiveTarget(b)}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-brand-700 px-3 text-[11px] font-semibold text-white hover:bg-brand-800"
                    >
                      <ArrowDownToLine className="h-3 w-3" /> Receive
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      {discrepancies.length > 0 && (
        <Panel title="Quantity discrepancies" description="Received differs from what was booked by more than 1%">
          <ul className="divide-y divide-slate-100">
            {discrepancies.map((r) => (
              <li key={r.id} className="flex items-start gap-2 px-4 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold text-forest">{r.grn_no}</p>
                  <p className="text-[10.5px] text-slate-500">{r.discrepancy_note}</p>
                </div>
                <span className="shrink-0 text-[10.5px] text-slate-400">{formatDate(r.received_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Receipt history" description="Goods Receipt Notes issued">
        {receiptList.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
            No goods received yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">GRN</th>
                  <th className="px-4 py-2 font-bold">Received</th>
                  <th className="px-4 py-2 font-bold">Vehicle</th>
                  <th className="px-4 py-2 font-bold">Weight slip</th>
                  <th className="px-4 py-2 font-bold">Bags</th>
                  <th className="px-4 py-2 font-bold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receiptList.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-[10.5px] font-bold text-forest">{r.grn_no}</p>
                      {r.discrepancy && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                          discrepancy
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">
                      {formatWeight(Number(r.received_kg))}
                      {r.expected_kg != null && (
                        <span className="block text-[10px] font-normal text-slate-400">
                          booked {formatWeight(Number(r.expected_kg))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.vehicle_no ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.weight_slip_no ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.bags_count ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(r.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {receiveTarget && (
        <ReceiveModal
          booking={receiveTarget}
          warehouses={capacityList}
          onClose={() => setReceiveTarget(null)}
          onSaved={() => {
            setReceiveTarget(null);
            bookings.reload();
            receipts.reload();
            capacity.reload();
          }}
        />
      )}
    </WarehouseLayout>
  );
}

/* ── Receive modal ─────────────────────────────────────────────────────── */

function ReceiveModal({
  booking,
  warehouses,
  onClose,
  onSaved,
}: {
  booking: StorageBooking;
  warehouses: WarehouseCapacity[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const remaining = Math.max(Number(booking.quantity_kg) - Number(booking.received_kg), 0);
  const warehouse = warehouses.find((w) => w.id === booking.warehouse_id);

  const sections = useWorkerData<WarehouseSection[]>(
    () => listSections(booking.warehouse_id),
    [booking.warehouse_id],
    D
  );

  const [receivedKg, setReceivedKg] = useState(String(remaining || ""));
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [weightSlip, setWeightSlip] = useState("");
  const [bags, setBags] = useState("");
  const [sectionId, setSectionId] = useState(booking.section_id ?? "");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const value = Number(receivedKg);
  const discrepancy =
    remaining > 0 && Math.abs(value - remaining) > 0.01 * Math.max(remaining, 1);

  async function handleSave() {
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the quantity actually received.");
      return;
    }
    if (warehouse && Number(warehouse.available_kg) + Number(warehouse.reserved_kg) < value) {
      setError(
        `This warehouse has only ${formatWeight(Number(warehouse.available_kg))} free. Reduce the quantity or move the booking.`
      );
      return;
    }

    setBusy(true);
    setError("");
    try {
      // Photos go first: a GRN must never point at a file that failed to upload.
      const paths: string[] = [];
      for (const file of photos) {
        paths.push(await uploadPrivateFile(file, "receipt"));
      }

      await recordReceipt({
        booking_id: booking.id,
        warehouse_id: booking.warehouse_id,
        expected_kg: remaining || null,
        received_kg: value,
        vehicle_no: vehicleNo.trim() || null,
        driver_name: driverName.trim() || null,
        driver_phone: driverPhone.trim() || null,
        weight_slip_no: weightSlip.trim() || null,
        bags_count: bags.trim() ? Number(bags) : null,
        photos: paths,
        section_id: sectionId || null,
        storage_location: location.trim() || null,
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
      title="Receive goods"
      subtitle={`${booking.crop_name ?? "Crop"} · ${booking.depositor_name ?? "Depositor"} · booked ${formatWeight(Number(booking.quantity_kg))}`}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantity received (kg)" required hint={`Remaining on this booking: ${formatWeight(remaining)}`}>
            <input
              value={receivedKg}
              onChange={(e) => setReceivedKg(e.target.value)}
              className={inputClass}
              inputMode="decimal"
            />
          </Field>
          <Field label="Weight slip number" hint="From the weighbridge at the gate.">
            <input value={weightSlip} onChange={(e) => setWeightSlip(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {discrepancy && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This differs from the booked quantity by more than 1%. It will be flagged for review rather
            than silently accepted.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Vehicle number">
            <input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className={inputClass} placeholder="WB 12 AB 3456" />
          </Field>
          <Field label="Driver name">
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Driver phone">
            <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} className={inputClass} inputMode="tel" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bags / units">
            <input value={bags} onChange={(e) => setBags(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Storage section">
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={inputClass}>
              <option value="">Not specified</option>
              {(sections.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.commodity_category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Storage location">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
              placeholder="e.g. Rack 4, bay 2"
            />
          </Field>
        </div>

        <Field label="Receiving photographs" hint="Optional. Stored privately — proof of condition at handover.">
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

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[10.5px] leading-relaxed text-slate-600">
          Receiving will create an inventory lot for this depositor, move{" "}
          {formatWeight(value)} from reserved to occupied capacity, and write the GRN — all together.
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
            <CheckCircle2 className="h-3.5 w-3.5" /> {busy ? "Recording…" : "Record receipt"}
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
      <div className="flex items-center gap-1.5">
        {tone === "warn" && <Truck className="h-3 w-3 text-amber-600" />}
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className={`mt-0.5 text-[15px] font-extrabold ${tone === "warn" ? "text-amber-700" : "text-forest"}`}>
        {value}
      </p>
      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
