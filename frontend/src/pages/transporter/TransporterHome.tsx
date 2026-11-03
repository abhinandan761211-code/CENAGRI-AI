import { useMemo } from "react";
import {
  ClipboardList,
  IndianRupee,
  Navigation,
  Package,
  Plus,
  Search,
  Truck,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ShellHero, ShellQuickActions } from "@/components/account/AccountShell";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import {
  BookingStatusPill,
  RequestCard,
  RequestGrid,
  SectionHeading,
  VehicleAlertLine,
  VerificationBadge,
} from "@/components/transporter/ui";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  ACTIVE_BOOKING_STATUSES,
  dashboardTotals,
  describeTransporterError,
  ensureTransporterProfile,
  formatDate,
  formatINR,
  listBookings,
  listFleet,
  listInvoices,
  listTransportRequests,
  profileCompletion,
  vehicleAlerts,
} from "@/lib/transporter";
import type {
  FleetVehicle,
  TransportBooking,
  TransportInvoice,
  TransportRequest,
  TransporterProfile,
} from "@/lib/transporter";
import { CompletionRing } from "@/components/worker/ui";

/**
 * Transporter overview.
 *
 * The seven KPIs from the brief are all derived from the transporter's own rows.
 * A new transporter sees zeros and empty states — never a fabricated statistic.
 */
