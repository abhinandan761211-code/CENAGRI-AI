import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  MapPin,
  Package,
  Truck,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { BookingStatusPill } from "@/components/transporter/ui";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  BOOKING_STATUS_LABEL,
  describeTransporterError,
  formatDate,
  formatINR,
  formatTime,
  formatWeight,
  listBookings,
  listMyOffers,
} from "@/lib/transporter";
import type { BookingStatus, TransportBooking, TransportOffer } from "@/lib/transporter";

const TABS: { key: "all" | "pending" | "active" | "done"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "On the road" },
  { key: "done", label: "Finished" },
];

const PENDING: BookingStatus[] = ["accepted", "confirmed", "vehicle_assigned", "driver_assigned"];
const ACTIVE: BookingStatus[] = ["pickup_scheduled", "picked_up", "in_transit"];
const DONE: BookingStatus[] = ["delivered", "completed", "cancelled", "disputed"];

/**
 * My Bookings — the full lifecycle, plus the quotes still waiting for an answer.
 *
 * Nothing here changes a status by itself; opening a booking is where a trip is
 * advanced, because that screen also owns vehicle/driver assignment and proof
 * of delivery.
 */
export default function TransporterBookings() {
  const D = describeTransporterError;
  const [tab, setTab] = useState<"all" | "pending" | "active" | "done">("all");

  const bookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);
  const offers = useWorkerData<TransportOffer[]>(() => listMyOffers(), [], D);

  const rows = bookings.data ?? [];
  const pendingOffers = useMemo(
    () => (offers.data ?? []).filter((o) => o.status === "pending"),
    [offers.data]
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    map.set("all", rows.length);
    map.set("pending", rows.filter((b) => PENDING.includes(b.status)).length);
    map.set("active", rows.filter((b) => ACTIVE.includes(b.status)).length);
    map.set("done", rows.filter((b) => DONE.includes(b.status)).length);
    return map;
  }, [rows]);

  const visible = rows.filter((b) => {
    if (tab === "all") return true;
    if (tab === "pending") return PENDING.includes(b.status);
    if (tab === "active") return ACTIVE.includes(b.status);
    return DONE.includes(b.status);
  });

  const failed = bookings.state === "error" ? bookings : null;

  return (
    <TransporterLayout
      title="My Bookings"
      subtitle={`${rows.length} booking${rows.length === 1 ? "" : "s"} · ${pendingOffers.length} quote${pendingOffers.length === 1 ? "" : "s"
        } awaiting a response`}
      action={
        <Link
          to={TRANSPORTER_ROUTES.requests}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Package className="h-3.5 w-3.5" /> Find requests
        </Link>
      }
    >
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}

      {/* Quotes awaiting a decision */}
      {pendingOffers.length > 0 && (
        <Panel title="Quotes awaiting response" description="You offered a price — the requester has not answered yet">
          <ul className="divide-y divide-slate-100">
            {pendingOffers.slice(0, 5).map((offer) => (
              <li key={offer.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-forest">
                    {offer.request?.title ?? "Transport request"}
                  </p>
                  <p className="truncate text-[10.5px] text-slate-500">
                    {offer.request ? `${offer.request.pickup} → ${offer.request.dropoff}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] font-bold text-emerald-800">
                  {formatINR(Number(offer.price_inr))}
                </span>
                <Link
                  to={`${TRANSPORTER_ROUTES.requests}/${offer.request_id}`}
                  className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${tab === key
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
          >
            {label}
            <span className={`ml-1.5 text-[10px] ${tab === key ? "text-white/70" : "text-slate-400"}`}>
              {counts.get(key) ?? 0}
            </span>
          </button>
        ))}
      </div>

      {(bookings.state === "loading" || offers.state === "loading") && <Loading label="Loading bookings…" />}

      {bookings.state === "ready" && visible.length === 0 && (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title={rows.length === 0 ? "No bookings yet" : "Nothing in this tab"}
            description={
              rows.length === 0
                ? "Send a quote on an open transport request. When the requester accepts it, the booking appears here with the whole trip lifecycle."
                : "Try another tab above."
            }
            action={
              rows.length === 0 ? (
                <Link
                  to={TRANSPORTER_ROUTES.requests}
                  className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                >
                  Find transport requests
                </Link>
              ) : undefined
            }
          />
        </div>
      )}

      {bookings.state === "ready" && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((booking) => (
            <Panel
              key={booking.id}
              title={booking.title}
              description={`${booking.requester_name ?? "Requester"}${booking.requester_role ? ` · ${booking.requester_role}` : ""}`}
              action={<BookingStatusPill status={booking.status} />}
            >
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                  <span className="flex items-center gap-1.5 font-semibold text-forest">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                    {booking.pickup}
                  </span>
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                  <span className="flex items-center gap-1.5 font-semibold text-forest">
                    <MapPin className="h-3.5 w-3.5 text-rose-500" />
                    {booking.dropoff}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Cell
                    icon={CalendarDays}
                    label="Pickup"
                    value={
                      booking.pickup_on
                        ? `${formatDate(booking.pickup_on)}${booking.pickup_time ? ` · ${formatTime(booking.pickup_time)}` : ""}`
                        : "Not set"
                    }
                  />
                  <Cell icon={Package} label="Cargo" value={formatWeight(Number(booking.weight_kg ?? 0) || null)} />
                  <Cell
                    icon={Truck}
                    label="Vehicle"
                    value={booking.vehicle_registration ?? booking.vehicle_type ?? "Not assigned"}
                  />
                  <Cell icon={UserRound} label="Driver" value={booking.driver_name ?? "Not assigned"} />
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[12.5px] font-extrabold text-forest">
                    {formatINR(Number(booking.agreed_price_inr))}
                  </span>
                  {booking.invoice_status && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      Invoice {booking.invoice_status}
                    </span>
                  )}
                  <span className="ml-auto flex gap-2">
                    <Link
                      to={`${TRANSPORTER_ROUTES.trips}/${booking.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-3 text-[11.5px] font-semibold text-white hover:bg-brand-800"
                    >
                      {ACTIVE.includes(booking.status) || PENDING.includes(booking.status)
                        ? "Manage trip"
                        : "View trip"}
                    </Link>
                    <Link
                      to={TRANSPORTER_ROUTES.messages}
                      className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Message
                    </Link>
                  </span>
                </div>

                <p className="mt-2 text-[10.5px] text-slate-400">
                  {BOOKING_STATUS_LABEL[booking.status]} · booked {formatDate(booking.created_at)}
                </p>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </TransporterLayout>
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
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-0.5 truncate text-[12px] font-semibold text-forest">{value}</p>
    </div>
  );
}
