import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleDot,
  Clock,
  MapPin,
  Package,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Weight,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_STYLE,
  INVOICE_STATUS_STYLE,
  VEHICLE_TYPES,
  formatDate,
  formatINR,
  formatTime,
  formatWeight,
} from "@/lib/transporter";
import type {
  BookingStatus,
  InvoiceStatus,
  TransportRequest,
  VehicleType,
} from "@/lib/transporter";

/**
 * Transporter-specific pieces the shared UI kit does not cover.
 *
 * Everything generic (Panel, StatCard, Modal, Field, EmptyState) is imported
 * from `components/retailer/ui` — one design system for every account.
 */

/* ── Status pills ──────────────────────────────────────────────────────── */

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const style = BOOKING_STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {BOOKING_STATUS_LABEL[status]}
    </span>
  );
}

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold ${INVOICE_STATUS_STYLE[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function VerificationBadge({
  verification,
}: {
  verification: "not_submitted" | "pending" | "verified" | "rejected";
}) {
  if (verification === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
        <ShieldCheck className="h-3.5 w-3.5" /> Verified transporter
      </span>
    );
  }
  if (verification === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
        <Clock className="h-3.5 w-3.5" /> Verification under review
      </span>
    );
  }
  if (verification === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800">
        <ShieldAlert className="h-3.5 w-3.5" /> Verification rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
      <ShieldAlert className="h-3.5 w-3.5" /> Not verified
    </span>
  );
}

/* ── Request card ──────────────────────────────────────────────────────── */

/**
 * One transport request in a list.
 *
 * Distance is shown only when the requester actually provided coordinates —
 * an unknown distance renders "—", never an invented number.
 */
