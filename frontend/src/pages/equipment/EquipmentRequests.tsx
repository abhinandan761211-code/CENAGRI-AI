import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, MapPin, Search, Send, Users } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
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
  EQUIPMENT_CATEGORIES,
  createBooking,
  describeEquipmentError,
  formatDate,
  formatINR,
  listEquipment,
  listMyQuotations,
  listOpenRequests,
  quoteCost,
  sendQuotation,
  withdrawQuotation,
} from "@/lib/equipment";
import type {
  Equipment,
  EquipmentQuotation,
  RentalRequest,
} from "@/lib/equipment";
import { getPricing } from "@/lib/equipment";
import type { EquipmentPricing } from "@/lib/equipment";

/**
 * Rental Requests — work posted by farmers and other eligible accounts.
 *
 * One live quotation per machine per request. The quotation is itemised
 * (rental, operator, fuel, transport, other) so the renter sees the whole cost
 * before accepting, and the stored total is the sum of those lines.
 */
export default function EquipmentRequests() {
  const D = describeEquipmentError;

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [operatorOnly, setOperatorOnly] = useState(false);

  const requests = useWorkerData<RentalRequest[]>(
    () => listOpenRequests({ search, category, needsOperatorOnly: operatorOnly }),
    [search, category, operatorOnly],
    D
  );
  const quotations = useWorkerData<EquipmentQuotation[]>(() => listMyQuotations(), [], D);
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);

  const [target, setTarget] = useState<RentalRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestList = requests.data ?? [];
  const quotationList = quotations.data ?? [];
  const equipmentList = equipment.data ?? [];

  const quotedIds = useMemo(
    () => new Set(quotationList.filter((q) => q.status === "sent" || q.status === "accepted").map((q) => q.request_id)),
    [quotationList]
  );

  async function handleWithdraw(q: EquipmentQuotation) {
    setBusy(true);
    setError("");
    try {
      await withdrawQuotation(q.id, q.request_id);
      quotations.reload();
      requests.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  if (requests.state === "loading") {
    return (
      <EquipmentLayout title="Rental Requests">
        <Loading label="Loading rental requests…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout
      title="Rental Requests"
      subtitle="Machinery wanted by farmers, buyers and retailers"
    >
      {requests.state === "error" && <ErrorNotice message={requests.error} onRetry={requests.reload} />}
      {error && <ErrorNotice message={error} />}

      <Panel title="Find requests" description="Filter by what you can actually supply">
        <div className="grid gap-2 p-4 sm:grid-cols-3 sm:p-5">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Work type, location or renter"
              className={`${inputClass} pl-8`}
            />
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            <option value="all">All categories</option>
            {EQUIPMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
            <input
              type="checkbox"
              checked={operatorOnly}
              onChange={(e) => setOperatorOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-700"
            />
            <span className="text-[11.5px] text-slate-700">Needs an operator</span>
          </label>
        </div>
      </Panel>

      <section>
        <SectionHeading title="Open requests" hint={`${requestList.length} waiting for a quote`} />
        {requestList.length === 0 ? (
          <Panel title="Requests">
            <EmptyState
              icon={ClipboardList}
              title="No open requests right now"
              description="When a farmer needs a machine, the request appears here with the land area, dates, work type and whether an operator is required."
            />
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {requestList.map((r) => {
              const quoted = quotedIds.has(r.id);
              return (
                <article key={r.id} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13.5px] font-bold text-forest">
                        {r.category ?? "Equipment"}
                      </h3>
                      <p className="truncate text-[10.5px] text-slate-500">
                        {r.requester_name ?? "Renter"}
                        {r.requester_role ? ` · ${r.requester_role}` : ""}
                      </p>
                    </div>
                    {quoted && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Quoted
                      </span>
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <Item icon={CalendarDays} label="From" value={formatDate(r.required_from)} />
                    <Item icon={CalendarDays} label="Duration" value={`${r.duration_days} day(s)`} />
                    <Item icon={MapPin} label="Location" value={r.farm_location ?? r.district ?? "Not given"} />
                    <Item
                      icon={Users}
                      label="Operator"
                      value={r.needs_operator ? "Required" : "Not needed"}
                    />
                    {r.land_area_acres != null && (
                      <Item icon={MapPin} label="Land" value={`${r.land_area_acres} acre`} />
                    )}
                    {r.expected_budget_inr != null && (
                      <Item icon={Send} label="Budget" value={formatINR(Number(r.expected_budget_inr))} />
                    )}
                  </dl>

                  {r.work_type && (
                    <p className="mt-2 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10.5px] text-slate-600">
                      {r.work_type}
                    </p>
                  )}

                  <p className="mt-2 text-[10px] text-slate-500">
                    {equipmentList.length === 0
                      ? "Add a machine first to quote."
                      : `${equipmentList.length} machine(s) in your fleet.`}
                  </p>

                  <div className="mt-auto flex gap-2 pt-3">
                    <button
                      type="button"
                      disabled={equipmentList.length === 0}
                      onClick={() => {
                        setError("");
                        setTarget(r);
                      }}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-brand-700 text-[11.5px] font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" /> {quoted ? "Quote again" : "Send quotation"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="My quotations" hint="Sent from this account" />
        <Panel title="Quotations" description="Withdraw a live quote or follow its status">
          {quotationList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              You have not quoted any request yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {quotationList.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {q.request?.category ?? "Machine"} · {q.request?.work_type ?? "Rental"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {formatINR(Number(q.total_inr))} · sent {formatDate(q.created_at)}
                      {q.valid_until ? ` · valid till ${formatDate(q.valid_until)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${q.status === "accepted"
                        ? "bg-emerald-100 text-emerald-800"
                        : q.status === "rejected"
                          ? "bg-rose-100 text-rose-800"
                          : q.status === "withdrawn"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-sky-100 text-sky-800"
                      }`}
                  >
                    {q.status}
                  </span>
                  {q.status === "sent" && (
                    <button
                      type="button"
                      onClick={() => void handleWithdraw(q)}
                      disabled={busy}
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <Panel title="How quoting works" description="What the renter sees">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• One live quotation per machine per request — the database enforces it.</li>
          <li>• The total is the sum of rental, operator, fuel, transport and any named extra.</li>
          <li>• Accepting creates a booking; the overlap check runs before the row is saved.</li>
          <li>• A machine under maintenance for those dates cannot be quoted as available.</li>
        </ul>
      </Panel>

      {target && (
        <QuoteModal
          request={target}
          equipment={equipmentList}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null);
            quotations.reload();
            requests.reload();
          }}
        />
      )}
    </EquipmentLayout>
  );
}

/* ── Quotation modal ───────────────────────────────────────────────────── */

function QuoteModal({
  request,
  equipment,
  onClose,
  onDone,
}: {
  request: RentalRequest;
  equipment: Equipment[];
  onClose: () => void;
  onDone: () => void;
}) {
  const D = describeEquipmentError;
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");
  const [pricing, setPricing] = useState<EquipmentPricing | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);

  const [rental, setRental] = useState("");
  const [operator, setOperator] = useState("0");
  const [fuel, setFuel] = useState("0");
  const [transport, setTransport] = useState("0");
  const [other, setOther] = useState("0");
  const [otherNote, setOtherNote] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [message, setMessage] = useState("");
  const [operatorIncluded, setOperatorIncluded] = useState(request.needs_operator);
  const [fuelIncluded, setFuelIncluded] = useState(request.needs_fuel);
  const [transportIncluded, setTransportIncluded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = equipment.find((e) => e.id === equipmentId) ?? null;

  /** Load the price sheet, then pre-fill from it so the owner starts informed. */
  async function loadPricing(id: string) {
    setEquipmentId(id);
    setLoadingPricing(true);
    try {
      const row = await getPricing(id);
      setPricing(row);
      if (row) {
        const cost = quoteCost({
          pricing: row,
          days: request.duration_days,
          acres: request.land_area_acres,
          withOperator: request.needs_operator,
          withFuel: request.needs_fuel,
          withTransport: row.transport_rate_inr > 0,
        });
        setRental(String(cost.rental));
        setOperator(String(cost.operator));
        setFuel(String(cost.fuel));
        setTransport(String(cost.transport));
        setOther(String(cost.other));
        setOtherNote(cost.otherLabel ?? "");
      }
    } catch {
      setPricing(null);
    } finally {
      setLoadingPricing(false);
    }
  }

  // Prefill from the first machine's price sheet once, when the modal opens.
  useEffect(() => {
    if (equipment[0]) void loadPricing(equipment[0].id);
    // Only on mount: later changes go through the select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total =
    Number(rental || 0) + Number(operator || 0) + Number(fuel || 0) + Number(transport || 0) + Number(other || 0);

  async function handleSend() {
    if (!equipmentId) {
      setError("Choose a machine.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError("Enter the rental amount — the renter must see a price.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendQuotation({
        request_id: request.id,
        equipment_id: equipmentId,
        rental_inr: Number(rental || 0),
        operator_inr: Number(operator || 0),
        fuel_inr: Number(fuel || 0),
        transport_inr: Number(transport || 0),
        other_inr: Number(other || 0),
        other_note: otherNote.trim() || null,
        operator_included: operatorIncluded,
        fuel_included: fuelIncluded,
        transport_included: transportIncluded,
        valid_until: validUntil || null,
        message: message.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  /** Accept the request directly and create the booking in one step. */
  async function handleAcceptNow() {
    if (!equipmentId) {
      setError("Choose a machine.");
      return;
    }
    const end = new Date(`${request.required_from}T00:00:00`);
    end.setDate(end.getDate() + Math.max(request.duration_days - 1, 0));

    setBusy(true);
    setError("");
    try {
      await createBooking({
        equipment_id: equipmentId,
        renter_id: request.requester_id,
        renter_name: request.requester_name,
        request_id: request.id,
        starts_on: request.required_from,
        ends_on: end.toISOString().slice(0, 10),
        farm_location: request.farm_location,
        work_type: request.work_type,
        land_area_acres: request.land_area_acres,
        agreed_price_inr: total,
        operator_included: operatorIncluded,
        fuel_included: fuelIncluded,
        transport_included: transportIncluded,
      });
      onDone();
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
      title={`Quote — ${request.category ?? "machine"}`}
      subtitle={`${formatDate(request.required_from)} · ${request.duration_days} day(s)${request.land_area_acres ? ` · ${request.land_area_acres} acre` : ""}`}
    >
      <div className="space-y-3">
        <Field label="Machine" required hint="Each machine can hold one quotation per request.">
          <select value={equipmentId} onChange={(e) => void loadPricing(e.target.value)} className={inputClass}>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} — {e.category}
              </option>
            ))}
          </select>
        </Field>

        {loadingPricing && <p className="text-[11px] text-slate-500">Loading this machine's price sheet…</p>}
        {!loadingPricing && !pricing && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] text-amber-900">
            This machine has no price sheet yet. Enter the amounts yourself, or set a price sheet on the
            machine first.
          </p>
        )}
        {selected?.status === "maintenance" && (
          <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-[10.5px] text-rose-800">
            {selected.title} is marked under maintenance. A booking will be refused if those dates are
            blocked.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rental (₹)" required>
            <input value={rental} onChange={(e) => setRental(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Operator (₹)">
            <input value={operator} onChange={(e) => setOperator(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Fuel (₹)">
            <input value={fuel} onChange={(e) => setFuel(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Transportation (₹)">
            <input value={transport} onChange={(e) => setTransport(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Other service (₹)">
            <input value={other} onChange={(e) => setOther(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="What is that for?">
            <input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} className={inputClass} maxLength={80} />
          </Field>
        </div>

        <div className="space-y-1.5">
          <Check label="Operator included in this price" checked={operatorIncluded} onChange={setOperatorIncluded} />
          <Check label="Fuel included in this price" checked={fuelIncluded} onChange={setFuelIncluded} />
          <Check label="Transportation included in this price" checked={transportIncluded} onChange={setTransportIncluded} />
        </div>

        <Field label="Quotation valid until" hint="Optional. After this date the renter cannot accept it.">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Message to the renter">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={1000}
            className={`${inputClass} resize-none`}
            placeholder="Attachment included, gate timings, what the renter must arrange."
          />
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Price breakdown</p>
          <dl className="mt-1.5 space-y-1 text-[11.5px]">
            <Line label="Rental" value={formatINR(Number(rental || 0))} />
            {Number(operator || 0) > 0 && <Line label="Operator" value={formatINR(Number(operator))} />}
            {Number(fuel || 0) > 0 && <Line label="Fuel" value={formatINR(Number(fuel))} />}
            {Number(transport || 0) > 0 && <Line label="Transportation" value={formatINR(Number(transport))} />}
            {Number(other || 0) > 0 && <Line label={otherNote || "Other"} value={formatINR(Number(other))} />}
            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-[12.5px] font-bold text-forest">
              <span>Total</span>
              <span>{formatINR(total)}</span>
            </div>
          </dl>
        </div>

        {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleAcceptNow()}
            disabled={busy || !equipmentId}
            className="inline-flex h-9 items-center rounded-lg border border-brand-300 bg-white px-3.5 text-xs font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-50"
          >
            Accept and book now
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={busy || !equipmentId}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Send quotation"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-700"
      />
      <span className="text-[11px] text-slate-700">{label}</span>
    </label>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-forest">{value}</span>
    </div>
  );
}

function Item({
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
      <dt className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="truncate font-semibold text-forest">{value}</dd>
    </div>
  );
}
