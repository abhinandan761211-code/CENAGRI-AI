import { useMemo, useState } from "react";
import { MessageSquare, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import WarehouseLayout, { WAREHOUSE_ROUTES } from "@/components/warehouse/WarehouseLayout";
import { BookingStatusPill, PaymentStatusPill, SectionHeading } from "@/components/warehouse/ui";
import { EmptyState, ErrorNotice, Loading, Panel, inputClass } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeWarehouseError,
  formatDate,
  formatINR,
  formatWeight,
  listLotsForOwner,
  listStorageBookings,
} from "@/lib/warehouse";
import type { InventoryLot, StorageBooking } from "@/lib/warehouse";

type Customer = {
  id: string;
  name: string;
  role: string | null;
  bookings: StorageBooking[];
  active: StorageBooking[];
  bookedKg: number;
  heldKg: number;
  lots: number;
  revenue: number;
  outstanding: number;
  lastBooking: string;
  disputes: number;
};

/**
 * Customer Management.
 *
 * A "customer" here is a depositor the owner has had a booking with. Nothing is
 * read from `profiles` beyond the name and role that the booking itself carries:
 * a warehouse owner has no business seeing a farmer's account details, and RLS
 * does not grant it.
 */
export default function WarehouseCustomers() {
  const D = describeWarehouseError;
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const lots = useWorkerData<InventoryLot[]>(() => listLotsForOwner(), [], D);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const bookingList = bookings.data ?? [];
  const lotList = lots.data ?? [];

  const customers = useMemo<Customer[]>(() => {
    const map = new Map<string, Customer>();
    for (const b of bookingList) {
      const id = b.farmer_id;
      const existing =
        map.get(id) ??
        ({
          id,
          name: b.depositor_name ?? "Depositor",
          role: b.depositor_role,
          bookings: [],
          active: [],
          bookedKg: 0,
          heldKg: 0,
          lots: 0,
          revenue: 0,
          outstanding: 0,
          lastBooking: b.created_at,
          disputes: 0,
        } satisfies Customer);

      existing.bookings.push(b);
      if (!["completed", "cancelled"].includes(b.status)) existing.active.push(b);
      existing.bookedKg += Number(b.quantity_kg);
      if (b.status === "disputed") existing.disputes += 1;
      if (b.payment_status === "paid") existing.revenue += Number(b.agreed_price_inr);
      if (["pending", "partially_paid"].includes(b.payment_status)) {
        existing.outstanding += Number(b.agreed_price_inr);
      }
      if (b.depositor_name) existing.name = b.depositor_name;
      if (b.depositor_role) existing.role = b.depositor_role;
      if (b.created_at > existing.lastBooking) existing.lastBooking = b.created_at;

      map.set(id, existing);
    }

    // Held quantity comes from the lots, which carry the depositor themselves.
    for (const lot of lotList) {
      const customer = map.get(lot.depositor_id);
      if (!customer) continue;
      if (lot.status !== "released") {
        customer.heldKg += Number(lot.current_kg);
        customer.lots += 1;
      }
    }

    return [...map.values()].sort((a, b) => b.bookedKg - a.bookedKg);
  }, [bookingList, lotList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.role ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  const selectedCustomer = customers.find((c) => c.id === selected) ?? null;

  if (bookings.state === "loading") {
    return (
      <WarehouseLayout title="Customer Management">
        <Loading label="Loading customers…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Customer Management"
      subtitle="Depositors who have stored with you"
    >
      {bookings.state === "error" && <ErrorNotice message={bookings.error} onRetry={bookings.reload} />}

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          You see a depositor's name, role and their own bookings with you — nothing else from their
          CenAGRI account. Contact goes through Messages, which records who said what.
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Depositors"
          description={`${filtered.length} customer(s)`}
          action={
            <label className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or role"
                className={`${inputClass} h-8 w-44 pl-8 text-[11.5px]`}
              />
            </label>
          }
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={customers.length === 0 ? "No customers yet" : "No match"}
              description={
                customers.length === 0
                  ? "A customer appears here once they have a booking with you. Accept a storage request to start building the list."
                  : "Try a different name."
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 ${selected === c.id ? "bg-brand-50" : ""
                      }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-extrabold text-brand-800">
                      {c.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join("") || "D"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-forest">{c.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {c.role ?? "Depositor"} · {c.bookings.length} booking(s)
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-bold text-slate-700">{formatWeight(c.heldKg)}</p>
                      <p className="text-[9.5px] text-slate-400">held</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="lg:col-span-2">
          {!selectedCustomer ? (
            <Panel title="Customer detail" description="Pick a depositor to see their history">
              <div className="px-4 py-12 text-center text-[11.5px] text-slate-500">
                Select a customer from the list.
              </div>
            </Panel>
          ) : (
            <div className="space-y-4">
              <Panel
                title={selectedCustomer.name}
                description={selectedCustomer.role ?? "Depositor"}
                action={
                  <Link
                    to={WAREHOUSE_ROUTES.messages}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <MessageSquare className="h-3 w-3" /> Message
                  </Link>
                }
              >
                <dl className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                  <Stat label="Held now" value={formatWeight(selectedCustomer.heldKg)} />
                  <Stat label="Lots" value={String(selectedCustomer.lots)} />
                  <Stat label="Paid" value={formatINR(selectedCustomer.revenue)} />
                  <Stat
                    label="Outstanding"
                    value={formatINR(selectedCustomer.outstanding)}
                    tone={selectedCustomer.outstanding > 0 ? "warn" : undefined}
                  />
                </dl>
              </Panel>

              <Panel title="Booking history" description="Every booking this depositor has with you">
                <ul className="divide-y divide-slate-100">
                  {selectedCustomer.bookings.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-forest">
                          {b.crop_name ?? "Crop"} · {formatWeight(Number(b.quantity_kg))}
                        </p>
                        <p className="text-[10.5px] text-slate-500">
                          {b.warehouse_name ?? "—"} · {formatDate(b.starts_on)} → {formatDate(b.ends_on)}
                        </p>
                      </div>
                      <PaymentStatusPill status={b.payment_status} />
                      <BookingStatusPill status={b.status} />
                    </li>
                  ))}
                </ul>
              </Panel>

              {selectedCustomer.disputes > 0 && (
                <Panel title="Disputes" description="Open or past disagreements">
                  <p className="px-4 py-3 text-[11.5px] text-rose-700">
                    {selectedCustomer.disputes} booking(s) in dispute. Keep the inspection photographs —
                    they are the record both sides rely on.
                  </p>
                </Panel>
              )}
            </div>
          )}
        </div>
      </div>

      <section>
        <SectionHeading title="Customer relationships" hint="What you can and cannot see" />
        <Panel title="Privacy" description="Scoped by the database, not just this screen">
          <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
            <li>• You see a depositor only because they hold a booking with you.</li>
            <li>• Their phone, address and other account data are not exposed to the warehouse module.</li>
            <li>• Stored goods belong to them. You are the custodian and cannot sell or move them.</li>
            <li>• Communications are kept in Messages so a dispute has a factual record.</li>
          </ul>
        </Panel>
      </section>
    </WarehouseLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-[13px] font-extrabold ${tone === "warn" ? "text-amber-700" : "text-forest"}`}>
        {value}
      </dd>
    </div>
  );
}
