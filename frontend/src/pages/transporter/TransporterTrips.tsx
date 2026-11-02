import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  MapPin,
  Navigation,
  Package,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { BookingStatusPill, TripProgressRail } from "@/components/transporter/ui";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  ACTIVE_BOOKING_STATUSES,
  describeTransporterError,
  formatDate,
  formatINR,
  formatTime,
  formatWeight,
  listBookings,
} from "@/lib/transporter";
import type { TransportBooking } from "@/lib/transporter";

const PENDING_STATUSES = ["accepted", "confirmed", "vehicle_assigned", "driver_assigned"];

/**
 * Active Trips.
 *
 * Two lists: trips that are on the road right now, and trips that are confirmed
 * but not yet started. Each card shows exactly which stage it is at, using the
 * status someone actually set — nothing is inferred from a location feed,
 * because there is none.
 */
export default function TransporterTrips() {
  const D = describeTransporterError;
  const bookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);

  const rows = bookings.data ?? [];

  const active = useMemo(
    () => rows.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)),
    [rows]
  );
  const pending = useMemo(
    () => rows.filter((b) => PENDING_STATUSES.includes(b.status)),
    [rows]
  );

  return (
    <TransporterLayout
      title="Active Trips"
      subtitle={`${active.length} on the road · ${pending.length} waiting to start`}
      action={
        <Link
          to={TRANSPORTER_ROUTES.tracking}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <MapPin className="h-3.5 w-3.5" /> Tracking
        </Link>
      }
    >
      {bookings.state === "loading" && <Loading label="Loading trips…" />}
      {bookings.state === "error" && <ErrorNotice message={bookings.error} onRetry={bookings.reload} />}

      {bookings.state === "ready" && active.length === 0 && pending.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Navigation}
            title="No trips right now"
            description="Quote on an open transport request to get your first booking. Confirmed trips appear here until they are delivered."
            action={
              <Link
                to={TRANSPORTER_ROUTES.requests}
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Find transport requests
              </Link>
            }
          />
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-[15px] font-bold text-forest">On the road</h2>
          {active.map((trip) => (
            <TripCard key={trip.id} trip={trip} onRoad />
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-[15px] font-bold text-forest">Waiting to start</h2>
          {pending.map((trip) => (
            <TripCard key={trip.id} trip={trip} onRoad={false} />
          ))}
        </section>
      )}
    </TransporterLayout>
  );
}

function TripCard({ trip, onRoad }: { trip: TransportBooking; onRoad: boolean }) {
  return (
    <Panel
      title={trip.title}
      description={`${trip.requester_name ?? "Requester"}${trip.requester_role ? ` · ${trip.requester_role}` : ""}`}
      action={<BookingStatusPill status={trip.status} />}
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex gap-2.5">
            <div className="flex flex-col items-center pt-1">
              <CircleDot className="h-3.5 w-3.5 text-emerald-600" />
              <span className="my-0.5 h-6 w-px bg-slate-300" />
              <MapPin className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate text-[12px] font-semibold text-forest">{trip.pickup}</p>
              <p className="truncate text-[12px] font-semibold text-forest">{trip.dropoff}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[13px] font-extrabold text-forest">
                {formatINR(Number(trip.agreed_price_inr))}
              </p>
              <p className="text-[10px] text-slate-500">
                {trip.distance_km != null ? `${trip.distance_km} km` : "distance n/a"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Cell
            icon={CalendarDays}
            label="Pickup"
            value={
              trip.pickup_on
                ? `${formatDate(trip.pickup_on)}${trip.pickup_time ? ` · ${formatTime(trip.pickup_time)}` : ""}`
                : "Not set"
            }
          />
          <Cell icon={Package} label="Cargo" value={formatWeight(Number(trip.weight_kg ?? 0) || null)} />
          <Cell
            icon={Truck}
            label="Vehicle"
            value={trip.vehicle_registration ?? trip.vehicle_type ?? "Not assigned"}
          />
          <Cell icon={CheckCircle2} label="Driver" value={trip.driver_name ?? "Not assigned"} />
        </div>

        {onRoad && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Trip stage
            </p>
            <TripProgressRail status={trip.status} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Link
            to={`${TRANSPORTER_ROUTES.trips}/${trip.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-3 text-[11.5px] font-semibold text-white hover:bg-brand-800"
          >
            Open trip <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            to={TRANSPORTER_ROUTES.messages}
            className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Message requester
          </Link>
          <span className="ml-auto flex items-center gap-1 text-[10.5px] text-slate-400">
            <MapPin className="h-3 w-3" />
            {trip.proof_status ? "Proof recorded" : "Proof not yet recorded"}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-0.5 truncate text-[12px] font-semibold text-forest">{value}</p>
    </div>
  );
}
