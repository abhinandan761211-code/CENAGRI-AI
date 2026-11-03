import { useMemo } from "react";
import {
  CalendarDays,
  ClipboardList,
  IndianRupee,
  Plus,
  Search,
  Tractor,
  Wrench,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ShellHero, ShellQuickActions } from "@/components/account/AccountShell";
import EquipmentLayout, { EQUIPMENT_ROUTES, equipmentEditPath } from "@/components/equipment/EquipmentLayout";
import {
  BookingStatusPill,
  EquipmentEmptyIcon,
  EquipmentStatusPill,
  MiniStat,
  SectionHeading,
} from "@/components/equipment/ui";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  dashboardTotals,
  describeEquipmentError,
  formatDate,
  formatDateTime,
  formatINR,
  formatTime,
  listBookings,
  listEquipment,
  listInvoices,
  listOpenRequests,
  listReviews,
  serviceDue,
  upcomingBookings,
  utilisation,
} from "@/lib/equipment";
import type {
  Equipment,
  EquipmentBooking,
  EquipmentInvoice,
  EquipmentReview,
  RentalRequest,
} from "@/lib/equipment";

/**
 * Equipment overview.
 *
 * All nine KPIs come from the owner's own rows. A brand-new owner sees zeros and
 * empty states — never a fabricated utilisation or a made-up monthly earning.
 */