export default function TransporterHome() {
  const { profile: account } = useAuth();
  const navigate = useNavigate();

  const D = describeTransporterError;
  const me = useWorkerData<TransporterProfile>(
    () =>
      ensureTransporterProfile({
        business_name: account?.details?.business_name ?? account?.full_name,
        contact_phone: account?.phone,
        service_districts: [account?.details?.district].filter(Boolean) as string[],
      }),
    [],
    D
  );
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);
  const requests = useWorkerData<TransportRequest[]>(() => listTransportRequests({}), [], D);
  const bookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);
  const invoices = useWorkerData<TransportInvoice[]>(() => listInvoices(), [], D);

  const fleetList = fleet.data ?? [];
  const requestList = requests.data ?? [];
  const bookingList = bookings.data ?? [];
  const invoiceList = invoices.data ?? [];

  const totals = dashboardTotals({
    requests: requestList,
    bookings: bookingList,
    fleet: fleetList,
    invoices: invoiceList,
  });

  const completion = profileCompletion(me.data, fleetList.length);

  const activeTrips = useMemo(
    () => bookingList.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)),
    [bookingList]
  );
  const upcoming = useMemo(
    () =>
      bookingList
        .filter((b) => ["accepted", "confirmed", "vehicle_assigned", "driver_assigned", "pickup_scheduled"].includes(b.status))
        .sort((a, b) => (a.pickup_on ?? "").localeCompare(b.pickup_on ?? ""))
        .slice(0, 4),
    [bookingList]
  );
  const recent = useMemo(
    () => [...bookingList].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [bookingList]
  );

  const failed =
    me.state === "error"
      ? me
      : bookings.state === "error"
        ? bookings
        : requests.state === "error"
          ? requests
          : null;

  if (me.state === "loading") {
    return (
      <TransporterLayout title="Overview">
        <Loading label="Loading your logistics dashboard…" />
      </TransporterLayout>
    );
  }

  if (failed) {
    return (
      <TransporterLayout title="Overview">
        <ErrorNotice message={failed.error} onRetry={failed.reload} />
      </TransporterLayout>
    );
  }

  const businessName =
    me.data?.business_name ||
    account?.details?.business_name ||
    account?.full_name ||
    account?.email?.split("@")[0] ||
    "Transporter";

  const serviceLine =
    me.data?.service_districts?.length
      ? me.data.service_districts.slice(0, 3).join(", ")
      : [account?.details?.district, account?.details?.state].filter(Boolean).join(", ") ||
      "Add your service area";

  return (
    <TransporterLayout
      title="Overview"
      action={
        <Link
          to={TRANSPORTER_ROUTES.requests}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Search className="h-3.5 w-3.5" /> Find requests
        </Link>
      }
    >
      {/* ── Welcome ── */}
      <ShellHero
        locationLine={serviceLine}
        greeting="Welcome Back, Transporter!"
        subtitle="Manage your fleet, find transport bookings, track deliveries, and grow your logistics business."
        aside={
          <div className="rounded-xl bg-white/12 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <CompletionRing value={completion} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                  Business profile
                </p>
                <p className="mt-0.5 text-[13px] font-semibold leading-snug text-white">
                  {completion >= 100
                    ? "Complete — you are ready to take bookings"
                    : "Complete it to win more bookings"}
                </p>
                <Link
                  to={TRANSPORTER_ROUTES.profile}
                  className="mt-1.5 inline-block text-[11px] font-bold text-emerald-200 underline-offset-2 hover:underline"
                >
                  Complete now →
                </Link>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <VerificationBadge verification={me.data?.verification ?? "not_submitted"} />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white">
                <Truck className="h-3.5 w-3.5" /> {fleetList.length} vehicle
                {fleetList.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        }
      />

      {/* ── KPIs ── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard icon={Package} label="New requests" value={String(totals.newRequests)} hint="Open to quote" />
        <StatCard icon={ClipboardList} label="Pending bookings" value={String(totals.pendingBookings)} hint="Awaiting trip start" tone="amber" />
        <StatCard icon={Navigation} label="Active trips" value={String(totals.activeTrips)} hint="On the road" />
        <StatCard icon={CheckCircle2} label="Completed trips" value={String(totals.completedTrips)} hint="All time" />
        <StatCard icon={Truck} label="Available vehicles" value={String(totals.availableVehicles)} hint={`of ${fleetList.length}`} />
        <StatCard icon={IndianRupee} label="Total earnings" value={formatINR(totals.totalEarnings)} hint="Paid invoices only" />
        <StatCard icon={Wallet} label="Pending payments" value={formatINR(totals.pendingPayments)} hint="Not settled" tone="amber" />
      </section>

      <ShellQuickActions
        title="Quick Actions"
        actions={[
          { label: "Find Requests", icon: Search, onClick: () => navigate(TRANSPORTER_ROUTES.requests) },
          { label: "My Bookings", icon: ClipboardList, onClick: () => navigate(TRANSPORTER_ROUTES.bookings) },
          { label: "Active Trips", icon: Navigation, onClick: () => navigate(TRANSPORTER_ROUTES.trips) },
          { label: "Add Vehicle", icon: Truck, onClick: () => navigate(TRANSPORTER_ROUTES.vehicles) },
          { label: "Earnings", icon: IndianRupee, onClick: () => navigate(TRANSPORTER_ROUTES.earnings) },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Active trips + recent bookings ── */}
        <div className="space-y-4 lg:col-span-2">
          <Panel
            title="Active trips"
            description="Vehicles currently on the road"
            action={
              <Link to={TRANSPORTER_ROUTES.trips} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                View all
              </Link>
            }
          >
            {activeTrips.length === 0 ? (
              <EmptyState
                icon={Navigation}
                title="No active trips"
                description="Once a trip is picked up it appears here with its live stage. Start by quoting on an open request."
                action={
                  <Link
                    to={TRANSPORTER_ROUTES.requests}
                    className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                  >
                    Find requests
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {activeTrips.slice(0, 4).map((trip) => (
                  <li key={trip.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Truck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-forest">{trip.title}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {trip.pickup} → {trip.dropoff}
                        {trip.driver_name ? ` · ${trip.driver_name}` : ""}
                      </p>
                    </div>
                    <BookingStatusPill status={trip.status} />
                    <Link
                      to={`${TRANSPORTER_ROUTES.trips}/${trip.id}`}
                      className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 hover:bg-brand-100"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recent bookings"
            description="Latest activity on your account"
            action={
              <Link to={TRANSPORTER_ROUTES.bookings} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                View all
              </Link>
            }
          >
            {recent.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No bookings yet"
                description="When a requester accepts your quote, the booking appears here with the full trip lifecycle."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((booking) => (
                  <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-forest">{booking.title}</p>
                      <p className="truncate text-[10.5px] text-slate-500">
                        {booking.requester_name ?? "Requester"} · {formatDate(booking.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11.5px] font-bold text-emerald-800">
                        {formatINR(Number(booking.agreed_price_inr))}
                      </span>
                      <BookingStatusPill status={booking.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── Fleet + upcoming ── */}
        <div className="space-y-4">
          <Panel
            title="Vehicle availability"
            description="Your fleet at a glance"
            action={
              <Link to={TRANSPORTER_ROUTES.vehicles} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                Manage
              </Link>
            }
          >
            {fleetList.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[11.5px] text-slate-500">No vehicles added yet.</p>
                <Link
                  to={TRANSPORTER_ROUTES.vehicles}
                  className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-3 text-[11px] font-semibold text-white hover:bg-brand-800"
                >
                  <Plus className="h-3 w-3" /> Add vehicle
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {fleetList.slice(0, 4).map((vehicle) => {
                  const alerts = vehicleAlerts(vehicle);
                  return (
                    <li key={vehicle.id} className="px-3.5 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-forest">
                            {vehicle.registration_no ?? "No registration"}
                          </p>
                          <p className="truncate text-[10.5px] text-slate-500">
                            {vehicle.vehicle_type ?? vehicle.kind} · {Number(vehicle.capacity_kg) / 1000} t
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${vehicle.available
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                            }`}
                        >
                          {vehicle.available ? "Available" : "Busy"}
                        </span>
                      </div>
                      {alerts.length > 0 && (
                        <div className="mt-1.5">
                          <VehicleAlertLine alerts={alerts} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Upcoming trips" description="Next scheduled pickups">
            {upcoming.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
                Nothing scheduled.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((trip) => (
                  <li key={trip.id} className="px-3.5 py-2.5">
                    <p className="truncate text-[12px] font-semibold text-forest">{trip.title}</p>
                    <p className="truncate text-[10.5px] text-slate-500">
                      {trip.pickup_on ? formatDate(trip.pickup_on) : "Date not set"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* ── New requests ── */}
      <section>
        <SectionHeading
          icon={Package}
          title="New transport requests"
          hint="Posted by farmers, buyers, retailers and warehouses"
          action={
            <Link to={TRANSPORTER_ROUTES.requests} className="text-[11.5px] font-bold text-brand-700 hover:underline">
              Browse all
            </Link>
          }
        />
        {requests.state === "ready" && requestList.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No open requests right now"
            description="When a farmer or buyer needs cargo moved, their request appears here with route, weight and offered price."
          />
        ) : (
          <RequestGrid>
            {requestList.slice(0, 3).map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </RequestGrid>
        )}
      </section>
    </TransporterLayout>
  );
}
