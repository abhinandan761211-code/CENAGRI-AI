import { useMemo, useState } from "react";
import { MapPin, PackageCheck, Sprout, TruckIcon } from "lucide-react";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  PROCUREMENT_STATUS_STYLE,
  createProcurement,
  formatDate,
  formatINR,
  formatQty,
  listFarmerListings,
  listProcurement,
} from "@/lib/retailer";
import type { FarmerListing, ProcurementRequest } from "@/lib/retailer";

/**
 * Buy from Farmers — direct procurement.
 *
 * The retailer buys eligible agricultural products (produce, seed grain,
 * organic manure) straight from farmer listings on the marketplace. This is
 * the one place a retailer acts like a buyer; the flow, tables and statuses
 * are retailer-specific so the two account types stay distinct.
 */
export default function RetailerProcurement() {
  const { profile } = useAuth();
  const district = profile?.details?.district ?? null;

  const listings = useRetailerData<FarmerListing[]>(() => listFarmerListings(district), [district]);
  const requests = useRetailerData<ProcurementRequest[]>(() => listProcurement(), []);

  const [tab, setTab] = useState<"market" | "requests">("market");
  const [onlyLocal, setOnlyLocal] = useState(Boolean(district));
  const [target, setTarget] = useState<FarmerListing | null>(null);

  const listingRows = listings.data ?? [];
  const requestRows = requests.data ?? [];
  const loading = listings.state === "loading" || requests.state === "loading";
  const failed = listings.state === "error" ? listings : requests.state === "error" ? requests : null;

  const visibleListings = useMemo(
    () => (onlyLocal && district ? listingRows.filter((l) => l.district === district) : listingRows),
    [listingRows, onlyLocal, district]
  );

  const openRequests = requestRows.filter(
    (r) => r.status === "requested" || r.status === "accepted" || r.status === "pickup_scheduled"
  );

  return (
    <RetailerLayout
      title="Buy from Farmers"
      subtitle={`${visibleListings.length} listings · ${openRequests.length} open requests`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
          {(
            [
              ["market", "Farmer listings"],
              ["requests", "My requests"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === key ? "bg-slate-100 text-forest" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {label}
              <span className="ml-1.5 text-[10px] text-slate-400">
                {key === "market" ? visibleListings.length : requestRows.length}
              </span>
            </button>
          ))}
        </div>

        {district && tab === "market" && (
          <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-600">
            <input
              type="checkbox"
              checked={onlyLocal}
              onChange={(e) => setOnlyLocal(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-700"
            />
            Only {district}
          </label>
        )}
      </div>

      {failed && (
        <div className="mt-4">
          <ErrorNotice message={failed.error} onRetry={() => void failed.reload()} />
        </div>
      )}

      {loading && <Loading label="Loading procurement data…" />}

      {!loading && tab === "market" && (
        <>
          {visibleListings.length === 0 ? (
            <div className="card mt-4">
              <EmptyState
                icon={Sprout}
                title="No farmer listings available"
                description="Listings posted on the marketplace appear here for direct procurement. Try turning off the local-district filter."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleListings.map((listing) => (
                <article key={listing.id} className="card flex flex-col p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-brand-700">
                    {listing.category}
                  </p>
                  <h3 className="font-display text-[15px] font-bold text-forest">{listing.title}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                    <MapPin className="h-3 w-3" />
                    {[listing.district, listing.state].filter(Boolean).join(", ") || "Location not shared"}
                  </p>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <dt className="text-slate-400">Available</dt>
                      <dd className="font-semibold text-slate-700">
                        {listing.quantity_kg != null
                          ? `${listing.quantity_kg.toLocaleString("en-IN")} kg`
                          : "Ask farmer"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Rate</dt>
                      <dd className="font-semibold text-slate-700">
                        {listing.price_inr != null
                          ? `${formatINR(listing.price_inr)} / ${listing.unit}`
                          : "Negotiable"}
                      </dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    onClick={() => setTarget(listing)}
                    className="mt-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand-700 text-[11px] font-semibold text-white transition hover:bg-brand-800"
                  >
                    <PackageCheck className="h-3 w-3" /> Request to buy
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && tab === "requests" && (
        <div className="mt-4">
          {requestRows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={TruckIcon}
                title="No procurement requests yet"
                description="Request produce directly from a farmer listing and it will be tracked here until it is received."
                action={
                  <button type="button" onClick={() => setTab("market")} className="btn-primary h-9 px-4 text-xs">
                    Browse farmer listings
                  </button>
                }
              />
            </div>
          ) : (
            <Panel title="Procurement requests" description="Offers you have sent to farmers">
              <ul className="divide-y divide-slate-100">
                {requestRows.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-forest">{request.product_name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {request.farmer_name ?? "Farmer"} · {formatQty(request.quantity_kg, "kg")} @{" "}
                        {formatINR(request.rate_inr)}/kg · total{" "}
                        {formatINR(request.quantity_kg * request.rate_inr)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Requested {formatDate(request.requested_at)}
                        {request.farmer_district ? ` · ${request.farmer_district}` : ""}
                      </p>
                    </div>
                    <Badge className={PROCUREMENT_STATUS_STYLE[request.status]}>
                      {request.status.replace("_", " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <ProcurementDialog
        listing={target}
        onClose={() => setTarget(null)}
        onCreated={(request) => {
          requests.setData([request, ...requestRows]);
          setTarget(null);
          setTab("requests");
        }}
      />
    </RetailerLayout>
  );
}

function ProcurementDialog({
  listing,
  onClose,
  onCreated,
}: {
  listing: FarmerListing | null;
  onClose: () => void;
  onCreated: (request: ProcurementRequest) => void;
}) {
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastId, setLastId] = useState<string | null>(null);
  if ((listing?.id ?? null) !== lastId) {
    setLastId(listing?.id ?? null);
    setQty(listing?.quantity_kg != null ? String(listing.quantity_kg) : "");
    setRate(listing?.price_inr != null ? String(listing.price_inr) : "");
    setNotes("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!listing) return;
    const q = Number(qty);
    const r = Number(rate);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Enter the quantity in kg.");
      return;
    }
    if (!Number.isFinite(r) || r <= 0) {
      setError("Enter your offered rate per kg.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const created = await createProcurement({
        listing_id: listing.id,
        farmer_id: listing.seller_id,
        product_name: listing.title,
        quantity_kg: q,
        rate_inr: r,
        farmer_district: listing.district,
        notes: notes.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(listing)}
      title="Request to buy"
      subtitle={listing ? `From a farmer listing · ${listing.title}` : undefined}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Quantity (kg)" required>
          <input
            type="number"
            min={1}
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Your rate (₹ per kg)" required hint="The farmer can accept or counter this.">
          <input
            type="number"
            min={0}
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Notes">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Pickup date, packing, grading…"
            className={inputClass}
          />
        </Field>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Estimated value{" "}
          <strong className="text-forest">
            {formatINR((Number(qty) || 0) * (Number(rate) || 0))}
          </strong>
          . The farmer confirms before the pickup is scheduled.
        </p>

        {error && (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary h-9 px-4 text-xs disabled:opacity-60">
            {saving ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
