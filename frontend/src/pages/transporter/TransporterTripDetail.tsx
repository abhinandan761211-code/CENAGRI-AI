import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  History,
  MapPin,
  Package,
  Paperclip,
  ShieldCheck,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { BookingStatusPill, TripProgressRail } from "@/components/transporter/ui";
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
  NEXT_STATUSES,
  describeTransporterError,
  driverEligible,
  formatDate,
  formatDateTime,
  formatINR,
  formatTime,
  formatWeight,
  getBooking,
  getProof,
  licenceState,
  listBookings,
  listDrivers,
  listFleet,
  listTripEvents,
  recordProof,
  setBookingStatus,
  uploadPrivateFile,
  PROOF_BUCKET,
  updateBookingAssignments,
  vehicleEligible,
} from "@/lib/transporter";
import type {
  DeliveryProof,
  Driver,
  FleetVehicle,
  TransportBooking,
  TripEvent,
} from "@/lib/transporter";

/**
 * One trip, end to end.
 *
 * Three things happen here: advance the status, assign a vehicle/driver, and
 * record proof of delivery. All three are guarded by the database — the status
 * trigger rejects an illegal jump or reopening a finished booking, and the
 * eligibility checks below refuse a vehicle that is too small or already busy.
 */
export default function TransporterTripDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const D = describeTransporterError;

  const booking = useWorkerData<TransportBooking | null>(() => getBooking(id), [id], D);
  const allBookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);
  const drivers = useWorkerData<Driver[]>(() => listDrivers(), [], D);
  const events = useWorkerData<TripEvent[]>(() => listTripEvents(id), [id], D);
  const proof = useWorkerData<DeliveryProof | null>(() => getProof(id), [id], D);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [assignOpen, setAssignOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");

  const [proofOpen, setProofOpen] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receivedQty, setReceivedQty] = useState("");
  const [damage, setDamage] = useState("");
  const [proofNotes, setProofNotes] = useState("");
  const [proofError, setProofError] = useState("");
  // The photo lives in the private proofs bucket; only its object path is
  // stored, never a public URL.
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const row = booking.data;
  const bookings = allBookings.data ?? [];
  const vehicles = fleet.data ?? [];
  const driverList = drivers.data ?? [];

  const nextStatuses = row ? NEXT_STATUSES[row.status] ?? [] : [];

  /** Eligible options for this specific trip. */
  const vehicleOptions = useMemo(() => {
    if (!row) return [];
    return vehicles.map((v) => ({ vehicle: v, check: vehicleEligible(v, row, bookings) }));
  }, [row, vehicles, bookings]);

  const driverOptions = useMemo(() => {
    if (!row) return [];
    return driverList.map((d) => ({ driver: d, check: driverEligible(d, row, bookings) }));
  }, [row, driverList, bookings]);

  async function advance(status: TransportBooking["status"]) {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      await setBookingStatus(row.id, status);
      booking.reload();
      events.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign() {
    if (!row) return;
    if (!vehicleId && !driverId) {
      setError("Choose a vehicle, a driver, or both.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const patch: { vehicle_id?: string; driver_id?: string } = {};
      if (vehicleId) patch.vehicle_id = vehicleId;
      if (driverId) patch.driver_id = driverId;
      await updateBookingAssignments(row.id, patch);
      setAssignOpen(false);
      booking.reload();
      events.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleProof() {
    if (!row) return;
    if (receiver.trim().length < 2) {
      setProofError("Enter the name of the person who received the cargo.");
      return;
    }
    setBusy(true);
    setProofError("");
    try {
      // Upload first: a proof row must never point at a file that failed.
      let photoPath: string | null = null;
      if (photo) {
        setUploadingPhoto(true);
        photoPath = await uploadPrivateFile(photo, PROOF_BUCKET, "proof");
      }
      await recordProof(row.id, {
        receiver_name: receiver.trim(),
        receiver_phone: receiverPhone.trim() || null,
        received_qty: receivedQty.trim() || null,
        damage_notes: damage.trim() || null,
        notes: proofNotes.trim() || null,
        photo_url: photoPath,
      });
      setProofOpen(false);
      setPhoto(null);
      proof.reload();
      booking.reload();
    } catch (err) {
      setProofError(D(err));
    } finally {
      setUploadingPhoto(false);
      setBusy(false);
    }
  }

  if (booking.state === "loading") {
    return (
      <TransporterLayout title="Trip">
        <Loading label="Loading trip…" />
      </TransporterLayout>
    );
  }

  if (booking.state === "error") {
    return (
      <TransporterLayout title="Trip">
        <ErrorNotice message={booking.error} onRetry={booking.reload} />
      </TransporterLayout>
    );
  }

  if (!row) {
    return (
      <TransporterLayout title="Trip not found">
        <div className="card">
          <EmptyState
            icon={Truck}
            title="Trip not found"
            description="This booking does not exist, or it belongs to another transporter."
            action={
              <button
                type="button"
                onClick={() => navigate(TRANSPORTER_ROUTES.trips)}
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Back to trips
              </button>
            }
          />
        </div>
      </TransporterLayout>
    );
  }

  const isFinished = row.status === "completed" || row.status === "cancelled";

  return (
    <TransporterLayout
      title={row.title}
      subtitle={`${row.requester_name ?? "Requester"} · ${formatINR(Number(row.agreed_price_inr))}`}
      action={
        <div className="flex items-center gap-2">
          <BookingStatusPill status={row.status} />
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        </div>
      }
    >
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      <div className="card p-4 sm:p-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Trip stage</p>
        <TripProgressRail status={row.status} />
        {isFinished && (
          <p className="mt-2 text-[11px] font-semibold text-slate-500">
            This trip is {BOOKING_STATUS_LABEL[row.status].toLowerCase()} and cannot be reopened.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Route">
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <CircleDot className="h-4 w-4 text-emerald-600" />
                  <span className="my-0.5 h-8 w-px bg-slate-200" />
                  <MapPin className="h-4 w-4 text-rose-500" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pickup</p>
                    <p className="text-[13px] font-semibold text-forest">{row.pickup}</p>
                    <p className="text-[11px] text-slate-500">
                      {row.pickup_on ? `${formatDate(row.pickup_on)}${row.pickup_time ? ` · ${formatTime(row.pickup_time)}` : ""}` : "Date not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination</p>
                    <p className="text-[13px] font-semibold text-forest">{row.dropoff}</p>
                    <p className="text-[11px] text-slate-500">
                      {row.actual_delivery_at
                        ? `Delivered ${formatDateTime(row.actual_delivery_at)}`
                        : row.expected_delivery_at
                          ? `Expected ${formatDateTime(row.expected_delivery_at)}`
                          : "Expected time not set"}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
                <Cell icon={Package} label="Cargo" value={formatWeight(Number(row.weight_kg ?? 0) || null)} />
                <Cell icon={Truck} label="Vehicle" value={row.vehicle_registration ?? "Not assigned"} />
                <Cell icon={UserRound} label="Driver" value={row.driver_name ?? "Not assigned"} />
                <Cell
                  icon={MapPin}
                  label="Distance"
                  value={row.distance_km != null ? `${row.distance_km} km` : "Not provided"}
                />
              </dl>
            </div>
          </Panel>

          <Panel title="Trip history" description="Every status change, with who and when">
            {events.state === "ready" && (events.data ?? []).length === 0 ? (
              <div className="px-4 py-6 text-center text-[11.5px] text-slate-500">
                No changes recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(events.data ?? []).map((event) => (
                  <li key={event.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-semibold text-forest">
                        {event.type === "status" && event.to_status
                          ? `${event.from_status ? `${BOOKING_STATUS_LABEL[event.from_status as keyof typeof BOOKING_STATUS_LABEL] ?? event.from_status} → ` : ""}${BOOKING_STATUS_LABEL[event.to_status as keyof typeof BOOKING_STATUS_LABEL] ?? event.to_status
                          }`
                          : event.note ?? event.type}
                      </p>
                      <p className="text-[10.5px] text-slate-500">{formatDateTime(event.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Proof of delivery" description="What the receiver confirmed">
            {proof.data ? (
              <div className="space-y-2 p-4 sm:p-5">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  <p className="text-[11.5px] font-semibold text-emerald-900">
                    Received by {proof.data.receiver_name} on {formatDateTime(proof.data.delivered_at)}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-[11.5px]">
                  <div>
                    <dt className="text-[10px] font-bold uppercase text-slate-500">Phone</dt>
                    <dd className="font-semibold text-forest">{proof.data.receiver_phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase text-slate-500">Quantity received</dt>
                    <dd className="font-semibold text-forest">{proof.data.received_qty ?? "—"}</dd>
                  </div>
                </dl>
                {proof.data.damage_notes && (
                  <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                    Damage: {proof.data.damage_notes}
                  </p>
                )}
                {proof.data.notes && (
                  <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-700">
                    {proof.data.notes}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 sm:p-5">
                <p className="text-[11.5px] text-slate-500">
                  No proof recorded yet. Record it when the cargo is handed over.
                </p>
                {["picked_up", "in_transit", "delivered"].includes(row.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setProofError("");
                      setProofOpen(true);
                    }}
                    className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Record proof of delivery
                  </button>
                )}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Sidebar: actions ── */}
        <aside className="space-y-4">
          <Panel title="Next step" description="Advance this trip">
            <div className="space-y-2 p-4">
              {nextStatuses.length === 0 ? (
                <p className="text-[11.5px] text-slate-500">No further action on this trip.</p>
              ) : (
                nextStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() => void advance(status)}
                    className={`inline-flex h-9 w-full items-center justify-center rounded-lg text-xs font-semibold transition disabled:opacity-60 ${status === "cancelled"
                        ? "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                        : "bg-brand-700 text-white hover:bg-brand-800"
                      }`}
                  >
                    Mark as {BOOKING_STATUS_LABEL[status].toLowerCase()}
                  </button>
                ))
              )}
              {row.status === "delivered" && !proof.data && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Record proof of delivery before completing the trip.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Vehicle & driver">
            <div className="space-y-2.5 p-4 text-[11.5px]">
              <Row icon={Truck} label="Vehicle" value={row.vehicle_registration ?? "Not assigned"} />
              {row.vehicle_capacity_kg != null && (
                <Row icon={Package} label="Capacity" value={formatWeight(Number(row.vehicle_capacity_kg))} />
              )}
              <Row icon={UserRound} label="Driver" value={row.driver_name ?? "Not assigned"} />
              {row.driver_phone && <Row icon={CheckCircle2} label="Driver phone" value={row.driver_phone} />}
              {!isFinished && (
                <button
                  type="button"
                  onClick={() => {
                    setVehicleId(row.vehicle_id ?? "");
                    setDriverId(row.driver_id ?? "");
                    setError("");
                    setAssignOpen(true);
                  }}
                  className="mt-1 inline-flex h-8 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {row.vehicle_id || row.driver_id ? "Change assignment" : "Assign vehicle & driver"}
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Requester">
            <div className="p-4 text-[11.5px]">
              <p className="font-semibold text-forest">{row.requester_name ?? "Requester"}</p>
              <p className="text-slate-500">{row.requester_role ?? "Kalika account"}</p>
              <a
                href={`tel:`}
                onClick={(e) => e.preventDefault()}
                className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-500"
                title="Phone is shared through Messages, not here"
              >
                Contact via Messages
              </a>
            </div>
          </Panel>

          <Panel title="Safety & policy">
            <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600">
              <li className="flex gap-1.5">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                Never carry cargo that was not declared in the booking.
              </li>
              <li className="flex gap-1.5">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                A completed trip cannot be reopened — contact support for a dispute.
              </li>
            </ul>
          </Panel>
        </aside>
      </div>

      {/* ── Assign modal ── */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign vehicle & driver" wide>
        <div className="space-y-3">
          <Field label="Vehicle" hint="Vehicles too small or already on a trip are disabled.">
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
              <option value="">No change</option>
              {vehicleOptions.map(({ vehicle, check }) => (
                <option key={vehicle.id} value={vehicle.id} disabled={!check.ok}>
                  {vehicle.registration_no ?? vehicle.vehicle_type} · {formatWeight(Number(vehicle.capacity_kg))}
                  {check.ok ? "" : ` — ${check.reason}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Driver" hint="Drivers on a trip, on leave, or with an expired licence are disabled.">
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass}>
              <option value="">No change</option>
              {driverOptions.map(({ driver, check }) => {
                const lic = licenceState(driver);
                return (
                  <option key={driver.id} value={driver.id} disabled={!check.ok}>
                    {driver.full_name}
                    {lic.expired ? " — licence expired" : check.ok ? "" : ` — ${check.reason}`}
                  </option>
                );
              })}
            </select>
          </Field>
          {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAssignOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save assignment"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Proof modal ── */}
      <Modal
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        title="Proof of delivery"
        subtitle={row.title}
      >
        <div className="space-y-3">
          <Field label="Receiver name" required>
            <input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              className={inputClass}
              placeholder="Who received the cargo?"
              maxLength={120}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Receiver phone">
              <input
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                className={inputClass}
                inputMode="tel"
              />
            </Field>
            <Field label="Quantity received">
              <input
                value={receivedQty}
                onChange={(e) => setReceivedQty(e.target.value)}
                className={inputClass}
                placeholder="e.g. 1450 kg"
              />
            </Field>
          </div>
          <Field label="Damage notes" hint="Leave blank if the cargo arrived undamaged.">
            <textarea
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
              rows={2}
              maxLength={500}
              className={`${inputClass} resize-none`}
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={proofNotes}
              onChange={(e) => setProofNotes(e.target.value)}
              rows={2}
              maxLength={500}
              className={`${inputClass} resize-none`}
            />
          </Field>
          <Field
            label="Photo of the delivered cargo"
            hint="Optional. Goes to private storage — only you and the requester can open it."
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Paperclip className="h-3.5 w-3.5" />
                {photo ? "Change photo" : "Attach photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    setProofError("");
                    setPhoto(e.target.files?.[0] ?? null);
                  }}
                />
              </label>
              {photo && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                  {photo.name}
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Remove photo"
                    className="text-emerald-700 hover:text-emerald-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          </Field>
          <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500">
            The delivery OTP is verified by the Kalika backend and is never entered or stored in this
            form. The photo is uploaded to private storage and stored as a file reference, not a public
            link.
          </p>
          {proofError && <p className="text-[11.5px] font-semibold text-rose-600">{proofError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setProofOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleProof()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />{" "}
              {uploadingPhoto ? "Uploading photo…" : busy ? "Saving…" : "Save proof"}
            </button>
          </div>
        </div>
      </Modal>
    </TransporterLayout>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-0.5 truncate text-[12px] font-semibold text-forest">{value}</p>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-slate-600">
        <Icon className="h-3.5 w-3.5 text-slate-400" /> {label}
      </span>
      <span className="truncate font-semibold text-forest">{value}</span>
    </div>
  );
}

/** Used by the sidebar to link straight into the tracking view. */
export { TRANSPORTER_ROUTES };
