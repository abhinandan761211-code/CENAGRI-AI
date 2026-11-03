import { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Filter,
  Package,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { RequestCard, RequestGrid } from "@/components/transporter/ui";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  CARGO_TYPES,
  VEHICLE_TYPES,
  describeTransporterError,
  formatINR,
  formatWeight,
  listTransportRequests,
  offeredRequestIds,
} from "@/lib/transporter";
import type { CargoType, TransportRequest, VehicleType } from "@/lib/transporter";

/**
 * Find Transport Requests.
 *
 * Browse work posted by farmers, buyers, retailers and warehouses. Distance and
 * price are shown exactly as the requester supplied them — an unknown distance
 * renders "n/a" rather than a guessed number.
 */
export default function TransporterRequests() {
  const D = describeTransporterError;

  const [search, setSearch] = useState("");
  const [cargoType, setCargoType] = useState<CargoType | "all">("all");
  const [vehicleType, setVehicleType] = useState<VehicleType | "all">("all");
  const [pickupDistrict, setPickupDistrict] = useState("all");
  const [dropoffDistrict, setDropoffDistrict] = useState("all");
  const [minWeight, setMinWeight] = useState<number | null>(null);
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [pickupFrom, setPickupFrom] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const requests = useWorkerData<TransportRequest[]>(() => listTransportRequests({}), [], D);
  const offers = useWorkerData<Set<string>>(() => offeredRequestIds(), [], D);

  const all = requests.data ?? [];
  const quoted = offers.data ?? new Set<string>();

  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const r of all) {
      if (r.pickup_district) set.add(r.pickup_district);
      if (r.dropoff_district) set.add(r.dropoff_district);
    }
    return Array.from(set).sort();
  }, [all]);

  const filtered = useMemo(() => {
    let rows = all;
    if (cargoType !== "all") rows = rows.filter((r) => r.cargo_type === cargoType);
    if (vehicleType !== "all") rows = rows.filter((r) => r.vehicle_type === vehicleType);
    if (pickupDistrict !== "all") rows = rows.filter((r) => r.pickup_district === pickupDistrict);
    if (dropoffDistrict !== "all") rows = rows.filter((r) => r.dropoff_district === dropoffDistrict);
    if (minWeight != null) {
      rows = rows.filter((r) => Number(r.weight_kg ?? r.load_kg ?? 0) >= minWeight);
    }
    if (maxDistance != null) {
      rows = rows.filter((r) => r.distance_km != null && Number(r.distance_km) <= maxDistance);
    }
    if (maxPrice != null) {
      rows = rows.filter(
        (r) => r.offered_price_inr != null && Number(r.offered_price_inr) <= maxPrice
      );
    }
    if (pickupFrom) rows = rows.filter((r) => !r.pickup_on || r.pickup_on >= pickupFrom);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.title ?? "").toLowerCase().includes(q) ||
          (r.commodity ?? "").toLowerCase().includes(q) ||
          r.pickup.toLowerCase().includes(q) ||
          r.dropoff.toLowerCase().includes(q) ||
          (r.requester_name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [all, cargoType, vehicleType, pickupDistrict, dropoffDistrict, minWeight, maxDistance, maxPrice, pickupFrom, search]);

  function reset() {
    setSearch("");
    setCargoType("all");
    setVehicleType("all");
    setPickupDistrict("all");
    setDropoffDistrict("all");
    setMinWeight(null);
    setMaxDistance(null);
    setMaxPrice(null);
    setPickupFrom("");
  }

  const activeCount = [
    cargoType !== "all",
    vehicleType !== "all",
    pickupDistrict !== "all",
    dropoffDistrict !== "all",
    minWeight != null,
    maxDistance != null,
    maxPrice != null,
    Boolean(pickupFrom),
  ].filter(Boolean).length;

  return (
    <TransporterLayout
      title="Find Transport Requests"
      subtitle={`${filtered.length} request${filtered.length === 1 ? "" : "s"} open for quoting`}
      action={
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-700 px-1.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by route, commodity or requester…"
          aria-label="Search transport requests"
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-brand-500"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
          <Panel
            title="Filters"
            action={
              <button type="button" onClick={reset} className="text-[11px] font-bold text-brand-700 hover:underline">
                Reset
              </button>
            }
          >
            <div className="space-y-4 p-4">
              <Block label="Cargo type">
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={cargoType === "all"} onClick={() => setCargoType("all")}>
                    All
                  </Chip>
                  {CARGO_TYPES.map((c) => (
                    <Chip key={c} active={cargoType === c} onClick={() => setCargoType(c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </Block>

              <Block label="Vehicle type">
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={vehicleType === "all"} onClick={() => setVehicleType("all")}>
                    All
                  </Chip>
                  {VEHICLE_TYPES.map((v) => (
                    <Chip key={v} active={vehicleType === v} onClick={() => setVehicleType(v)}>
                      {v}
                    </Chip>
                  ))}
                </div>
              </Block>

              <Block label="Pickup district">
                <Select value={pickupDistrict} onChange={setPickupDistrict} options={districts} label="Pickup district" />
              </Block>

              <Block label="Destination district">
                <Select value={dropoffDistrict} onChange={setDropoffDistrict} options={districts} label="Destination district" />
              </Block>

              <Block label="Minimum weight">
                <div className="flex flex-wrap gap-1.5">
                  {[null, 500, 1000, 5000, 10000].map((w) => (
                    <Chip key={String(w)} active={minWeight === w} onClick={() => setMinWeight(w)}>
                      {w == null ? "Any" : `≥ ${formatWeight(w)}`}
                    </Chip>
                  ))}
                </div>
              </Block>

              <Block label="Maximum distance">
                <div className="flex flex-wrap gap-1.5">
                  {[null, 25, 50, 150, 300].map((d) => (
                    <Chip key={String(d)} active={maxDistance === d} onClick={() => setMaxDistance(d)}>
                      {d == null ? "Any" : `≤ ${d} km`}
                    </Chip>
                  ))}
                </div>
              </Block>

              <Block label="Maximum price">
                <div className="flex flex-wrap gap-1.5">
                  {[null, 5000, 10000, 20000, 50000].map((p) => (
                    <Chip key={String(p)} active={maxPrice === p} onClick={() => setMaxPrice(p)}>
                      {p == null ? "Any" : `≤ ${formatINR(p)}`}
                    </Chip>
                  ))}
                </div>
              </Block>

              <Block label="Pickup from">
                <input
                  type="date"
                  value={pickupFrom}
                  onChange={(e) => setPickupFrom(e.target.value)}
                  aria-label="Pickup from date"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-brand-500"
                />
              </Block>
            </div>
          </Panel>
        </aside>

        <section>
          {requests.state === "loading" && <Loading label="Loading transport requests…" />}
          {requests.state === "error" && <ErrorNotice message={requests.error} onRetry={requests.reload} />}

          {requests.state === "ready" && filtered.length === 0 && (
            <div className="card">
              <EmptyState
                icon={Package}
                title={all.length === 0 ? "No open requests right now" : "No requests match these filters"}
                description={
                  all.length === 0
                    ? "When a farmer or buyer needs cargo moved, their request appears here with route, weight and offered price."
                    : "Try widening the distance or price range, or clear the filters."
                }
                action={
                  all.length > 0 ? (
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            </div>
          )}

          {requests.state === "ready" && filtered.length > 0 && (
            <RequestGrid>
              {filtered.map((request) => (
                <RequestCard key={request.id} request={request} offered={quoted.has(request.id)} />
              ))}
            </RequestGrid>
          )}

          {requests.state === "ready" && offers.state === "ready" && quoted.size > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
              <ArrowRight className="h-3.5 w-3.5" />
              You already have a live quote on {quoted.size} request{quoted.size === 1 ? "" : "s"}. See{" "}
              <Link to={TRANSPORTER_ROUTES.bookings} className="font-bold text-brand-700 hover:underline">
                My Bookings
              </Link>
              .
            </p>
          )}
        </section>
      </div>
    </TransporterLayout>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
        <Filter className="h-3 w-3" /> {label}
      </p>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition ${active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800"
        }`}
    >
      {children}
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white px-2.5 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-brand-500"
      >
        <option value="all">All districts</option>
        {options.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