export function RequestCard({
  request,
  offered,
  footer,
}: {
  request: TransportRequest;
  offered?: boolean;
  footer?: ReactNode;
}) {
  const weight = Number(request.weight_kg ?? request.load_kg ?? 0);
  const price = request.offered_price_inr;

  return (
    <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-brand-700">
            {request.cargo_type ?? "Cargo"}
            {request.commodity ? ` · ${request.commodity}` : ""}
          </p>
          <h3 className="mt-0.5 line-clamp-2 font-display text-[14.5px] font-bold leading-snug text-forest">
            {request.title ?? `${request.pickup} → ${request.dropoff}`}
          </h3>
        </div>
        <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-right">
          {price != null ? (
            <>
              <span className="block text-[13px] font-extrabold text-emerald-800">
                {formatINR(Number(price))}
              </span>
              <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
                {request.price_type === "fixed" ? "fixed" : "offered"}
              </span>
            </>
          ) : (
            <>
              <span className="block text-[11.5px] font-extrabold text-slate-700">Open</span>
              <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">
                quote
              </span>
            </>
          )}
        </span>
      </div>

      {/* Route */}
      <div className="mt-3 space-y-1.5">
        <p className="flex items-start gap-1.5 text-[11.5px] text-slate-600">
          <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="min-w-0 truncate">
            <span className="font-semibold text-slate-700">{request.pickup}</span>
            {request.pickup_district ? `, ${request.pickup_district}` : ""}
          </span>
        </p>
        <p className="flex items-start gap-1.5 text-[11.5px] text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <span className="min-w-0 truncate">
            <span className="font-semibold text-slate-700">{request.dropoff}</span>
            {request.dropoff_district ? `, ${request.dropoff_district}` : ""}
          </span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <Weight className="h-3.5 w-3.5 text-slate-400" /> {formatWeight(weight || null)}
        </span>
        <span className="flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5 text-slate-400" />
          {request.vehicle_type ?? "Any vehicle"}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
          {request.pickup_on ? formatDate(request.pickup_on) : "Flexible"}
        </span>
        <span className="flex items-center gap-1.5">
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          {request.distance_km != null ? `${request.distance_km} km` : "Distance n/a"}
        </span>
      </div>

      {(request.needs_loading_help || request.needs_unloading_help) && (
        <p className="mt-2 flex flex-wrap gap-1">
          {request.needs_loading_help && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              Loading help needed
            </span>
          )}
          {request.needs_unloading_help && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              Unloading help needed
            </span>
          )}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
        <span className="truncate font-semibold text-slate-700">
          {request.requester_name ?? "Requester"}
        </span>
        {request.requester_role && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-600">
            {request.requester_role}
          </span>
        )}
        {request.requester_verified && (
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Verified requester" />
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          to={`/transporter/requests/${request.id}`}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          View details
        </Link>
        {footer ?? (
          <Link
            to={`/transporter/requests/${request.id}`}
            className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-[11.5px] font-semibold text-white transition ${
              offered ? "pointer-events-none bg-slate-300" : "bg-brand-700 hover:bg-brand-800"
            }`}
          >
            {offered ? "Quoted" : "Quote"}
          </Link>
        )}
      </div>
    </article>
  );
}

export function RequestGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

/* ── Compliance alert ──────────────────────────────────────────────────── */

const ALERT_LABEL = {
  insurance: "Insurance",
  fitness: "Fitness certificate",
  permit: "Permit",
  service: "Service",
} as const;

/** Expired / expiring documents on a vehicle, as a compact warning row. */
export function VehicleAlertLine({
  alerts,
}: {
  alerts: { kind: keyof typeof ALERT_LABEL; days: number }[];
}) {
  if (alerts.length === 0) return null;
  return (
    <ul className="space-y-1">
      {alerts.map((alert) => {
        const expired = alert.days < 0;
        return (
          <li
            key={alert.kind}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold ${
              expired ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {ALERT_LABEL[alert.kind]}{" "}
            {expired ? `expired ${Math.abs(alert.days)} days ago` : `expires in ${alert.days} days`}
          </li>
        );
      })}
    </ul>
  );
}

/* ── Section heading ───────────────────────────────────────────────────── */

export function SectionHeading({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-forest">
          {Icon && <Icon className="h-4 w-4 text-brand-700" />}
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Trip progress (manual, no map) ────────────────────────────────────── */

const STAGE_ORDER: BookingStatus[] = [
  "accepted",
  "confirmed",
  "vehicle_assigned",
  "driver_assigned",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "delivered",
  "completed",
];

/**
 * The trip's stage as a simple step rail.
 *
 * This is the "manual tracking" the brief allows when no GPS integration is
 * configured: it reports the status someone actually set, and the time it was
 * set — never a position we do not have.
 */
export function TripProgressRail({ status }: { status: BookingStatus }) {
  const currentIndex = STAGE_ORDER.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STAGE_ORDER.map((stage, index) => {
        const done = currentIndex >= index && currentIndex !== -1;
        const isCurrent = currentIndex === index;
        return (
          <li key={stage} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isCurrent
                  ? "bg-brand-700 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {BOOKING_STATUS_LABEL[stage]}
            </span>
            {index < STAGE_ORDER.length - 1 && (
              <span className={`h-px w-3 ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Empty-state illustration for the tracking page ────────────────────── */

export function NoTrackingNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        <strong className="font-bold text-forest">Live position is not available.</strong> GPS is only
        recorded when a driver explicitly turns tracking on for an active trip. Until then this page
        shows the status and timestamps you set — it never estimates a location, distance or arrival
        time.
      </span>
    </div>
  );
}

/* ── Vehicle type options, re-exported for forms ───────────────────────── */

export { VEHICLE_TYPES };
export type { VehicleType };

export function PickupTimeLabel({ time }: { time: string | null }) {
  return <span className="tabular-nums">{formatTime(time)}</span>;
}

export function PackageLine({ request }: { request: TransportRequest }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
      <Package className="h-3.5 w-3.5 text-slate-400" />
      {request.quantity ?? formatWeight(Number(request.weight_kg ?? request.load_kg ?? 0) || null)}
    </span>
  );
}
