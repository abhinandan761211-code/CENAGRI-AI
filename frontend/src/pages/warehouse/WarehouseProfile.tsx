import { useMemo } from "react";
import { Boxes, IndianRupee, Store, Warehouse as WarehouseIcon } from "lucide-react";
import { Link } from "react-router-dom";
import WarehouseLayout, { WAREHOUSE_ROUTES } from "@/components/warehouse/WarehouseLayout";
import { VerificationBadge } from "@/components/warehouse/ui";
import { ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeWarehouseError,
  formatDate,
  formatINR,
  formatWeight,
  listCapacity,
  listInvoices,
  listStorageBookings,
  listWarehouses,
  warehouseTotals,
} from "@/lib/warehouse";
import type {
  StorageBooking,
  StorageInvoice,
  Warehouse,
  WarehouseCapacity,
} from "@/lib/warehouse";

/**
 * Warehouse owner profile.
 *
 * The account itself (name, email, avatar) lives in the shared `profiles` table
 * and is edited by the shared profile flow — this page shows the storage
 * business as a whole and links to the per-warehouse records for the detail.
 */
export default function WarehouseProfile() {
  const { profile, user } = useAuth();
  const D = describeWarehouseError;

  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const invoices = useWorkerData<StorageInvoice[]>(() => listInvoices(), [], D);

  const warehouseList = warehouses.data ?? [];
  const capacityList = capacity.data ?? [];
  const bookingList = bookings.data ?? [];
  const invoiceList = invoices.data ?? [];

  const totals = useMemo(() => warehouseTotals(capacityList), [capacityList]);
  const revenue = invoiceList
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total_inr), 0);
  const completed = bookingList.filter((b) => b.status === "completed").length;

  const displayName =
    profile?.details?.warehouse_name ||
    profile?.details?.business_name ||
    profile?.full_name ||
    user?.email?.split("@")[0] ||
    "Warehouse Owner";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const locations = [
    ...new Set(warehouseList.map((w) => w.district).filter(Boolean) as string[]),
  ];

  const verification: Warehouse["verification"] =
    warehouseList.length === 0
      ? "not_submitted"
      : warehouseList.every((w) => w.verification === "verified")
        ? "verified"
        : warehouseList.some((w) => w.verification === "pending")
          ? "pending"
          : warehouseList.some((w) => w.verification === "rejected")
            ? "rejected"
            : "not_submitted";

  if (warehouses.state === "loading") {
    return (
      <WarehouseLayout title="My Profile">
        <Loading label="Loading profile…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout title="My Profile" subtitle="Your storage business at a glance">
      {warehouses.state === "error" && <ErrorNotice message={warehouses.error} onRetry={warehouses.reload} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Business" description="Account details from your Kalika profile">
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-100 text-[16px] font-extrabold text-brand-800">
                {initials || "WH"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold text-forest">{displayName}</p>
                <p className="truncate text-[11px] text-slate-500">{profile?.email ?? user?.email ?? "—"}</p>
                <p className="text-[11px] text-slate-500">{profile?.phone ?? "No phone on file"}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <VerificationBadge state={verification} />
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {warehouseList.length} warehouse(s)
              </span>
              {locations.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {locations.slice(0, 3).join(", ")}
                </span>
              )}
            </div>

            <Link
              to={WAREHOUSE_ROUTES.settings}
              className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Account settings
            </Link>
          </div>
        </Panel>

        <Panel title="Storage business" description="Derived from your live records" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
            <Stat icon={WarehouseIcon} label="Warehouses" value={String(totals.warehouses)} />
            <Stat icon={Boxes} label="Capacity" value={formatWeight(totals.capacity_kg)} />
            <Stat icon={IndianRupee} label="Paid revenue" value={formatINR(revenue)} />
            <Stat icon={Store} label="Completed bookings" value={String(completed)} />
          </dl>
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-[11px] leading-relaxed text-slate-600">
              These figures are calculated from your bookings, lots and invoices — they are not inputs, so
              they cannot drift from what actually happened.
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="My warehouses" description="Each facility has its own record">
        {warehouseList.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
            No warehouse added yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {warehouseList.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`${WAREHOUSE_ROUTES.warehouses}/${w.id}`}
                    className="truncate text-[12px] font-semibold text-forest hover:underline"
                  >
                    {w.name}
                  </Link>
                  <p className="text-[10.5px] text-slate-500">
                    {[w.village, w.district, w.state].filter(Boolean).join(", ") || "Location not set"} · since{" "}
                    {formatDate(w.created_at)}
                  </p>
                </div>
                <VerificationBadge state={w.verification} />
                <span className="text-[11px] font-semibold text-slate-600">
                  {formatWeight(Number(w.total_capacity_kg ?? w.capacity_kg))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Where to edit what" description="Kept deliberately separate">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>
            • <strong>Name, email, phone, avatar</strong> — shared account profile, used by every
            Kalika account type.
          </li>
          <li>
            • <strong>Warehouse name, address, capacity, facilities</strong> — My Warehouses → Edit.
          </li>
          <li>
            • <strong>Documents and verification</strong> — Invoices & Documents.
          </li>
          <li>
            • <strong>Staff and permissions</strong> — Staff Management.
          </li>
        </ul>
      </Panel>
    </WarehouseLayout>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="mt-0.5 truncate text-[14px] font-extrabold text-forest">{value}</dd>
    </div>
  );
}
