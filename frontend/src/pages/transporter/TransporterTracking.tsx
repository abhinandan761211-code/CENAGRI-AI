import { useEffect, useMemo, useState } from "react";
import {
  CircleDot,
  Clock,
  Info as InfoIcon,
  LocateFixed,
  MapPin,
  Navigation,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import {
  BookingStatusPill,
  NoTrackingNotice,
  TripProgressRail,
} from "@/components/transporter/ui";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  ACTIVE_BOOKING_STATUSES,
  describeTransporterError,
  distanceKm,
  formatDate,
  formatDateTime,
  formatTime,
  listBookings,
  reportLocation,
} from "@/lib/transporter";
import type { TransportBooking } from "@/lib/transporter";

/**
 * Live tracking — manual only.
 *
 * There is NO map and NO GPS polling by default, by decision. This page shows
 * what is actually known: the trip status someone set, the timestamps, and — if
 * a driver has explicitly enabled device reporting for this trip — the last
 * reported position with its own timestamp.
 *
 * It never estimates a location, a route distance or an arrival time. Where a
 * value is unknown it says so.
 */
export default function TransporterTracking() {
  const D = describeTransporterError;
  const bookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number; at: string } | null>(null);

  const active = useMemo(
    () => (bookings.data ?? []).filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)),
    [bookings.data]
  );

  const selected = active.find((b) => b.id === selectedId) ?? active[0] ?? null;

  // Switching trips must not carry over another trip's position.
  useEffect(() => {
    setLastFix(null);
    setSharing(false);
    setShareError("");
  }, [selectedId]);

  async function startSharing() {
    if (!selected) return;
    if (!navigator.geolocation) {
      setShareError("This device does not support location sharing.");
      return;
    }
    setShareError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await reportLocation(selected.id, pos.coords.latitude, pos.coords.longitude);
          setLastFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            at: new Date().toISOString(),
          });
          setSharing(true);
        } catch (err) {
          setShareError(D(err));
        }
      },
      (err) =>
        setShareError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. You can still update the trip status manually."
            : "Could not get a location fix. Try again when you have signal."
        ),
      { timeout: 15_000, maximumAge: 0 }
    );
  }

  /**
   * Straight-line distance from the last reported fix to the destination.
   * Both ends must be known: a booking whose request coordinates are not on
   * file yields null and the page says the distance is unknown.
   */
  const routeDistance =
    lastFix && selected
      ? distanceKm(
        { lat: lastFix.lat, lng: lastFix.lng },
        {
          lat: selected.request_dropoff_lat ?? null,
          lng: selected.request_dropoff_lng ?? null,
        }
      )
      : null;

  return (
    <TransporterLayout
      title="Live Tracking"
      subtitle="Manual status and consented location — no map, no estimates"
    >
      <NoTrackingNotice />

      {bookings.state === "loading" && <Loading label="Loading trips…" />}
      {bookings.state === "error" && <ErrorNotice message={bookings.error} onRetry={bookings.reload} />}

      {bookings.state === "ready" && active.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Navigation}
            title="No trip is on the road"
            description="Tracking becomes available once a trip is picked up. Update a trip's status from Active Trips to start it."
            action={
              <Link
                to={TRANSPORTER_ROUTES.trips}
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Go to Active Trips
              </Link>
            }
          />
        </div>
      )}

      {bookings.state === "ready" && active.length > 0 && selected && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* Trip picker */}
            <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
              {active.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => setSelectedId(trip.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${selected.id === trip.id
                      ? "bg-brand-700 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                >
                  {trip.title}
                </button>
              ))}
            </div>

            <Panel
              title={selected.title}
              description={`${selected.requester_name ?? "Requester"} · ${selected.vehicle_registration ?? "No vehicle"}`}
              action={<BookingStatusPill status={selected.status} />}
            >
              <div className="space-y-4 p-4 sm:p-5">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <CircleDot className="h-4 w-4 text-emerald-600" />
                      <span className="my-0.5 h-10 w-px bg-slate-200" />
                      <MapPin className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Pickup
                        </p>
                        <p className="text-[12.5px] font-semibold text-forest">{selected.pickup}</p>
                        <p className="text-[10.5px] text-slate-500">
                          {selected.pickup_on
                            ? `${formatDate(selected.pickup_on)}${selected.pickup_time ? ` · ${formatTime(selected.pickup_time)}` : ""}`
                            : "Date not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Destination
                        </p>
                        <p className="text-[12.5px] font-semibold text-forest">{selected.dropoff}</p>
                        <p className="text-[10.5px] text-slate-500">
                          {selected.actual_delivery_at
                            ? `Delivered ${formatDateTime(selected.actual_delivery_at)}`
                            : "Not delivered yet"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Trip stage
                  </p>
                  <TripProgressRail status={selected.status} />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Info
                    icon={Clock}
                    label="Last status change"
                    value={formatDateTime(selected.actual_delivery_at ?? selected.created_at)}
                  />
                  <Info
                    icon={Truck}
                    label="Distance"
                    value={selected.distance_km != null ? `${selected.distance_km} km` : "Not provided"}
                  />
                  <Info
                    icon={LocateFixed}
                    label="Last position"
                    value={
                      lastFix
                        ? `${lastFix.lat.toFixed(4)}, ${lastFix.lng.toFixed(4)}`
                        : "Not shared"
                    }
                  />
                </div>

                {routeDistance != null ? (
                  <p className="text-[10.5px] text-slate-500">
                    {routeDistance} km in a straight line from the last reported position to the
                    destination. Road distance is not estimated.
                  </p>
                ) : (
                  lastFix && (
                    <p className="text-[10.5px] text-slate-500">
                      Distance to the destination is not shown — the requester did not put delivery
                      coordinates on this request, so it is not guessed.
                    </p>
                  )
                )}

                {/* Manual controls */}
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Share this trip's position
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                    Only while you are on this trip. Nothing is shared before you press the button, and
                    nothing is collected outside an active trip.
                  </p>
                  <button
                    type="button"
                    onClick={() => void startSharing()}
                    className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-[11.5px] font-semibold text-white hover:bg-brand-800"
                  >
                    <LocateFixed className="h-3.5 w-3.5" />
                    {sharing ? "Update my position" : "Share my position once"}
                  </button>
                  {sharing && (
                    <p className="mt-1.5 text-[10.5px] font-semibold text-emerald-700">
                      Position shared{lastFix ? ` at ${formatDateTime(lastFix.at)}` : ""}.
                    </p>
                  )}
                  {shareError && (
                    <p className="mt-1.5 text-[10.5px] font-semibold text-amber-700">{shareError}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Link
                    to={`${TRANSPORTER_ROUTES.trips}/${selected.id}`}
                    className="inline-flex h-8 items-center rounded-lg bg-brand-700 px-3 text-[11.5px] font-semibold text-white hover:bg-brand-800"
                  >
                    Update trip status
                  </Link>
                  <Link
                    to={TRANSPORTER_ROUTES.messages}
                    className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Message requester
                  </Link>
                </div>
              </div>
            </Panel>
          </div>

          <aside className="space-y-4">
            <Panel title="How tracking works" description="What this page can and cannot show">
              <ul className="space-y-2 p-4 text-[11px] leading-relaxed text-slate-600">
                <li className="flex gap-1.5">
                  <InfoIcon className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  Map and route drawing are not enabled in this build, so no position is plotted on a
                  map.
                </li>
                <li className="flex gap-1.5">
                  <InfoIcon className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  Arrival time is not estimated. Only the pickup and delivery timestamps you set are
                  shown.
                </li>
                <li className="flex gap-1.5">
                  <InfoIcon className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  Position is recorded only on this trip and only when you press share.
                </li>
                <li className="flex gap-1.5">
                  <InfoIcon className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  Requester and transporter can see tracking details; nobody else can.
                </li>
              </ul>
            </Panel>

            <Panel title="On this trip">
              <div className="space-y-2 p-4 text-[11.5px]">
                <Row label="Vehicle" value={selected.vehicle_registration ?? "Not assigned"} />
                <Row label="Driver" value={selected.driver_name ?? "Not assigned"} />
                <Row label="Cargo" value={selected.commodity ?? selected.cargo_type ?? "—"} />
              </div>
            </Panel>
          </aside>
        </div>
      )}
    </TransporterLayout>
  );
}

function Info({
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
      <p className="mt-0.5 truncate text-[11.5px] font-semibold text-forest">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-semibold text-forest">{value}</span>
    </div>
  );
}
