import { useMemo, useState } from "react";
import {
  CalendarCheck,
  Filter,
  Search,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import WarehouseLayout, { WAREHOUSE_ROUTES } from "@/components/warehouse/WarehouseLayout";
import {
  BookingStatusPill,
  CapacityBar,
  PaymentStatusPill,
} from "@/components/warehouse/ui";
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
  BOOKING_STATUS_LABEL,
  NEXT_BOOKING_STATUSES,
  STORAGE_BOOKING_STATUSES,
  assignSection,
  describeWarehouseError,
  formatDate,
  formatINR,
  formatWeight,
  listCapacity,
  listSections,
  listStorageBookings,
  setBookingStatus,
} from "@/lib/warehouse";
import type {
  StorageBooking,
  StorageBookingStatus,
  WarehouseCapacity,
  WarehouseSection,
} from "@/lib/warehouse";

/**
 * Bookings & Reservations.
 *
 * One lifecycle for every storage reservation. The status buttons come from
 * NEXT_BOOKING_STATUSES, which mirrors the database trigger — so an illegal jump
 * is never even offered, and the database refuses it if it somehow arrives.
 *
 * Reserving capacity happens in the trigger when a booking becomes `confirmed`;
 * this page never writes a capacity number itself.
 */
export default function WarehouseBookings() {
  const D = describeWarehouseError;
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StorageBookingStatus | "all">("all");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [target, setTarget] = useState<StorageBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StorageBooking | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bookingList = bookings.data ?? [];
  const capacityList = capacity.data ?? [];
  const capById = useMemo(() => new Map(capacityList.map((c) => [c.id, c])), [capacityList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookingList.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (warehouseId !== "all" && b.warehouse_id !== warehouseId) return false;
      if (!q) return true;
      return (
        (b.depositor_name ?? "").toLowerCase().includes(q) ||
        (b.crop_name ?? "").toLowerCase().includes(q) ||
        (b.warehouse_name ?? "").toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
      );
    });
  }, [bookingList, status, warehouseId, search]);

  const counts = useMemo(() => {
    const map = new Map<StorageBookingStatus, number>();
    for (const b of bookingList) map.set(b.status, (map.get(b.status) ?? 0) + 1);
    return map;
  }, [bookingList]);

  async function advance(booking: StorageBooking, next: StorageBookingStatus) {
    if (next === "cancelled") {
      setCancelTarget(booking);
      setCancelReason("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setBookingStatus(booking.id, next);
      bookings.reload();
      capacity.reload();
      setTarget(null);
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      setError("Give a short reason — it is shown to the depositor.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setBookingStatus(cancelTarget.id, "cancelled", cancelReason.trim());
      bookings.reload();
      capacity.reload();
      setCancelTarget(null);
      setTarget(null);
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  if (bookings.state === "loading") {
    return (
      <WarehouseLayout title="Bookings & Reservations">
        <Loading label="Loading bookings…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Bookings & Reservations"
      subtitle="Every storage reservation and its stage"
    >
      {bookings.state === "error" && <ErrorNotice message={bookings.error} onRetry={bookings.reload} />}
      {error && <ErrorNotice message={error} />}

      <Panel title="Filters" description="Narrow the list">
        <div className="grid gap-2 p-4 sm:grid-cols-3 sm:p-5">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Depositor, crop or warehouse"
              className={`${inputClass} pl-8`}
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StorageBookingStatus | "all")}
            className={inputClass}
          >
            <option value="all">All statuses</option>
            {STORAGE_BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABEL[s]}
                {counts.get(s) ? ` (${counts.get(s)})` : ""}
              </option>
            ))}
          </select>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
            <option value="all">All warehouses</option>
            {capacityList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel
        title="Bookings"
        description={`${filtered.length} of ${bookingList.length} shown`}
        action={
          <Link
            to={WAREHOUSE_ROUTES.requests}
            className="text-[11px] font-bold text-brand-700 hover:underline"
          >
            Find requests
          </Link>
        }
      >
        {bookingList.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No bookings yet"
            description="A booking is created when you accept a storage request or reserve space for a customer. It then moves through confirmation, inward, storage and release."
            action={
              <Link
                to={WAREHOUSE_ROUTES.requests}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Browse storage requests
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="Nothing matches these filters"
            description="Clear the search or pick a different status."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                  setWarehouseId("all");
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">Depositor / crop</th>
                  <th className="px-4 py-2 font-bold">Warehouse</th>
                  <th className="px-4 py-2 font-bold">Quantity</th>
                  <th className="px-4 py-2 font-bold">Period</th>
                  <th className="px-4 py-2 font-bold">Agreed</th>
                  <th className="px-4 py-2 font-bold">Payment</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                  <th className="px-4 py-2 font-bold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((b) => {
                  const next = NEXT_BOOKING_STATUSES[b.status] ?? [];
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-forest">{b.depositor_name ?? "Depositor"}</p>
                        <p className="text-[10px] text-slate-500">
                          {b.crop_name ?? "Crop"}
                          {b.variety ? ` · ${b.variety}` : ""}
                        </p>
                        <p className="font-mono text-[9.5px] text-slate-400">{b.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-700">{b.warehouse_name ?? "—"}</p>
                        <p className="text-[10px] text-slate-500">{b.section_name ?? "No section"}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-700">{formatWeight(Number(b.quantity_kg))}</p>
                        <p className="text-[10px] text-slate-500">
                          {formatWeight(Number(b.received_kg))} received
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {formatDate(b.starts_on)}
                        <br />
                        <span className="text-[10px]">to {formatDate(b.ends_on)}</span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        {Number(b.agreed_price_inr) > 0 ? formatINR(Number(b.agreed_price_inr)) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <PaymentStatusPill status={b.payment_status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <BookingStatusPill status={b.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {next.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError("");
                              setTarget(b);
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Manage
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {target && (
        <ManageModal
          booking={target}
          warehouse={capById.get(target.warehouse_id) ?? null}
          busy={busy}
          error={error}
          onClose={() => setTarget(null)}
          onAdvance={(next) => void advance(target, next)}
        />
      )}

      <Modal
        open={cancelTarget != null}
        onClose={() => setCancelTarget(null)}
        title="Cancel this booking?"
        subtitle={cancelTarget ? `${cancelTarget.depositor_name ?? "Depositor"} · ${cancelTarget.crop_name ?? "Crop"}` : undefined}
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
            Cancelling is final — a cancelled booking cannot be reopened. Any capacity it reserved is
            released immediately.
          </p>
          <Field label="Reason" required hint="Shown to the depositor, so keep it factual.">
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              maxLength={500}
              className={`${inputClass} resize-none`}
            />
          </Field>
          {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Keep booking
            </button>
            <button
              type="button"
              onClick={() => void confirmCancel()}
              disabled={busy}
              className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? "Cancelling…" : "Cancel booking"}
            </button>
          </div>
        </div>
      </Modal>
    </WarehouseLayout>
  );
}

/* ── Manage a booking ──────────────────────────────────────────────────── */

function ManageModal({
  booking,
  warehouse,
  busy,
  error,
  onClose,
  onAdvance,
}: {
  booking: StorageBooking;
  warehouse: WarehouseCapacity | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onAdvance: (next: StorageBookingStatus) => void;
}) {
  const D = describeWarehouseError;
  const next = NEXT_BOOKING_STATUSES[booking.status] ?? [];
  const sections = useWorkerData<WarehouseSection[]>(
    () => listSections(booking.warehouse_id),
    [booking.warehouse_id],
    D
  );
  const [sectionId, setSectionId] = useState(booking.section_id ?? "");
  const [savingSection, setSavingSection] = useState(false);
  const [localError, setLocalError] = useState("");

  async function saveSection() {
    setSavingSection(true);
    setLocalError("");
    try {
      await assignSection(booking.id, sectionId || null);
      onClose();
    } catch (err) {
      setLocalError(D(err));
    } finally {
      setSavingSection(false);
    }
  }

  const receivedPct =
    Number(booking.quantity_kg) > 0
      ? Math.min((Number(booking.received_kg) / Number(booking.quantity_kg)) * 100, 100)
      : 0;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={booking.depositor_name ?? "Booking"}
      subtitle={`${booking.crop_name ?? "Crop"} · ${formatWeight(Number(booking.quantity_kg))} · ${booking.warehouse_name ?? ""}`}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <BookingStatusPill status={booking.status} />
          <PaymentStatusPill status={booking.payment_status} />
          <span className="font-mono text-[10px] text-slate-400">{booking.id}</span>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-[11.5px] sm:grid-cols-4">
          <Cell label="Starts" value={formatDate(booking.starts_on)} />
          <Cell label="Ends" value={formatDate(booking.ends_on)} />
          <Cell label="Received" value={formatWeight(Number(booking.received_kg))} />
          <Cell label="Released" value={formatWeight(Number(booking.released_kg))} />
        </dl>

        <div>
          <div className="flex items-center justify-between text-[10.5px] text-slate-500">
            <span>Goods received against the booking</span>
            <span className="font-bold text-forest">{Math.round(receivedPct)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${receivedPct}%` }} />
          </div>
        </div>

        {warehouse && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Warehouse capacity
            </p>
            <CapacityBar
              capacityKg={warehouse.capacity_kg}
              reservedKg={warehouse.reserved_kg}
              occupiedKg={warehouse.occupied_kg}
            />
          </div>
        )}

        <Field label="Storage section" hint="Move the booking to a section that matches the commodity.">
          <div className="flex gap-2">
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={inputClass}>
              <option value="">Not specified</option>
              {(sections.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.commodity_category}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void saveSection()}
              disabled={savingSection || sectionId === (booking.section_id ?? "")}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {savingSection ? "Saving…" : "Save"}
            </button>
          </div>
        </Field>

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Next step
          </p>
          {next.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
              This booking is finished — no further action.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {next.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => onAdvance(s)}
                  className={`inline-flex h-9 items-center justify-center rounded-lg text-[11.5px] font-semibold transition disabled:opacity-60 ${
                    s === "cancelled" || s === "disputed"
                      ? "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                      : "bg-brand-700 text-white hover:bg-brand-800"
                  }`}
                >
                  Mark as {BOOKING_STATUS_LABEL[s].toLowerCase()}
                </button>
              ))}
            </div>
          )}
          {booking.status === "goods_expected" && (
            <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-sky-900">
              Goods received is normally set by recording a receipt on the Goods Inward screen — that
              also creates the inventory lot and moves the stock into occupied capacity.
            </p>
          )}
        </div>

        {(localError || error) && (
          <p className="text-[11.5px] font-semibold text-rose-600">{localError || error}</p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-bold text-forest">{value}</dd>
    </div>
  );
}
