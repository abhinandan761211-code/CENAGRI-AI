import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Truck } from "lucide-react";
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
  describeWarehouseError,
  formatDate,
  formatWeight,
  listMyTransportRequests,
  listReceipts,
  listStorageBookings,
  listWarehouses,
  requestTransport,
} from "@/lib/warehouse";
import type { StorageBooking, Warehouse } from "@/lib/warehouse";

type TransportRequestRow = {
  id: string;
  title: string | null;
  pickup: string;
  dropoff: string;
  load_kg: number | null;
  needed_on: string | null;
  status: string;
  created_at: string;
};

const TRANSPORT_STATUS_LABEL: Record<string, string> = {
  open: "Open — awaiting quotes",
  assigned: "Assigned to a transporter",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Transport Coordination.
 *
 * This page does NOT contain a vehicle list, a quote system or a trip tracker.
 * It creates an ordinary `transport_requests` row — the very table the existing
 * Transporter account browses, quotes and books against — so there is exactly
 * one logistics module in Kalika, not two.
 */
export default function WarehouseTransport() {
  const D = describeWarehouseError;
  const requests = useWorkerData<TransportRequestRow[]>(() => listMyTransportRequests(), [], D);
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const receipts = useWorkerData(() => listReceipts(), [], D);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"inward" | "outward">("inward");
  const [target, setTarget] = useState<StorageBooking | null>(null);

  const requestList = requests.data ?? [];
  const warehouseList = warehouses.data ?? [];
  const bookingList = bookings.data ?? [];

  /** Goods due in — a vehicle may be needed from the depositor's place to here. */
  const inboundCandidates = bookingList.filter((b) =>
    ["confirmed", "goods_expected"].includes(b.status)
  );
  /** Releases requested — a vehicle may be needed from here to the depositor. */
  const outboundCandidates = bookingList.filter((b) =>
    ["release_requested", "partially_released"].includes(b.status)
  );

  const candidates = mode === "inward" ? inboundCandidates : outboundCandidates;

  if (requests.state === "loading") {
    return (
      <WarehouseLayout title="Transport Coordination">
        <Loading label="Loading transport requests…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Transport Coordination"
      subtitle="Ask the Kalika transport network to move goods"
      action={
        <button
          type="button"
          onClick={() => {
            setMode("inward");
            setOpen(true);
          }}
          disabled={warehouseList.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Request vehicle
        </button>
      }
    >
      {requests.state === "error" && <ErrorNotice message={requests.error} onRetry={requests.reload} />}

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] leading-relaxed text-sky-900">
        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          A vehicle request is a normal <strong className="font-bold">transport request</strong>. Registered
          transporters see it, send quotations, and their booking and trip tracking live in their own
          account — this page never duplicates that.
        </span>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setMode("inward");
            setOpen(true);
          }}
          disabled={inboundCandidates.length === 0}
          className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300 disabled:opacity-50"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <ArrowDownToLine className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-forest">Inbound — goods arriving</p>
            <p className="text-[10.5px] text-slate-500">
              {inboundCandidates.length} booking(s) awaiting delivery
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("outward");
            setOpen(true);
          }}
          disabled={outboundCandidates.length === 0}
          className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300 disabled:opacity-50"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-50 text-orange-700">
            <ArrowUpFromLine className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-forest">Outbound — stock leaving</p>
            <p className="text-[10.5px] text-slate-500">
              {outboundCandidates.length} release(s) waiting for a vehicle
            </p>
          </div>
        </button>
      </section>

      <section>
        <SectionHeading title="My vehicle requests" hint="Visible to transporters in your district" />
        <Panel title="Requests" description={`${requestList.length} raised`}>
          {requestList.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No transport requested"
              description="Raise a vehicle request when goods need to move in or out. Transporters quote against it and you pick one — exactly as in the transporter module."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {requestList.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {r.title ?? "Goods movement"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {r.pickup} → {r.dropoff}
                      {r.load_kg ? ` · ${formatWeight(Number(r.load_kg))}` : ""}
                      {r.needed_on ? ` · ${formatDate(r.needed_on)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.status === "open"
                        ? "bg-sky-100 text-sky-800"
                        : r.status === "assigned"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                  >
                    {TRANSPORT_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <Panel title="Recent receipts" description="Goods that already arrived by road">
        {(receipts.data ?? []).length === 0 ? (
          <div className="px-4 py-6 text-center text-[11.5px] text-slate-500">
            No goods have been received yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(receipts.data ?? []).slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="font-mono text-[10.5px] text-slate-500">{r.grn_no}</span>
                <span className="text-[11px] text-slate-600">{r.vehicle_no ?? "No vehicle recorded"}</span>
                <span className="text-[11px] font-semibold text-forest">
                  {formatWeight(Number(r.received_kg))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {open && (
        <RequestModal
          mode={mode}
          warehouses={warehouseList}
          candidates={candidates}
          target={target}
          onTargetChange={setTarget}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            requests.reload();
          }}
        />
      )}
    </WarehouseLayout>
  );
}

/* ── Request modal ─────────────────────────────────────────────────────── */

function RequestModal({
  mode,
  warehouses,
  candidates,
  target,
  onTargetChange,
  onClose,
  onSaved,
}: {
  mode: "inward" | "outward";
  warehouses: Warehouse[];
  candidates: StorageBooking[];
  target: StorageBooking | null;
  onTargetChange: (booking: StorageBooking | null) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const [warehouseId, setWarehouseId] = useState(
    target?.warehouse_id ?? warehouses[0]?.id ?? ""
  );
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [loadKg, setLoadKg] = useState("");
  const [neededOn, setNeededOn] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const warehouse = warehouses.find((w) => w.id === warehouseId) ?? null;
  const warehouseLabel = [warehouse?.village, warehouse?.district, warehouse?.state]
    .filter(Boolean)
    .join(", ");

  /** Fill the form from a booking, so the two records agree. */
  function prefillFrom(bookingId: string) {
    const booking = candidates.find((b) => b.id === bookingId) ?? null;
    onTargetChange(booking);
    if (!booking) return;
    setWarehouseId(booking.warehouse_id);
    setLoadKg(
      String(
        mode === "inward"
          ? Math.max(Number(booking.quantity_kg) - Number(booking.received_kg), 0)
          : Number(booking.stored_kg ?? 0)
      )
    );
    if (mode === "inward") {
      setDropoff(warehouseLabel);
    } else {
      setPickup(warehouseLabel);
    }
  }

  async function handleSave() {
    if (!pickup.trim() || !dropoff.trim()) {
      setError("Enter both the pickup and the delivery location.");
      return;
    }
    const kg = Number(loadKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      setError("Enter the load weight in kg.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestTransport({
        pickup: pickup.trim(),
        dropoff: dropoff.trim(),
        load_kg: kg,
        needed_on: neededOn || null,
        title: `${mode === "inward" ? "Inbound" : "Outbound"} · ${target?.crop_name ?? "storage goods"}`,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  const distance = null;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={mode === "inward" ? "Request vehicle — inbound" : "Request vehicle — outbound"}
      subtitle="Creates a transport request that registered transporters can quote"
    >
      <div className="space-y-3">
        {candidates.length > 0 && (
          <Field label="Fill from a booking" hint="Optional — copies the weight and the warehouse location.">
            <select
              value={target?.id ?? ""}
              onChange={(e) => prefillFrom(e.target.value)}
              className={inputClass}
            >
              <option value="">Enter manually</option>
              {candidates.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.crop_name ?? "Crop"} · {b.depositor_name ?? "Depositor"} ·{" "}
                  {formatWeight(
                    mode === "inward"
                      ? Math.max(Number(b.quantity_kg) - Number(b.received_kg), 0)
                      : Number(b.stored_kg ?? 0)
                  )}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Warehouse">
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              const next = warehouses.find((w) => w.id === e.target.value);
              const label = [next?.village, next?.district, next?.state].filter(Boolean).join(", ");
              if (mode === "inward") setDropoff(label);
              else setPickup(label);
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pickup location" required>
            <input value={pickup} onChange={(e) => setPickup(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Delivery location" required>
            <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Load (kg)" required>
            <input value={loadKg} onChange={(e) => setLoadKg(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Needed on">
            <input type="date" value={neededOn} onChange={(e) => setNeededOn(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label="Notes for the transporter">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
            placeholder="Gate timings, vehicle size, loading help needed."
          />
        </Field>

        <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500">
          Distance is not estimated here — transporters quote on the route they know. {distance}
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
            <Truck className="h-3.5 w-3.5" /> {busy ? "Posting…" : "Post request"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
