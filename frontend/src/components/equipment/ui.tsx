import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Info,
  Lock,
  MapPinOff,
  Tractor,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  BOOKING_LABEL,
  BOOKING_STYLE,
  EQUIPMENT_STATUS_LABEL,
  EQUIPMENT_STATUS_STYLE,
  PAYMENT_LABEL,
  PAYMENT_STYLE,
  VERIFICATION_LABEL,
} from "@/lib/equipment";
import type {
  BookingStatus,
  EquipmentStatus,
  InvoiceStatus,
  PaymentStatus,
  VerificationState,
} from "@/lib/equipment";

/* ── Status pills ──────────────────────────────────────────────────────── */

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const style = BOOKING_STYLE[status] ?? BOOKING_STYLE.requested;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {BOOKING_LABEL[status] ?? status}
    </span>
  );
}

export function EquipmentStatusPill({ status }: { status: EquipmentStatus }) {
  const style = EQUIPMENT_STATUS_STYLE[status] ?? EQUIPMENT_STATUS_STYLE.available;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {EQUIPMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${PAYMENT_STYLE[status] ?? PAYMENT_STYLE.pending}`}
    >
      {PAYMENT_LABEL[status] ?? status}
    </span>
  );
}

const INVOICE_STYLE: Record<InvoiceStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  refunded: "bg-slate-100 text-slate-600",
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${INVOICE_STYLE[status] ?? INVOICE_STYLE.pending}`}
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

/* ── Honest notices ────────────────────────────────────────────────────── */

/**
 * The rental module has no live GPS. Saying so explicitly is the difference
 * between "we do not know where the tractor is" and a made-up dot on a map.
 */
export function NoTrackingNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
      <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        There is <strong className="font-bold text-slate-700">no live GPS tracking</strong> in this
        module. Location is what you set for each machine and what the booking status records — nothing
        here is plotted, estimated or tracked between jobs.
      </span>
    </div>
  );
}

export function OperatorPrivacyNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Operator licence and ID documents are private to you. A renter sees only the operator's name and
        phone, and only on their own booking.
      </span>
    </div>
  );
}

export function ConditionTag({ score }: { score: number }) {
  const level = score >= 8 ? "good" : score >= 5 ? "fair" : "poor";
  const style =
    level === "good"
      ? "bg-emerald-100 text-emerald-800"
      : level === "fair"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  const label = level === "good" ? "Good" : level === "fair" ? "Fair" : "Needs work";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style}`}>
      {label} · {score}/10
    </span>
  );
}

/* ── Layout helpers ────────────────────────────────────────────────────── */

export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2">
      <h2 className="font-display text-[15px] font-bold text-forest">{title}</h2>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

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

/** Equipment card used on the grid and the dashboard. */
export function EquipmentCard({
  title,
  category,
  status,
  condition,
  location,
  onOpen,
  footer,
}: {
  title: string;
  category: string | null;
  status: EquipmentStatus;
  condition: number;
  location: string | null;
  onOpen?: () => void;
  footer?: ReactNode;
}) {
  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className="truncate text-left text-[13.5px] font-bold text-forest hover:underline"
          >
            {title}
          </button>
          <p className="truncate text-[10.5px] text-slate-500">{category ?? "Uncategorised"}</p>
        </div>
        <EquipmentStatusPill status={status} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ConditionTag score={condition} />
        {location && (
          <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {location}
          </span>
        )}
      </div>

      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </article>
  );
}

/** Empty state icon used when no machine is registered yet. */
export const EquipmentEmptyIcon = Tractor;
export const CalendarEmptyIcon = CalendarDays;
export const OperatorEmptyIcon = UserRound;