export default function EquipmentHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const D = describeEquipmentError;

  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);
  const requests = useWorkerData<RentalRequest[]>(() => listOpenRequests({}), [], D);
  const invoices = useWorkerData<EquipmentInvoice[]>(() => listInvoices(), [], D);
  const reviews = useWorkerData<EquipmentReview[]>(() => listReviews(), [], D);

  const equipmentList = equipment.data ?? [];
  const bookingList = bookings.data ?? [];
  const requestList = requests.data ?? [];
  const invoiceList = invoices.data ?? [];
  const reviewList = reviews.data ?? [];

  const totals = useMemo(
    () =>
      dashboardTotals({
        equipment: equipmentList,
        bookings: bookingList,
        requests: requestList,
        invoices: invoiceList,
      }),
    [equipmentList, bookingList, requestList, invoiceList]
  );

  const upcoming = useMemo(() => upcomingBookings(bookingList, 5), [bookingList]);
  const due = useMemo(() => serviceDue(equipmentList).slice(0, 4), [equipmentList]);

  const utilisationRows = useMemo(
    () =>
      equipmentList
        .map((e) => ({ equipment: e, ...utilisation(e.id, bookingList) }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 6),
    [equipmentList, bookingList]
  );

  const monthly = useMemo(() => {
    const paid = invoiceList.filter((i) => i.status === "paid");
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const total = paid
        .filter((inv) => {
          const at = new Date(inv.paid_on ?? inv.issued_on);
          return at.getFullYear() === d.getFullYear() && at.getMonth() === d.getMonth();
        })
        .reduce((s, inv) => s + Number(inv.total_inr), 0);
      return { label: d.toLocaleDateString("en-IN", { month: "short" }), total };
    });
  }, [invoiceList]);

  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  const recentActivity = useMemo(() => {
    const rows: { at: string; title: string; detail: string; to: string }[] = [];
    for (const b of bookingList.slice(0, 6)) {
      rows.push({
        at: b.created_at,
        title: `${b.equipment_title ?? "Machine"} · ${b.status.replace("_", " ")}`,
        detail: `${b.renter_name ?? "Renter"} · ${formatDate(b.starts_on)}`,
        to: EQUIPMENT_ROUTES.bookings,
      });
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [bookingList]);

  if (equipment.state === "loading") {
    return (
      <EquipmentLayout title="Overview">
        <Loading label="Loading your equipment dashboard…" />
      </EquipmentLayout>
    );
  }

  const failed = equipment.state === "error" ? equipment : bookings.state === "error" ? bookings : null;
  const locationLine =
    equipmentList.find((e) => e.district)?.district ??
    profile?.details?.district ??
    "Machinery rental";

  return (
    <EquipmentLayout
      title="Overview"
      subtitle="Machines, bookings, operators and earnings"
      action={
        <Link
          to={EQUIPMENT_ROUTES.add}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add equipment
        </Link>
      }
    >
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}

      <ShellHero
        locationLine={locationLine}
        greeting="Welcome Back, Equipment Owner!"
        subtitle="Manage your agricultural machinery, receive rental bookings, and grow your equipment business with CenAGRI AI."
        aside={
          <div className="rounded-xl bg-white/12 p-4 backdrop-blur-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Fleet ready</p>
            <p className="mt-0.5 text-[22px] font-extrabold leading-none text-white">
              {totals.available}/{totals.total}
            </p>
            <p className="mt-1 text-[11px] text-white/80">machines available right now</p>
            <Link
              to={EQUIPMENT_ROUTES.equipment}
              className="mt-2 inline-block text-[11px] font-bold text-emerald-200 underline-offset-2 hover:underline"
            >
              Manage equipment →
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total equipment" value={String(totals.total)} hint="Registered machines" icon={Tractor} />
        <StatCard label="Available" value={String(totals.available)} hint="Ready to book" icon={Tractor} tone="brand" />
        <StatCard label="Booked" value={String(totals.booked)} hint="On a job or reserved" icon={CalendarDays} />
        <StatCard
          label="Under maintenance"
          value={String(totals.maintenance)}
          hint="Not bookable"
          icon={Wrench}
          tone={totals.maintenance > 0 ? "amber" : undefined}
        />
        <StatCard label="New requests" value={String(totals.newRequests)} hint="Awaiting a quote" icon={ClipboardList} />
        <StatCard label="Active bookings" value={String(totals.activeBookings)} hint="In progress" icon={CalendarDays} />
        <StatCard label="Completed rentals" value={String(totals.completed)} hint="Work finished" icon={CalendarDays} tone="brand" />
        <StatCard
          label="Total earnings"
          value={formatINR(totals.earnings)}
          hint={invoiceList.length === 0 ? "No paid invoice yet" : "Paid invoices"}
          icon={IndianRupee}
        />
        <StatCard
          label="Pending payments"
          value={formatINR(totals.pending)}
          hint="Awaiting settlement"
          icon={IndianRupee}
          tone={totals.pending > 0 ? "amber" : undefined}
        />
        <StatCard
          label="Rating"
          value={
            reviewList.length > 0
              ? `${(
                reviewList.reduce((s, r) => s + r.equipment_rating, 0) / reviewList.length
              ).toFixed(1)}/5`
              : "—"
          }
          hint={reviewList.length > 0 ? `${reviewList.length} review(s)` : "No reviews yet"}
          icon={Tractor}
        />
      </section>

      {equipmentList.length === 0 ? (
        <Panel title="Get started" description="Register a machine to start taking rentals">
          <EmptyState
            icon={EquipmentEmptyIcon}
            title="No equipment registered"
            description="Add a tractor, harvester, pump or drone with its price and working area. Renters find it, request dates, and you accept — that is your first booking."
            action={
              <Link
                to={EQUIPMENT_ROUTES.add}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add equipment
              </Link>
            }
          />
        </Panel>
      ) : (
        <ShellQuickActions
          actions={[
            { label: "Add machine", icon: Plus, onClick: () => navigate(EQUIPMENT_ROUTES.add) },
            { label: "Requests", icon: ClipboardList, onClick: () => navigate(EQUIPMENT_ROUTES.requests) },
            { label: "Bookings", icon: CalendarDays, onClick: () => navigate(EQUIPMENT_ROUTES.bookings) },
            { label: "Operators", icon: Tractor, onClick: () => navigate(EQUIPMENT_ROUTES.operators) },
            { label: "Maintenance", icon: Wrench, onClick: () => navigate(EQUIPMENT_ROUTES.maintenance) },
          ]}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Earnings overview" description="Paid rental revenue, last 6 months" className="lg:col-span-2">
          {invoiceList.filter((i) => i.status === "paid").length === 0 ? (
            <EmptyState
              icon={IndianRupee}
              title="No earnings recorded"
              description="Revenue appears once a rental is completed and the invoice is settled by CenAGRI. Nothing is shown as earned before that."
            />
          ) : (
            <div className="p-4 sm:p-5">
              <div className="flex h-36 items-end gap-2">
                {monthly.map((m) => (
                  <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-slate-500">
                      {m.total > 0 ? formatINR(m.total) : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-brand-600"
                      style={{ height: `${Math.max((m.total / maxMonth) * 100, m.total > 0 ? 4 : 0)}%` }}
                    />
                    <span className="text-[10px] font-semibold text-slate-500">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Maintenance reminders" description="Service due within 30 days">
          {due.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No service due. Set a next-service date on each machine to get reminders here.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {due.map(({ equipment: e, days, overdue }) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-semibold text-forest">{e.title}</p>
                    <p className="text-[10px] text-slate-500">
                      {e.next_service_on ? formatDate(e.next_service_on) : "No date set"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${overdue ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                      }`}
                  >
                    {days == null ? "unset" : overdue ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Upcoming bookings"
          description="Soonest first"
          action={
            <Link to={EQUIPMENT_ROUTES.bookings} className="text-[11px] font-bold text-brand-700 hover:underline">
              View all
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No upcoming rentals. Accept a request to schedule one.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {b.equipment_title ?? "Machine"} · {b.renter_name ?? "Renter"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {formatDate(b.starts_on)} → {formatDate(b.ends_on)}
                      {b.start_time ? ` · ${formatTime(b.start_time)}` : ""}
                    </p>
                  </div>
                  <BookingStatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Equipment availability" description="Current status of each machine">
          {equipmentList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No machine registered.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {equipmentList.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={equipmentEditPath(e.id)}
                      className="truncate text-[12px] font-semibold text-forest hover:underline"
                    >
                      {e.title}
                    </Link>
                    <p className="text-[10px] text-slate-500">{e.location_text ?? e.district ?? "No location set"}</p>
                  </div>
                  <EquipmentStatusPill status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Machine utilisation" description="Booked days in the last 30" className="lg:col-span-2">
          {utilisationRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No machine to measure.</div>
          ) : (
            <ul className="space-y-3 p-4 sm:p-5">
              {utilisationRows.map(({ equipment: e, bookedDays, pct }) => (
                <li key={e.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11.5px] font-semibold text-forest">{e.title}</span>
                    <span className="shrink-0 text-[10.5px] text-slate-500">
                      {bookedDays}/30 days · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${pct >= 70 ? "bg-emerald-600" : pct >= 35 ? "bg-brand-600" : "bg-slate-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <aside className="space-y-4">
          <Panel title="Recent customer activity" description="Latest bookings">
            {recentActivity.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11.5px] text-slate-500">Nothing yet.</div>
            ) : (
              <ul className="space-y-2.5 p-4">
                {recentActivity.map((row, i) => (
                  <li key={`${row.at}-${i}`} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    <div className="min-w-0">
                      <Link to={row.to} className="block truncate text-[11.5px] font-semibold text-forest hover:underline">
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

          <Panel title="Fleet at a glance">
            <div className="grid grid-cols-2 gap-3 p-4">
              <MiniStat label="Machines" value={String(totals.total)} />
              <MiniStat label="Available" value={String(totals.available)} tone="good" />
              <MiniStat label="Booked" value={String(totals.booked)} />
              <MiniStat label="Service due" value={String(due.length)} tone={due.length > 0 ? "warn" : undefined} />
            </div>
          </Panel>
        </aside>
      </div>

      <section>
        <SectionHeading title="Open rental requests" hint="Posted by farmers, buyers and retailers" />
        <Panel
          title="Waiting for a quotation"
          description={`${requestList.length} open request(s)`}
          action={
            <Link to={EQUIPMENT_ROUTES.requests} className="text-[11px] font-bold text-brand-700 hover:underline">
              Browse all
            </Link>
          }
        >
          {requestList.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No open requests"
              description="When a farmer needs a machine, the requirement appears here with the land area, dates and whether an operator is needed."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {requestList.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {r.category ?? "Equipment"} · {r.work_type ?? "Work"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {formatDate(r.required_from)} · {r.duration_days} day(s)
                      {r.land_area_acres ? ` · ${r.land_area_acres} acre` : ""}
                      {r.needs_operator ? " · operator needed" : ""}
                    </p>
                  </div>
                  <Link
                    to={EQUIPMENT_ROUTES.requests}
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
    </EquipmentLayout>
  );
}
