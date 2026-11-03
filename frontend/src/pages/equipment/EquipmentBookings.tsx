import { useMemo, useState } from "react";
import { CalendarDays, Filter, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import EquipmentLayout, { EQUIPMENT_ROUTES } from "@/components/equipment/EquipmentLayout";
import { BookingStatusPill, PaymentStatusPill } from "@/components/equipment/ui";
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
  BOOKING_LABEL,
  BOOKING_STATUSES,
  NEXT_STATUSES,
  assignOperator,
  checkOperatorAvailability,
  describeEquipmentError,
  formatDate,
  formatINR,
  formatTime,
  listBookings,
  listOperators,
  recordCompletion,
  setBookingStatus,
} from "@/lib/equipment";
import type {
  BookingStatus,
  EquipmentBooking,
  EquipmentOperator,
} from "@/lib/equipment";

/**
 * Bookings & Rentals.
 *
 * The lifecycle buttons come from NEXT_STATUSES, which mirrors the database
 * transition trigger — an illegal jump is never offered, and would be refused if
 * it arrived anyway.
 *
 * Payment is deliberately absent: an invoice is issued and settled by the
 * CenAGRI backend, so there is no "mark paid" control here at all.
 */
export default function EquipmentBookings() {
  const D = describeEquipmentError;
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);
  const operators = useWorkerData<EquipmentOperator[]>(() => listOperators(), [], D);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BookingStatus | "all">("all");
  const [target, setTarget] = useState<EquipmentBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EquipmentBooking | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bookingList = bookings.data ?? [];
  const operatorList = operators.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookingList.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (!q) return true;
      return (
        (b.equipment_title ?? "").toLowerCase().includes(q) ||
        (b.renter_name ?? "").toLowerCase().includes(q) ||
        (b.farm_location ?? "").toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
      );
    });
  }, [bookingList, search, status]);

  const counts = useMemo(() => {
    const map = new Map<BookingStatus, number>();
    for (const b of bookingList) map.set(b.status, (map.get(b.status) ?? 0) + 1);
    return map;
  }, [bookingList]);

  async function advance(booking: EquipmentBooking, next: BookingStatus) {
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
      setError("Give a short reason — the renter sees it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setBookingStatus(cancelTarget.id, "cancelled", cancelReason.trim());
      bookings.reload();
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
      <EquipmentLayout title="Bookings & Rentals">
        <Loading label="Loading bookings…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout title="Bookings & Rentals" subtitle="Every rental and its stage">
      {bookings.state === "error" && <ErrorNotice message={bookings.error} onRetry={bookings.reload} />}
      {error && <ErrorNotice message={error} />}

      <Panel title="Filters" description="Narrow the list">
        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Machine, renter or location"
              className={`${inputClass} pl-8`}
            />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | "all")} className={inputClass}>
            <option value="all">All statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_LABEL[s]}
                {counts.get(s) ? ` (${counts.get(s)})` : ""}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel
        title="Bookings"
        description={`${filtered.length} of ${bookingList.length} shown`}
        action={
          <Link to={EQUIPMENT_ROUTES.requests} className="text-[11px] font-bold text-brand-700 hover:underline">
            Find requests
          </Link>
        }
      >
        {bookingList.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bookings yet"
            description="A booking starts when you accept a rental request or create one directly. It then moves through operator assignment, the job itself, and completion."
            action={
              <Link
                to={EQUIPMENT_ROUTES.requests}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Browse rental requests
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="Nothing matches"
            description="Clear the search or choose another status."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">Machine / renter</th>
                  <th className="px-4 py-2 font-bold">Dates</th>
                  <th className="px-4 py-2 font-bold">Operator</th>
                  <th className="px-4 py-2 font-bold">Amount</th>
                  <th className="px-4 py-2 font-bold">Payment</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                  <th className="px-4 py-2 font-bold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((b) => {
                  const next = NEXT_STATUSES[b.status] ?? [];
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-forest">{b.equipment_title ?? "Machine"}</p>
                        <p className="text-[10px] text-slate-500">{b.renter_name ?? "Renter"}</p>
                        <p className="font-mono text-[9.5px] text-slate-400">{b.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {formatDate(b.starts_on)}
                        <br />
                        <span className="text-[10px]">
                          to {formatDate(b.ends_on)}
                          {b.start_time ? ` · ${formatTime(b.start_time)}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {b.operator_name ?? <span className="text-slate-400">Not assigned</span>}
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
          operators={operatorList}
          allBookings={bookingList}
          busy={busy}
          error={error}
          onClose={() => setTarget(null)}
          onAdvance={(next) => void advance(target, next)}
          onReload={() => bookings.reload()}
        />
      )}

      <Modal
        open={cancelTarget != null}
        onClose={() => setCancelTarget(null)}
        title="Cancel this booking?"
        subtitle={cancelTarget ? `${cancelTarget.equipment_title ?? "Machine"} · ${cancelTarget.renter_name ?? "Renter"}` : undefined}
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
            Cancelling is final — a cancelled booking is never reopened. The machine's dates become free
            again immediately.
          </p>
          <Field label="Reason" required hint="Shown to the renter.">
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
    </EquipmentLayout>
  );
}

/* ── Manage one booking ────────────────────────────────────────────────── */

function ManageModal({
  booking,
  operators,
  allBookings,
  busy,
  error,
  onClose,
  onAdvance,
  onReload,
}: {
  booking: EquipmentBooking;
  operators: EquipmentOperator[];
  allBookings: EquipmentBooking[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onAdvance: (next: BookingStatus) => void;
  onReload: () => void;
}) {
  const D = describeEquipmentError;
  const next = NEXT_STATUSES[booking.status] ?? [];

  const [operatorId, setOperatorId] = useState(booking.operator_id ?? "");
  const [savingOperator, setSavingOperator] = useState(false);
  const [localError, setLocalError] = useState("");

  const [completeOpen, setCompleteOpen] = useState(false);
  const [workHours, setWorkHours] = useState(booking.work_hours != null ? String(booking.work_hours) : "");
  const [acres, setAcres] = useState(
    booking.completed_acres != null ? String(booking.completed_acres) : booking.land_area_acres != null ? String(booking.land_area_acres) : ""
  );
  const [notes, setNotes] = useState(booking.completion_notes ?? "");
  const [saving, setSaving] = useState(false);

  /** Operators free for this window — checked here and again in the database. */
  const eligible = operators.map((op) => {
    const availability = checkOperatorAvailability(op.id, booking.starts_on, booking.ends_on, allBookings, booking.id);
    return {
      operator: op,
      ok: op.status !== "inactive" && op.status !== "leave" && availability.ok,
      reason: op.status === "leave" ? "On leave" : op.status === "inactive" ? "Inactive" : availability.reason,
    };
  });

  async function saveOperator() {
    setSavingOperator(true);
    setLocalError("");
    try {
      await assignOperator(booking.id, operatorId);
      onReload();
      onClose();
    } catch (err) {
      setLocalError(D(err));
    } finally {
      setSavingOperator(false);
    }
  }

  async function saveCompletion() {
    setSaving(true);
    setLocalError("");
    try {
      await recordCompletion({
        bookingId: booking.id,
        workHours: workHours.trim() ? Number(workHours) : null,
        completedAcres: acres.trim() ? Number(acres) : null,
        notes: notes.trim() || null,
        photos: booking.completion_photos ?? [],
      });
      onReload();
      onClose();
    } catch (err) {
      setLocalError(D(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={booking.equipment_title ?? "Booking"}
      subtitle={`${booking.renter_name ?? "Renter"} · ${formatDate(booking.starts_on)} → ${formatDate(booking.ends_on)}`}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <BookingStatusPill status={booking.status} />
          <PaymentStatusPill status={booking.payment_status} />
          <span className="font-mono text-[10px] text-slate-400">{booking.id}</span>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-[11.5px] sm:grid-cols-4">
          <Cell label="Agreed" value={Number(booking.agreed_price_inr) > 0 ? formatINR(Number(booking.agreed_price_inr)) : "—"} />
          <Cell label="Land" value={booking.land_area_acres != null ? `${booking.land_area_acres} acre` : "—"} />
          <Cell label="Operator" value={booking.operator_included ? "Included" : "Not included"} />
          <Cell label="Fuel" value={booking.fuel_included ? "Included" : "Not included"} />
        </dl>

        {booking.farm_location && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            Farm: {booking.farm_location}
            {booking.work_type ? ` · ${booking.work_type}` : ""}
          </p>
        )}

        <Field label="Operator" hint="Only operators free for these dates can be chosen.">
          <div className="flex gap-2">
            <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={inputClass}>
              <option value="">Not assigned</option>
              {eligible.map(({ operator, ok, reason }) => (
                <option key={operator.id} value={operator.id} disabled={!ok}>
                  {operator.full_name}
                  {ok ? "" : ` — ${reason}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void saveOperator()}
              disabled={savingOperator || !operatorId || operatorId === (booking.operator_id ?? "")}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {savingOperator ? "Saving…" : "Save"}
            </button>
          </div>
          {eligible.length === 0 && (
            <p className="mt-1 text-[10.5px] text-amber-700">
              No operator added yet. Add one under Operator Management to assign work.
            </p>
          )}
        </Field>

        {booking.status === "scheduled" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[11px] font-semibold text-emerald-900">Job finished?</p>
            <p className="mt-0.5 text-[10.5px] text-emerald-800">
              Recording completion captures what actually happened — hours, acreage and notes — and moves
              the booking to Work completed. Payment is confirmed separately by CenAGRI.
            </p>
            <button
              type="button"
              onClick={() => setCompleteOpen((v) => !v)}
              className="mt-2 inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-[11px] font-semibold text-white hover:bg-emerald-700"
            >
              {completeOpen ? "Hide form" : "Record completion"}
            </button>

            {completeOpen && (
              <div className="mt-2 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Work hours">
                    <input value={workHours} onChange={(e) => setWorkHours(e.target.value)} className={inputClass} inputMode="decimal" />
                  </Field>
                  <Field label="Completed acres">
                    <input value={acres} onChange={(e) => setAcres(e.target.value)} className={inputClass} inputMode="decimal" />
                  </Field>
                </div>
                <Field label="Completion notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => void saveCompletion()}
                  disabled={saving}
                  className="inline-flex h-8 items-center rounded-lg bg-emerald-700 px-3 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save completion"}
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Next step</p>
          {next.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
              This booking is closed — no further action.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {next.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => onAdvance(s)}
                  className={`inline-flex h-9 items-center justify-center rounded-lg text-[11.5px] font-semibold transition disabled:opacity-60 ${s === "cancelled" || s === "disputed" || s === "rejected"
                      ? "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                      : "bg-brand-700 text-white hover:bg-brand-800"
                    }`}
                >
                  Mark as {BOOKING_LABEL[s].toLowerCase()}
                </button>
              ))}
            </div>
          )}
          {booking.status === "work_completed" && (
            <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-sky-900">
              Payment cannot be marked here. CenAGRI confirms payment after the renter settles; the booking
              then moves to Payment confirmed.
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
