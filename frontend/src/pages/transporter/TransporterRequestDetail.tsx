import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CircleDot,
  Clock,
  Flag,
  Info,
  MapPin,
  Package,
  Send,
  ShieldCheck,
  Truck,
  Weight,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { VerificationBadge } from "@/components/transporter/ui";
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
  REPORT_REASONS,
  describeTransporterError,
  fileReport,
  formatDate,
  formatINR,
  formatTime,
  formatWeight,
  getTransportRequest,
  listDrivers,
  listFleet,
  listMyOffers,
  submitOffer,
  updateOffer,
  withdrawOffer,
} from "@/lib/transporter";
import type {
  Driver,
  FleetVehicle,
  ReportReason,
  TransportOffer,
  TransportRequest,
} from "@/lib/transporter";

/**
 * One transport request, with the quoting flow.
 *
 * A transporter may send one live quote per request. That limit is enforced in
 * three places — the button state, an explicit check here, and a unique
 * constraint in the database — so a duplicate cannot be created from any
 * direction.
 */
export default function TransporterRequestDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const D = describeTransporterError;

  const request = useWorkerData<TransportRequest | null>(() => getTransportRequest(id), [id], D);
  const offers = useWorkerData<TransportOffer[]>(() => listMyOffers(), [], D);
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);
  const drivers = useWorkerData<Driver[]>(() => listDrivers(), [], D);

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const [reportReason, setReportReason] = useState<ReportReason>(REPORT_REASONS[0].value);
  const [reportDetails, setReportDetails] = useState("");
  const [reportOk, setReportOk] = useState(false);
  const [reportError, setReportError] = useState("");

  const existing = useMemo(
    () => (offers.data ?? []).find((o) => o.request_id === id && o.status !== "withdrawn"),
    [offers.data, id]
  );

  const row = request.data;

  function openQuote(prefill: number | null) {
    setPrice(prefill != null ? String(prefill) : "");
    setEta("");
    setVehicleId("");
    setDriverId("");
    setMessage("");
    setError("");
    setQuoteOpen(true);
  }

  async function handleSubmitQuote() {
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the price you are quoting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (existing) {
        await updateOffer(existing.id, {
          price_inr: amount,
          eta_hours: eta === "" ? null : Number(eta),
          vehicle_id: vehicleId || null,
          driver_id: driverId || null,
          message: message.trim() || null,
        });
      } else {
        await submitOffer(id, {
          price_inr: amount,
          eta_hours: eta === "" ? null : Number(eta),
          vehicle_id: vehicleId || null,
          driver_id: driverId || null,
          message: message.trim() || null,
        });
      }
      setSent(true);
      setQuoteOpen(false);
      offers.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReport() {
    setBusy(true);
    setReportError("");
    try {
      await fileReport({
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      setReportOpen(false);
      setReportDetails("");
      setReportOk(true);
    } catch (err) {
      setReportError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    if (!existing) return;
    setBusy(true);
    setError("");
    try {
      await withdrawOffer(existing.id);
      offers.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  if (request.state === "loading") {
    return (
      <TransporterLayout title="Transport request">
        <Loading label="Loading request…" />
      </TransporterLayout>
    );
  }

  if (request.state === "error") {
    return (
      <TransporterLayout title="Transport request">
        <ErrorNotice message={request.error} onRetry={request.reload} />
      </TransporterLayout>
    );
  }

  if (!row) {
    return (
      <TransporterLayout title="Request not found">
        <div className="card">
          <EmptyState
            icon={Package}
            title="This request is no longer open"
            description="It may have been assigned to another transporter, cancelled, or expired."
            action={
              <button
                type="button"
                onClick={() => navigate(TRANSPORTER_ROUTES.requests)}
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Browse other requests
              </button>
            }
          />
        </div>
      </TransporterLayout>
    );
  }

  const weight = Number(row.weight_kg ?? row.load_kg ?? 0);
  const isClosed = row.status !== "open";

  return (
    <TransporterLayout
      title={row.title ?? `${row.pickup} → ${row.dropoff}`}
      subtitle={`${row.cargo_type ?? "Cargo"}${row.commodity ? ` · ${row.commodity}` : ""}`}
      action={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      }
    >
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
                      {[row.pickup_district, row.pickup_state].filter(Boolean).join(", ") || "District not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination</p>
                    <p className="text-[13px] font-semibold text-forest">{row.dropoff}</p>
                    <p className="text-[11px] text-slate-500">
                      {[row.dropoff_district, row.dropoff_state].filter(Boolean).join(", ") || "District not set"}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
                <Cell label="Distance" value={row.distance_km != null ? `${row.distance_km} km` : "Not provided"} icon={MapPin} />
                <Cell label="Weight" value={formatWeight(weight || null)} icon={Weight} />
                <Cell label="Pickup date" value={row.pickup_on ? formatDate(row.pickup_on) : "Flexible"} icon={CalendarDays} />
                <Cell label="Pickup time" value={row.pickup_time ? formatTime(row.pickup_time) : "—"} icon={Clock} />
              </dl>
            </div>
          </Panel>

          <Panel title="Cargo & requirements">
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <Cell label="Cargo type" value={row.cargo_type ?? "—"} icon={Package} />
              <Cell label="Commodity" value={row.commodity ?? "—"} icon={Package} />
              <Cell label="Quantity" value={row.quantity ?? formatWeight(weight || null)} icon={Weight} />
              <Cell label="Vehicle needed" value={row.vehicle_type ?? "Any suitable"} icon={Truck} />
              <Cell
                label="Min. capacity"
                value={row.min_capacity_kg ? formatWeight(Number(row.min_capacity_kg)) : "—"}
                icon={Truck}
              />
              <Cell
                label="Helping hands"
                value={[
                  row.needs_loading_help ? "Loading" : null,
                  row.needs_unloading_help ? "Unloading" : null,
                ]
                  .filter(Boolean)
                  .join(" + ") || "No help needed"}
                icon={Info}
              />
              {row.notes && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</p>
                  <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-700">
                    {row.notes}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Safety" description="Before you accept any transport work">
            <ul className="space-y-2 p-4 text-[12px] leading-relaxed text-slate-600 sm:p-5">
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Confirm the exact pickup address and cargo weight before you start.
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Agree who loads and unloads, and whether it is included in the price.
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                Never transport cargo that is not declared here.
              </li>
            </ul>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Requester">
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest text-sm font-bold text-white">
                  {(row.requester_name ?? "R").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-forest">
                    {row.requester_name ?? "Requester"}
                  </p>
                  <p className="text-[11px] text-slate-500">{row.requester_role ?? "Kalika account"}</p>
                </div>
              </div>
              <div className="mt-3">
                {row.requester_verified ? (
                  <VerificationBadge verification="verified" />
                ) : (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    This requester is not verified yet. Take normal precautions.
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <div className="card p-4 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {row.price_type === "fixed" ? "Fixed price" : "Offered price"}
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-forest">
              {row.offered_price_inr != null ? formatINR(Number(row.offered_price_inr)) : "Open to quotes"}
            </p>
            {row.expires_on && (
              <p className="mt-1 text-[11px] text-slate-500">Expires {formatDate(row.expires_on)}</p>
            )}

            {sent && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800">
                Quote sent. The requester will review it.
              </p>
            )}

            {existing ? (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-blue-700">
                  Your quote
                </p>
                <p className="mt-0.5 text-[14px] font-extrabold text-blue-900">
                  {formatINR(Number(existing.price_inr))}
                </p>
                <p className="text-[10.5px] font-semibold capitalize text-blue-700">{existing.status}</p>
                {existing.status === "pending" && (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openQuote(Number(existing.price_inr))}
                      className="inline-flex h-7 items-center rounded-md bg-white px-2 text-[10.5px] font-bold text-blue-800 hover:bg-blue-100"
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleWithdraw()}
                      disabled={busy}
                      className="inline-flex h-7 items-center rounded-md px-2 text-[10.5px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                    >
                      Withdraw
                    </button>
                  </div>
                )}
              </div>
            ) : isClosed ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] font-semibold text-slate-600">
                This request is {row.status} and no longer accepting quotes.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => openQuote(row.offered_price_inr != null ? Number(row.offered_price_inr) : null)}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800"
              >
                <Send className="h-4 w-4" />
                {row.price_type === "fixed" ? "Accept this price" : "Send a quote"}
              </button>
            )}

            {error && <p className="mt-2 text-[11px] font-semibold text-rose-600">{error}</p>}

            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-rose-600"
            >
              <Flag className="h-3.5 w-3.5" /> Report suspicious request
            </button>
            {reportOk && (
              <p className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800">
                Thanks — our team will review this request.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* ── Quote modal ── */}
      <Modal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        title={row.price_type === "fixed" ? "Accept this price" : "Send a quote"}
        subtitle={row.title ?? `${row.pickup} → ${row.dropoff}`}
      >
        <div className="space-y-3">
          <Field label="Your price (₹)" required hint="Include loading/unloading if you are covering it.">
            <input
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClass}
              placeholder="e.g. 8500"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estimated hours" hint="Optional">
              <input
                type="number"
                min={0}
                step="0.5"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                className={inputClass}
                placeholder="e.g. 6"
              />
            </Field>
            <Field label="Vehicle" hint="Optional">
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className={inputClass}
              >
                <option value="">Assign later</option>
                {(fleet.data ?? [])
                  .filter((v) => v.available && !v.is_archived)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration_no ?? v.vehicle_type ?? "Vehicle"} · {Number(v.capacity_kg) / 1000} t
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field label="Driver" hint="Optional — you can assign after acceptance.">
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass}>
              <option value="">Assign later</option>
              {(drivers.data ?? [])
                .filter((d) => d.status === "available" || d.status === "on_trip")
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Message to requester" hint="Optional">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
              className={`${inputClass} resize-none`}
              placeholder="e.g. I can pick up on Monday morning from your farm gate."
            />
          </Field>
          {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setQuoteOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitQuote()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {busy ? "Sending…" : existing ? "Update quote" : "Send quote"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Report modal ── */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this request">
        <div className="space-y-3">
          <Field label="What is wrong?">
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value as ReportReason)}
              className={inputClass}
            >
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Details" hint="Optional, but it helps the team act faster.">
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              maxLength={1000}
              className={`${inputClass} resize-none`}
              placeholder="What happened?"
            />
          </Field>
          <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500">
            Your account is attached to the report. The requester is not told who reported them, and
            reports are reviewed by the Kalika team.
          </p>
          {reportError && <p className="text-[11.5px] font-semibold text-rose-600">{reportError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleReport()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              <Flag className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Report"}
            </button>
          </div>
        </div>
      </Modal>
    </TransporterLayout>
  );
}

function Cell({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof MapPin;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 p-2.5">
      <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12.5px] font-semibold text-forest">{value}</dd>
    </div>
  );
}
