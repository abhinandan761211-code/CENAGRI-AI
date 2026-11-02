import { useMemo, useState } from "react";
import {
  CalendarDays,
  Inbox,
  MapPin,
  Package,
  Search,
  Send,
  Thermometer,
  Weight,
} from "lucide-react";
import WarehouseLayout, { WAREHOUSE_ROUTES } from "@/components/warehouse/WarehouseLayout";
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
  WAREHOUSE_TYPES,
  WAREHOUSE_TYPE_LABEL,
  BOOKING_STATUS_LABEL,
  canAccommodate,
  createBooking,
  describeWarehouseError,
  formatDate,
  formatINR,
  formatWeight,
  listCapacity,
  listMyQuotations,
  listOpenStorageRequests,
  listSections,
  quotedRequestIds,
  quoteCost,
  sendQuotation,
  withdrawQuotation,
} from "@/lib/warehouse";
import type {
  StoragePricingPlan,
  StorageQuotation,
  StorageRequest,
  WarehouseCapacity,
  WarehouseSection,
} from "@/lib/warehouse";
import { useWorkerData as useData } from "@/hooks/useWorkerData";
import { listPricingPlans } from "@/lib/warehouse";

/**
 * Storage Requests — work posted by farmers, buyers, retailers and traders.
 *
 * An owner can quote each request once per warehouse. The quotation is fully
 * itemised (storage, loading, unloading, handling, anything else) so the
 * customer sees the whole cost before accepting — no fee can appear later.
 */
