import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  Snowflake,
  Sun,
  Thermometer,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_STYLE,
  INVOICE_STATUS_STYLE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  VERIFICATION_LABEL,
  compactWeight,
  formatWeight,
} from "@/lib/warehouse";
import type { InvoiceStatus, PaymentStatus } from "@/lib/warehouse";
import type {
  ReadingLevel,
  StorageBookingStatus,
  VerificationState,
  WarehouseType,
} from "@/lib/warehouse";

/* ── Status ────────────────────────────────────────────────────────────── */

export function BookingStatusPill({ status }: { status: StorageBookingStatus }) {
  const style = BOOKING_STATUS_STYLE[status] ?? BOOKING_STATUS_STYLE.requested;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {BOOKING_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${PAYMENT_STATUS_STYLE[status] ?? PAYMENT_STATUS_STYLE.pending}`}
    >
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${INVOICE_STATUS_STYLE[status] ?? INVOICE_STATUS_STYLE.pending}`}
    >
      {status}
    </span>
  );
}

const VERIFICATION_STYLE: Record<VerificationState, { badge: string; icon: LucideIcon }> = {
  not_submitted: { badge: "bg-slate-100 text-slate-600", icon: Info },
  pending: { badge: "bg-amber-100 text-amber-800", icon: Info },
  verified: { badge: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  rejected: { badge: "bg-rose-100 text-rose-800", icon: AlertTriangle },
  expired: { badge: "bg-orange-100 text-orange-800", icon: AlertTriangle },
};

export function VerificationBadge({ state }: { state: VerificationState }) {
  const style = VERIFICATION_STYLE[state] ?? VERIFICATION_STYLE.not_submitted;
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${style.badge}`}
    >
      <Icon className="h-3 w-3" /> {VERIFICATION_LABEL[state] ?? state}
    </span>
  );
}

export function WarehouseTypeTag({ type }: { type: WarehouseType | null }) {
  if (!type) return null;
  const isCold = type === "cold" || type === "fruit_veg";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        isCold ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {isCold ? <Snowflake className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
      {isCold ? "Cold" : "Dry"}
    </span>
  );
}

/* ── Capacity ──────────────────────────────────────────────────────────── */

/**
 * Capacity bar.
 *
 * Three segments — occupied, reserved, free — because "full" and "booked but
 * empty" mean very different things to an owner deciding whether to accept a
 * booking.
 */
export function CapacityBar({
  capacityKg,
  reservedKg,
  occupiedKg,
  showLegend = true,
  height = "h-2.5",
}: {
  capacityKg: number;
  reservedKg: number;
  occupiedKg: number;
  showLegend?: boolean;
  height?: string;
}) {
  const capacity = Math.max(Number(capacityKg) || 0, 1);
  const occupied = Math.min(Math.max(Number(occupiedKg) || 0, 0), capacity);
  const reserved = Math.min(Math.max(Number(reservedKg) || 0, 0), capacity - occupied);
  const free = Math.max(capacity - occupied - reserved, 0);

  const pct = (v: number) => `${(v / capacity) * 100}%`;

  return (
    <div>
      <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${height}`}>
        <div className="bg-emerald-600" style={{ width: pct(occupied) }} title={`Occupied ${formatWeight(occupied)}`} />
        <div className="bg-sky-400" style={{ width: pct(reserved) }} title={`Reserved ${formatWeight(reserved)}`} />
      </div>
      {showLegend && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-600" /> Occupied {compactWeight(occupied)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> Reserved {compactWeight(reserved)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-200" /> Free {compactWeight(free)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Occupancy ring used on warehouse cards. */
export function OccupancyRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const colour = clamped >= 95 ? "#e11d48" : clamped >= 80 ? "#f59e0b" : "#16a34a";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-extrabold text-forest">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

/* ── Honest notices ────────────────────────────────────────────────────── */

/**
 * Says out loud that a figure is a manual entry, not a live sensor.
 * Without this the monitoring screen would imply IoT it does not have.
 */
export function ManualReadingNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
      <Thermometer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        These readings are <strong className="font-bold text-slate-700">recorded by hand</strong>. No
        sensor is connected, so nothing here updates on its own — the timestamp on each row is when a
        person entered it.
      </span>
    </div>
  );
}

export function CustodyNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        You are the <strong className="font-bold">custodian</strong> of stored goods, not their owner.
        Every lot keeps its depositor, and stock of two customers is never combined.
      </span>
    </div>
  );
}

export function ReadingLevelTag({ level }: { level: ReadingLevel }) {
  const style =
    level === "critical"
      ? "bg-rose-100 text-rose-800"
      : level === "warning"
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-800";
  const label = level === "critical" ? "Critical" : level === "warning" ? "Warning" : "In range";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style}`}>{label}</span>;
}

/** Section heading used inside pages, matching the other account modules. */
export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2">
      <h2 className="font-display text-[15px] font-bold text-forest">{title}</h2>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/** Small labelled stat used inside panels. */
export function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const colour =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-rose-700"
          : "text-forest";
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-[13px] font-bold ${colour}`}>{value}</p>
    </div>
  );
}

export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="truncate text-right font-semibold text-forest">{value}</span>
    </div>
  );
}
