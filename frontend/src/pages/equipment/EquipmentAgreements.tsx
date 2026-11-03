import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Plus, Printer } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { BookingStatusPill, SectionHeading } from "@/components/equipment/ui";
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
  createAgreement,
  describeEquipmentError,
  formatDate,
  formatINR,
  listAgreements,
  listBookings,
} from "@/lib/equipment";
import type { EquipmentAgreement, EquipmentBooking } from "@/lib/equipment";

/**
 * Rental Agreements.
 *
 * A written agreement per confirmed booking: parties, dates, price breakdown,
 * and the fuel/operator/transport policy. The owner creates it; both parties'
 * confirmation timestamps are kept so there is no argument about who agreed to
 * what.
 */
export default function EquipmentAgreements() {
  const D = describeEquipmentError;
  const agreements = useWorkerData<EquipmentAgreement[]>(() => listAgreements(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);

  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<EquipmentAgreement | null>(null);

  const agreementList = agreements.data ?? [];
  const bookingList = bookings.data ?? [];

  const byBooking = useMemo(
    () => new Map(agreementList.map((a) => [a.booking_id, a])),
    [agreementList]
  );

  /** Bookings that can have an agreement: accepted or later, not closed out. */
  const eligible = bookingList.filter(
    (b) =>
      !["requested", "rejected", "declined", "cancelled", "closed"].includes(b.status) &&
      !byBooking.has(b.id)
  );

  if (agreements.state === "loading") {
    return (
      <EquipmentLayout title="Rental Agreements">
        <Loading label="Loading agreements…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout
      title="Rental Agreements"
      subtitle="Written terms for each confirmed rental"
      action={
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={eligible.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> New agreement
        </button>
      }
    >
      {agreements.state === "error" && <ErrorNotice message={agreements.error} onRetry={agreements.reload} />}

      <Panel title="Agreements" description={`${agreementList.length} on file`}>
        {agreementList.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No agreement yet"
            description="Create one for a confirmed booking. It records the price breakdown and the fuel, operator and transport policy, so a later disagreement has a written reference."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {agreementList.map((a) => {
              const booking = bookingList.find((b) => b.id === a.booking_id);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {booking?.equipment_title ?? "Machine"} · {booking?.renter_name ?? "Renter"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {booking ? `${formatDate(booking.starts_on)} → ${formatDate(booking.ends_on)}` : ""} ·
                      created {formatDate(a.created_at)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.renter_confirmed_at
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                      }`}
                  >
                    {a.renter_confirmed_at ? "Both confirmed" : "Awaiting renter"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewing(a)}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <section>
        <SectionHeading title="Bookings without an agreement" hint="Accepted or in progress" />
        <Panel title="Pending paperwork">
          {eligible.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              Every active booking already has an agreement.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {eligible.slice(0, 10).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {b.equipment_title ?? "Machine"} · {b.renter_name ?? "Renter"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {formatDate(b.starts_on)} → {formatDate(b.ends_on)} ·{" "}
                      {formatINR(Number(b.agreed_price_inr))}
                    </p>
                  </div>
                  <BookingStatusPill status={b.status} />
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="shrink-0 rounded-lg bg-brand-700 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-800"
                  >
                    Create
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <Panel title="Work completion" description="Recorded on the booking, not here">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• Work hours, completed acreage and notes are recorded from the booking's Manage dialog.</li>
          <li>• Completion moves the booking to <strong>Work completed</strong>; payment is confirmed separately.</li>
          <li>• The renter's acknowledgement and any dispute are tracked on the same booking.</li>
        </ul>
      </Panel>

      {open && (
        <NewAgreementModal
          bookings={eligible}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            agreements.reload();
          }}
        />
      )}

      {viewing && (
        <Modal open onClose={() => setViewing(null)} wide title="Rental agreement" subtitle={`#${viewing.booking_id.slice(0, 8)}`}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${viewing.owner_confirmed_at ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
              >
                Owner {viewing.owner_confirmed_at ? "confirmed" : "not confirmed"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${viewing.renter_confirmed_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
              >
                Renter {viewing.renter_confirmed_at ? "confirmed" : "awaiting"}
              </span>
            </div>

            <dl className="space-y-2 text-[11.5px]">
              <Term label="Terms" value={viewing.terms} />
              {viewing.fuel_policy && <Term label="Fuel policy" value={viewing.fuel_policy} />}
              {viewing.operator_policy && <Term label="Operator policy" value={viewing.operator_policy} />}
              {viewing.transport_policy && <Term label="Transport policy" value={viewing.transport_policy} />}
              {viewing.damage_terms && <Term label="Damage terms" value={viewing.damage_terms} />}
              {viewing.cancellation_terms && <Term label="Cancellation" value={viewing.cancellation_terms} />}
            </dl>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </EquipmentLayout>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{value}</dd>
    </div>
  );
}

function NewAgreementModal({
  bookings,
  onClose,
  onSaved,
}: {
  bookings: EquipmentBooking[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeEquipmentError;
  const [bookingId, setBookingId] = useState(bookings[0]?.id ?? "");
  const [terms, setTerms] = useState(
    "The machine is hired for the stated period. The renter provides clear access to the field and does not operate the machine outside the agreed work."
  );
  const [fuelPolicy, setFuelPolicy] = useState("");
  const [operatorPolicy, setOperatorPolicy] = useState("");
  const [transportPolicy, setTransportPolicy] = useState("");
  const [damageTerms, setDamageTerms] = useState("");
  const [cancellation, setCancellation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const booking = bookings.find((b) => b.id === bookingId) ?? null;

  async function handleSave() {
    if (!booking) {
      setError("Choose a booking.");
      return;
    }
    if (terms.trim().length < 20) {
      setError("The terms need at least a sentence — a one-word agreement protects nobody.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createAgreement({
        booking_id: booking.id,
        renter_id: booking.renter_id,
        terms: terms.trim(),
        fuel_policy: fuelPolicy.trim() || null,
        operator_policy: operatorPolicy.trim() || null,
        transport_policy: transportPolicy.trim() || null,
        damage_terms: damageTerms.trim() || null,
        cancellation_terms: cancellation.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide title="New rental agreement">
      <div className="space-y-3">
        <Field label="Booking" required>
          <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} className={inputClass}>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.equipment_title ?? "Machine"} · {b.renter_name ?? "Renter"} · {formatDate(b.starts_on)}
              </option>
            ))}
          </select>
        </Field>

        {booking && (
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-[11.5px] sm:grid-cols-4">
            <div>
              <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Period</dt>
              <dd className="font-bold text-forest">
                {formatDate(booking.starts_on)} → {formatDate(booking.ends_on)}
              </dd>
            </div>
            <div>
              <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Agreed price</dt>
              <dd className="font-bold text-forest">{formatINR(Number(booking.agreed_price_inr))}</dd>
            </div>
            <div>
              <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Operator</dt>
              <dd className="font-bold text-forest">{booking.operator_included ? "Included" : "Renter provides"}</dd>
            </div>
            <div>
              <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Fuel</dt>
              <dd className="font-bold text-forest">{booking.fuel_included ? "Included" : "Renter provides"}</dd>
            </div>
          </dl>
        )}

        <Field label="Terms" required>
          <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fuel policy">
            <textarea
              value={fuelPolicy}
              onChange={(e) => setFuelPolicy(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="e.g. diesel supplied by the renter"
            />
          </Field>
          <Field label="Operator policy">
            <textarea
              value={operatorPolicy}
              onChange={(e) => setOperatorPolicy(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="e.g. our operator drives; renter provides helpers"
            />
          </Field>
          <Field label="Transport policy">
            <textarea
              value={transportPolicy}
              onChange={(e) => setTransportPolicy(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="e.g. transport charged separately beyond 15 km"
            />
          </Field>
          <Field label="Damage terms">
            <textarea
              value={damageTerms}
              onChange={(e) => setDamageTerms(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="e.g. damage from misuse is charged at repair cost"
            />
          </Field>
        </div>

        <Field label="Cancellation terms">
          <textarea
            value={cancellation}
            onChange={(e) => setCancellation(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
            placeholder="e.g. free cancellation 48 hours before the start date"
          />
        </Field>

        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
          Creating the agreement records your confirmation. The renter confirms from their side, and both
          timestamps are kept.
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
            <FileText className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Create agreement"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
