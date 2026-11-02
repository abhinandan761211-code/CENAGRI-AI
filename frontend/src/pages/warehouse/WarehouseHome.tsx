import { useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarCheck,
  IndianRupee,
  Inbox,
  Plus,
  RefreshCcw,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ShellHero, ShellQuickActions } from "@/components/account/AccountShell";
import WarehouseLayout, { WAREHOUSE_ROUTES, warehouseDetailPath } from "@/components/warehouse/WarehouseLayout";
import {
  BookingStatusPill,
  CapacityBar,
  OccupancyRing,
  SectionHeading,
  VerificationBadge,
  WarehouseTypeTag,
} from "@/components/warehouse/ui";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  BOOKING_STATUS_LABEL,
  compactWeight,
  describeWarehouseError,
  formatDate,
  formatDateTime,
  formatINR,
  formatWeight,
  listCapacity,
  listDispatches,
  listInvoices,
  listLotsForOwner,
  listOpenStorageRequests,
  listReceipts,
  listStorageBookings,
  listWarehouses,
  stockByCrop,
  totalStoredKg,
  warehouseTotals,
} from "@/lib/warehouse";
import type {
  GoodsDispatch,
  GoodsReceipt,
  InventoryLot,
  StorageBooking,
  StorageInvoice,
  StorageRequest,
  Warehouse,
  WarehouseCapacity,
} from "@/lib/warehouse";

/**
 * Warehouse overview.
 *
 * Every KPI is derived from the owner's own rows. A new owner sees zeros and
 * empty states — never a fabricated "₹4.2 lakh this month". Where a figure
 * depends on data that does not exist yet (e.g. invoices before any trip is
 * billed) the card says so instead of showing a made-up number.
 */