export default function WarehouseRequests() {
  const D = describeWarehouseError;

  const [search, setSearch] = useState("");
  const [storageType, setStorageType] = useState<string>("all");
  const [district, setDistrict] = useState<string>("all");

  const requests = useWorkerData<StorageRequest[]>(
    () => listOpenStorageRequests({ search, storageType, district }),
    [search, storageType, district],
    D
  );
  const quotations = useWorkerData<StorageQuotation[]>(() => listMyQuotations(), [], D);
  const quoted = useWorkerData<Set<string>>(() => quotedRequestIds(), [], D);
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);
  const plans = useData<StoragePricingPlan[]>(() => listPricingPlans(), [], D);

  const [quoteTarget, setQuoteTarget] = useState<StorageRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestList = requests.data ?? [];
  const quotationList = quotations.data ?? [];
  const quotedIds = quoted.data ?? new Set<string>();
  const capacityList = capacity.data ?? [];
  const planList = plans.data ?? [];

  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const r of requestList) if (r.preferred_district) set.add(r.preferred_district);
    return [...set].sort();
  }, [requestList]);

  async function handleWithdraw(q: StorageQuotation) {
    setBusy(true);
    setError("");
    try {
      await withdrawQuotation(q.id, q.request_id);
      quotations.reload();
      quoted.reload();
      requests.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptRequest(req: StorageRequest, warehouseId: string) {
    setBusy(true);
    setError("");
    try {
      await createBooking({
        warehouse_id: warehouseId,
        farmer_id: req.requester_id,
        request_id: req.id,
        quantity_kg: Number(req.quantity_kg),
        starts_on: req.starts_on,
        ends_on: req.expected_release ?? req.starts_on,
        depositor_name: req.requester_name,
        depositor_role: req.requester_role,
        crop_name: req.crop_name,
        variety: req.variety,
      });
      setQuoteTarget(null);
      requests.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  if (requests.state === "loading") {
    return (
      <WarehouseLayout title="Storage Requests">
        <Loading label="Loading storage requests…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Storage Requests"
      subtitle="Requirements posted by farmers, buyers and traders"
    >
      {requests.state === "error" && <ErrorNotice message={requests.error} onRetry={requests.reload} />}
      {error && <ErrorNotice message={error} />}

      {/* ── Filters ── */}
      <Panel title="Find requests" description="Filter by what you can actually store">
        <div className="grid gap-2 p-4 sm:grid-cols-3 sm:p-5">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Crop, variety or depositor"
              className={`${inputClass} pl-8`}
            />
          </label>
          <select value={storageType} onChange={(e) => setStorageType(e.target.value)} className={inputClass}>
            <option value="all">All storage types</option>
            {WAREHOUSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {WAREHOUSE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass}>
            <option value="all">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      {/* ── Requests ── */}
      <section>
        <SectionHeading title="Open requests" hint={`${requestList.length} available to quote`} />
        {requestList.length === 0 ? (
          <Panel title="Requests">
            <EmptyState
              icon={Inbox}
              title="No open requests right now"
              description="When a farmer or trader needs space, their requirement appears here. Listing your warehouse and keeping capacity accurate is what brings requests in."
            />
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {requestList.map((r) => {
              const alreadyQuoted = quotedIds.has(r.id);
              const fit = capacityList.filter((c) => canAccommodate(c, Number(r.quantity_kg)).ok);
              return (
                <article key={r.id} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13.5px] font-bold text-forest">
                        {r.crop_name}
                        {r.variety ? <span className="font-medium text-slate-500"> · {r.variety}</span> : null}
                      </h3>
                      <p className="text-[10.5px] text-slate-500">
                        {r.requester_name ?? "Depositor"}
                        {r.requester_role ? ` · ${r.requester_role}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {WAREHOUSE_TYPE_LABEL[r.storage_type]}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <Item icon={Weight} label="Quantity" value={formatWeight(Number(r.quantity_kg))} />
                    <Item icon={CalendarDays} label="From" value={formatDate(r.starts_on)} />
                    <Item icon={CalendarDays} label="Duration" value={`${r.duration_days} days`} />
                    <Item
                      icon={MapPin}
                      label="District"
                      value={r.preferred_district ?? "Anywhere"}
                    />
                    {r.temp_required_c != null && (
                      <Item icon={Thermometer} label="Temp" value={`${r.temp_required_c} °C`} />
                    )}
                    <Item
                      icon={Package}
                      label="Release by"
                      value={r.expected_release ? formatDate(r.expected_release) : "Open"}
                    />
                  </dl>

                  {r.notes && (
                    <p className="mt-2 line-clamp-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10.5px] text-slate-600">
                      {r.notes}
                    </p>
                  )}

                  <p className="mt-2 text-[10px] text-slate-500">
                    {fit.length > 0
                      ? `${fit.length} of your warehouse(s) can take this.`
                      : "None of your warehouses has enough free capacity."}
                  </p>

                  <div className="mt-auto flex gap-2 pt-3">
                    {alreadyQuoted ? (
                      <span className="inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-emerald-50 text-[11px] font-semibold text-emerald-800">
                        Quotation sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={fit.length === 0}
                        onClick={() => {
                          setError("");
                          setQuoteTarget(r);
                        }}
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-brand-700 text-[11.5px] font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" /> Send quotation
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── My quotations ── */}
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
                      {q.request?.crop_name ?? "Request"} · {formatWeight(Number(q.request?.quantity_kg ?? 0))}
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

      <Panel title="How quoting works" description="What the customer sees">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• One live quotation per warehouse per request — the database enforces it.</li>
          <li>• The quoted total is the sum of every item you enter. Nothing is added on top later.</li>
          <li>• Accepting a request creates a booking and reserves capacity at once when confirmed.</li>
          <li>• A request you have quoted stays yours until you withdraw it or the customer decides.</li>
        </ul>
      </Panel>

      {quoteTarget && (
        <QuoteModal
          request={quoteTarget}
          warehouses={capacityList}
          plans={planList}
          busy={busy}
          error={error}
          onClose={() => setQuoteTarget(null)}
          onAccept={(warehouseId) => void handleAcceptRequest(quoteTarget, warehouseId)}
          onSent={() => {
            setQuoteTarget(null);
            quotations.reload();
            quoted.reload();
            requests.reload();
          }}
        />
      )}
    </WarehouseLayout>
  );
}

/* ── Quotation modal ───────────────────────────────────────────────────── */

function QuoteModal({
  request,
  warehouses,
  plans,
  busy,
  error,
  onClose,
  onAccept,
  onSent,
}: {
  request: StorageRequest;
  warehouses: WarehouseCapacity[];
  plans: StoragePricingPlan[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onAccept: (warehouseId: string) => void;
  onSent: () => void;
}) {
  const D = describeWarehouseError;
  const eligible = warehouses.filter((w) => canAccommodate(w, Number(request.quantity_kg)).ok);

  const [warehouseId, setWarehouseId] = useState(eligible[0]?.id ?? "");
  const [sectionId, setSectionId] = useState("");
  const [storagePrice, setStoragePrice] = useState("");
  const [loadingPrice, setLoadingPrice] = useState("");
  const [unloadingPrice, setUnloadingPrice] = useState("");
  const [handlingPrice, setHandlingPrice] = useState("");
  const [otherPrice, setOtherPrice] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  const sections = useWorkerData<WarehouseSection[]>(
    () => (warehouseId ? listSections(warehouseId) : Promise.resolve([])),
    [warehouseId],
    D
  );

  const matchingPlan = plans.find(
    (p) => p.warehouse_id === warehouseId && p.is_active
  );

  /** Suggested price from the plan, so the owner does not start from zero. */
  const suggested = useMemo(() => {
    if (!matchingPlan) return null;
    return quoteCost({
      plan: matchingPlan,
      quantityKg: Number(request.quantity_kg),
      days: request.duration_days,
      isCold: request.storage_type === "cold" || request.storage_type === "fruit_veg",
    });
  }, [matchingPlan, request]);

  const total =
    Number(storagePrice || 0) +
    Number(loadingPrice || 0) +
    Number(unloadingPrice || 0) +
    Number(handlingPrice || 0) +
    Number(otherPrice || 0);

  async function handleSend() {
    if (!warehouseId) {
      setLocalError("Choose a warehouse.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setLocalError("Enter the storage charge — the customer must see a price.");
      return;
    }
    setSaving(true);
    setLocalError("");
    try {
      await sendQuotation({
        request_id: request.id,
        warehouse_id: warehouseId,
        section_id: sectionId || null,
        storage_price_inr: Number(storagePrice || 0),
        loading_price_inr: Number(loadingPrice || 0),
        unloading_price_inr: Number(unloadingPrice || 0),
        handling_price_inr: Number(handlingPrice || 0),
        other_price_inr: Number(otherPrice || 0),
        other_price_note: otherNote.trim() || null,
        valid_until: validUntil || null,
        message: message.trim() || null,
      });
      onSent();
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
      title={`Quote for ${request.crop_name}`}
      subtitle={`${formatWeight(Number(request.quantity_kg))} · ${request.duration_days} days · from ${formatDate(request.starts_on)}`}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Warehouse" required hint="Only warehouses with enough free capacity are listed.">
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
              {eligible.length === 0 && <option value="">No eligible warehouse</option>}
              {eligible.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {formatWeight(w.available_kg)} free
                </option>
              ))}
            </select>
          </Field>
          <Field label="Storage section" hint="Optional. Choose the area that matches the commodity.">
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={inputClass}>
              <option value="">Not specified</option>
              {(sections.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.commodity_category}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {suggested && (
          <p className="rounded-lg bg-brand-50 px-2.5 py-2 text-[11px] text-brand-900">
            Your active plan suggests <strong>{formatINR(suggested.total)}</strong> for{" "}
            {suggested.billableDays} billable days at the stated rate.
            <button
              type="button"
              onClick={() => {
                setStoragePrice(String(suggested.storage));
                setLoadingPrice(String(suggested.loading));
                setUnloadingPrice(String(suggested.unloading));
                setHandlingPrice(String(suggested.handling));
                setOtherPrice(String(suggested.other));
                setOtherNote(suggested.otherLabel ?? "");
              }}
              className="ml-1 font-bold underline"
            >
              Use this breakdown
            </button>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Storage charge (₹)" required>
            <input value={storagePrice} onChange={(e) => setStoragePrice(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Loading charge (₹)">
            <input value={loadingPrice} onChange={(e) => setLoadingPrice(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Unloading charge (₹)">
            <input value={unloadingPrice} onChange={(e) => setUnloadingPrice(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Handling charge (₹)">
            <input value={handlingPrice} onChange={(e) => setHandlingPrice(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Other disclosed service (₹)">
            <input value={otherPrice} onChange={(e) => setOtherPrice(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="What is that for?">
            <input
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              className={inputClass}
              placeholder="e.g. fumigation, grading"
              maxLength={80}
            />
          </Field>
        </div>

        <Field label="Quotation valid until" hint="Optional. After this date the customer cannot accept it.">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Message to the depositor">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={1000}
            className={`${inputClass} resize-none`}
            placeholder="Handling notes, gate timings, documents to bring."
          />
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cost breakdown</p>
          <dl className="mt-1.5 space-y-1 text-[11.5px]">
            <Row label="Storage" value={formatINR(Number(storagePrice || 0))} />
            {Number(loadingPrice || 0) > 0 && <Row label="Loading" value={formatINR(Number(loadingPrice))} />}
            {Number(unloadingPrice || 0) > 0 && <Row label="Unloading" value={formatINR(Number(unloadingPrice))} />}
            {Number(handlingPrice || 0) > 0 && <Row label="Handling" value={formatINR(Number(handlingPrice))} />}
            {Number(otherPrice || 0) > 0 && (
              <Row label={otherNote || "Other service"} value={formatINR(Number(otherPrice))} />
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-[12.5px] font-bold text-forest">
              <span>Total</span>
              <span>{formatINR(total)}</span>
            </div>
          </dl>
        </div>

        {(localError || error) && (
          <p className="text-[11.5px] font-semibold text-rose-600">{localError || error}</p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onAccept(warehouseId)}
            disabled={busy || !warehouseId}
            className="inline-flex h-9 items-center rounded-lg border border-brand-300 bg-white px-3.5 text-xs font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-50"
          >
            Accept without quoting
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={saving || busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" /> {saving ? "Sending…" : "Send quotation"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
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
  icon: typeof Weight;
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