export default function WarehouseHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const D = describeWarehouseError;

  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);
  const requests = useWorkerData<StorageRequest[]>(() => listOpenStorageRequests({}), [], D);
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const lots = useWorkerData<InventoryLot[]>(() => listLotsForOwner(), [], D);
  const receipts = useWorkerData<GoodsReceipt[]>(() => listReceipts(), [], D);
  const dispatches = useWorkerData<GoodsDispatch[]>(() => listDispatches(), [], D);
  const invoices = useWorkerData<StorageInvoice[]>(() => listInvoices(), [], D);

  const warehouseList = warehouses.data ?? [];
  const capacityList = capacity.data ?? [];
  const requestList = requests.data ?? [];
  const bookingList = bookings.data ?? [];
  const lotList = lots.data ?? [];
  const receiptList = receipts.data ?? [];
  const dispatchList = dispatches.data ?? [];
  const invoiceList = invoices.data ?? [];

  const totals = useMemo(() => warehouseTotals(capacityList), [capacityList]);
  const storedKg = useMemo(() => totalStoredKg(lotList), [lotList]);
  const cropStock = useMemo(() => stockByCrop(lotList).slice(0, 6), [lotList]);

  const activeBookingCount = bookingList.filter(
    (b) => !["completed", "cancelled"].includes(b.status)
  ).length;

  /** Goods still on their way in — booked but not yet received. */
  const incoming = useMemo(
    () =>
      bookingList
        .filter((b) => ["confirmed", "goods_expected"].includes(b.status))
        .sort((a, b) => (a.expected_inward_on ?? a.starts_on).localeCompare(b.expected_inward_on ?? b.starts_on))
        .slice(0, 4),
    [bookingList]
  );

  /** Release requests waiting on the gate. */
  const outgoing = useMemo(
    () =>
      bookingList
        .filter((b) => ["release_requested", "partially_released"].includes(b.status))
        .slice(0, 4),
    [bookingList]
  );

  const recentBookings = useMemo(
    () => [...bookingList].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [bookingList]
  );

  const paidInvoices = invoiceList.filter((i) => i.status === "paid");
  const pendingInvoices = invoiceList.filter((i) => i.status === "pending" || i.status === "processing");
  const thisMonth = paidInvoices
    .filter((i) => {
      const d = new Date(i.paid_on ?? i.issued_on);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, i) => s + Number(i.total_inr), 0);

  const activity = useMemo(() => {
    const rows: { at: string; title: string; detail: string; to: string }[] = [];
    for (const r of receiptList.slice(0, 5)) {
      rows.push({
        at: r.received_at,
        title: `Goods received · ${formatWeight(Number(r.received_kg))}`,
        detail: `${r.grn_no}${r.discrepancy ? " · quantity discrepancy flagged" : ""}`,
        to: WAREHOUSE_ROUTES.inward,
      });
    }
    for (const d of dispatchList.slice(0, 5)) {
      rows.push({
        at: d.dispatched_at,
        title: `Dispatched · ${formatWeight(Number(d.dispatched_kg))}`,
        detail: d.dispatch_no,
        to: WAREHOUSE_ROUTES.outward,
      });
    }
    for (const b of bookingList.slice(0, 5)) {
      rows.push({
        at: b.created_at,
        title: `Booking ${BOOKING_STATUS_LABEL[b.status].toLowerCase()}`,
        detail: `${b.depositor_name ?? "Depositor"} · ${b.crop_name ?? "Crop"}`,
        to: WAREHOUSE_ROUTES.bookings,
      });
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [receiptList, dispatchList, bookingList]);

  const failed =
    warehouses.state === "error"
      ? warehouses
      : capacity.state === "error"
        ? capacity
        : bookings.state === "error"
          ? bookings
          : lots.state === "error"
            ? lots
            : null;

  if (warehouses.state === "loading") {
    return (
      <WarehouseLayout title="Overview">
        <Loading label="Loading your warehouse dashboard…" />
      </WarehouseLayout>
    );
  }

  const locationLine =
    warehouseList.length > 0
      ? [warehouseList[0].district, warehouseList[0].state].filter(Boolean).join(", ") ||
        "Storage operations"
      : (profile?.details?.district ?? "Storage operations");

  const hasWarehouses = warehouseList.length > 0;

  return (
    <WarehouseLayout
      title="Overview"
      subtitle="Warehouses, capacity, inventory and bookings"
      action={
        <Link
          to={WAREHOUSE_ROUTES.warehouses}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add warehouse
        </Link>
      }
    >
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}

      <ShellHero
        locationLine={locationLine}
        greeting="Welcome Back, Warehouse Owner!"
        subtitle="Manage your warehouses, storage capacity, crop inventory, and bookings in one place."
        aside={
          <div className="rounded-xl bg-white/12 p-4 backdrop-blur-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Storage used</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[22px] font-extrabold leading-none text-white">
                {totals.utilisation_pct}%
              </span>
              <span className="text-[11px] text-white/80">
                of {compactWeight(totals.capacity_kg)}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-emerald-300"
                style={{ width: `${Math.min(totals.utilisation_pct, 100)}%` }}
              />
            </div>
            <Link
              to={WAREHOUSE_ROUTES.warehouses}
              className="mt-2 inline-block text-[11px] font-bold text-emerald-200 underline-offset-2 hover:underline"
            >
              {hasWarehouses ? "Manage capacity →" : "Add your first warehouse →"}
            </Link>
          </div>
        }
      />

      {/* ── KPI grid ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Total warehouses"
          value={String(totals.warehouses)}
          hint={hasWarehouses ? "Listed facilities" : "None added yet"}
          icon={WarehouseIcon}
        />
        <StatCard
          label="Total capacity"
          value={formatWeight(totals.capacity_kg)}
          hint="Declared across all stores"
          icon={Boxes}
        />
        <StatCard
          label="Available capacity"
          value={formatWeight(totals.available_kg)}
          hint="Free right now"
          icon={Boxes}
          tone="brand"
        />
        <StatCard
          label="Occupied capacity"
          value={formatWeight(totals.occupied_kg)}
          hint={`${totals.utilisation_pct}% used incl. reserved`}
          icon={Boxes}
          tone={totals.utilisation_pct >= 90 ? "rose" : undefined}
        />
        <StatCard
          label="Active bookings"
          value={String(activeBookingCount)}
          hint="Not yet completed"
          icon={CalendarCheck}
        />
        <StatCard
          label="Incoming goods"
          value={String(incoming.length)}
          hint="Awaiting receipt"
          icon={ArrowDownToLine}
        />
        <StatCard
          label="Stored inventory"
          value={formatWeight(storedKg)}
          hint={`${lotList.filter((l) => l.status !== "released").length} lots in custody`}
          icon={Boxes}
        />
        <StatCard
          label="Outgoing goods"
          value={String(outgoing.length)}
          hint="Release requested"
          icon={ArrowUpFromLine}
        />
        <StatCard
          label="Monthly revenue"
          value={formatINR(thisMonth)}
          hint={paidInvoices.length === 0 ? "No paid invoice yet" : "Paid this month"}
          icon={IndianRupee}
          tone="brand"
        />
        <StatCard
          label="Pending payments"
          value={formatINR(pendingInvoices.reduce((s, i) => s + Number(i.total_inr), 0))}
          hint={`${pendingInvoices.length} invoice(s)`}
          icon={IndianRupee}
          tone={pendingInvoices.length > 0 ? "amber" : undefined}
        />
      </section>

      {!hasWarehouses && (
        <Panel title="Get started" description="Add a warehouse to start taking bookings">
          <EmptyState
            icon={WarehouseIcon}
            title="No warehouse added yet"
            description="Your capacity, bookings and inventory all hang off a warehouse. Add one — name, type, address and total capacity are enough to begin."
            action={
              <Link
                to={WAREHOUSE_ROUTES.warehouses}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add warehouse
              </Link>
            }
          />
        </Panel>
      )}

      {hasWarehouses && (
        <ShellQuickActions
          actions={[
            { label: "New booking", icon: CalendarCheck, onClick: () => navigate(WAREHOUSE_ROUTES.bookings) },
            { label: "Receive goods", icon: ArrowDownToLine, onClick: () => navigate(WAREHOUSE_ROUTES.inward) },
            { label: "Release goods", icon: ArrowUpFromLine, onClick: () => navigate(WAREHOUSE_ROUTES.outward) },
            { label: "Record reading", icon: RefreshCcw, onClick: () => navigate(WAREHOUSE_ROUTES.monitoring) },
            { label: "Find requests", icon: Inbox, onClick: () => navigate(WAREHOUSE_ROUTES.requests) },
          ]}
        />
      )}

      {/* ── Capacity + crop mix ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Storage occupancy" description="Per warehouse, in metric tonnes" className="lg:col-span-2">
          {capacityList.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No capacity to show"
              description="Capacity appears once a warehouse is added."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {capacityList.map((wh) => (
                <li key={wh.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <OccupancyRing percent={wh.utilisation_pct} size={48} />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={warehouseDetailPath(wh.id)}
                      className="truncate text-[13px] font-bold text-forest hover:underline"
                    >
                      {wh.name}
                    </Link>
                    <p className="text-[10.5px] text-slate-500">
                      {wh.district ?? "—"} · {formatWeight(wh.capacity_kg)} total
                    </p>
                    <div className="mt-1.5">
                      <CapacityBar
                        capacityKg={wh.capacity_kg}
                        reservedKg={wh.reserved_kg}
                        occupiedKg={wh.occupied_kg}
                        showLegend={false}
                        height="h-1.5"
                      />
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[11px] font-bold text-emerald-700">{compactWeight(wh.occupied_kg)}</p>
                    <p className="text-[9.5px] uppercase tracking-wide text-slate-400">occupied</p>
                    <p className="mt-1 text-[11px] font-bold text-sky-700">{compactWeight(wh.available_kg)}</p>
                    <p className="text-[9.5px] uppercase tracking-wide text-slate-400">free</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Crop-wise inventory" description="Quantity held, by crop">
          {cropStock.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="Nothing in storage"
              description="Crop quantities appear here after the first goods receipt."
            />
          ) : (
            <ul className="space-y-2.5 p-4 sm:p-5">
              {cropStock.map((row) => {
                const max = Math.max(...cropStock.map((c) => c.kg), 1);
                return (
                  <li key={row.crop}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-forest">{row.crop}</span>
                      <span className="shrink-0 text-[11px] font-bold text-slate-600">
                        {formatWeight(row.kg)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-600"
                        style={{ width: `${(row.kg / max) * 100}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">{row.lots} lot(s)</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Schedules ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Incoming goods"
          description="Booked and expected at the gate"
          action={
            <Link to={WAREHOUSE_ROUTES.inward} className="text-[11px] font-bold text-brand-700 hover:underline">
              Open inward
            </Link>
          }
        >
          {incoming.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No goods are expected. Confirm a booking to schedule a delivery.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {incoming.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {b.crop_name ?? "Crop"} · {formatWeight(Number(b.quantity_kg))}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {b.depositor_name ?? "Depositor"} · due {formatDate(b.expected_inward_on ?? b.starts_on)}
                    </p>
                  </div>
                  <BookingStatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Outgoing goods"
          description="Release requests waiting at the gate"
          action={
            <Link to={WAREHOUSE_ROUTES.outward} className="text-[11px] font-bold text-brand-700 hover:underline">
              Open outward
            </Link>
          }
        >
          {outgoing.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No release has been requested.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {outgoing.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {b.crop_name ?? "Crop"} · {formatWeight(Number(b.stored_kg ?? 0))} held
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      Released {formatWeight(Number(b.released_kg))} of {formatWeight(Number(b.received_kg))}
                    </p>
                  </div>
                  <BookingStatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Recent bookings + activity ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Recent bookings"
          description="Latest reservations"
          className="lg:col-span-2"
          action={
            <Link to={WAREHOUSE_ROUTES.bookings} className="text-[11px] font-bold text-brand-700 hover:underline">
              View all
            </Link>
          }
        >
          {recentBookings.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No bookings yet"
              description="Bookings appear after you accept a storage request or create one for a customer."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-bold">Depositor</th>
                    <th className="px-4 py-2 font-bold">Crop</th>
                    <th className="px-4 py-2 font-bold">Qty</th>
                    <th className="px-4 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-forest">{b.depositor_name ?? "Depositor"}</p>
                        <p className="text-[10px] text-slate-500">{b.warehouse_name ?? "—"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{b.crop_name ?? "—"}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        {formatWeight(Number(b.quantity_kg))}
                      </td>
                      <td className="px-4 py-2.5">
                        <BookingStatusPill status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <aside className="space-y-4">
          <Panel title="Warehouse status" description="Listings and verification">
            {warehouseList.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11.5px] text-slate-500">No warehouse yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {warehouseList.slice(0, 4).map((wh) => (
                  <li key={wh.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to={warehouseDetailPath(wh.id)}
                        className="truncate text-[12px] font-semibold text-forest hover:underline"
                      >
                        {wh.name}
                      </Link>
                      <WarehouseTypeTag type={wh.warehouse_type} />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <VerificationBadge state={wh.verification} />
                      {!wh.is_listed && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          Not listed
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" description="Goods movement and bookings">
            {activity.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11.5px] text-slate-500">
                Nothing has happened yet.
              </div>
            ) : (
              <ul className="space-y-2.5 p-4">
                {activity.map((row, i) => (
                  <li key={`${row.at}-${i}`} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    <div className="min-w-0">
                      <Link to={row.to} className="block text-[11.5px] font-semibold text-forest hover:underline">
                        {row.title}
                      </Link>
                      <p className="truncate text-[10.5px] text-slate-500">{row.detail}</p>
                      <p className="text-[10px] text-slate-400">{formatDateTime(row.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>

      <section>
        <SectionHeading
          title="Open storage requests"
          hint="Posted by farmers, buyers, retailers and traders"
        />
        <Panel
          title="Waiting for a quotation"
          description={`${requestList.length} open request(s) in your area`}
          action={
            <Link to={WAREHOUSE_ROUTES.requests} className="text-[11px] font-bold text-brand-700 hover:underline">
              Browse all
            </Link>
          }
        >
          {requestList.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No open requests"
              description="When a farmer or trader posts a storage requirement it appears here, ready for a quote."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {requestList.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {r.crop_name}
                      {r.variety ? ` · ${r.variety}` : ""}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {formatWeight(Number(r.quantity_kg))} · from {formatDate(r.starts_on)} ·{" "}
                      {r.duration_days} days
                    </p>
                  </div>
                  <Link
                    to={WAREHOUSE_ROUTES.requests}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Quote
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </WarehouseLayout>
  );
}
