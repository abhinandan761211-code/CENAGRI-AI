import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  Clock,
  MapPin,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/retailer/ui";
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_STYLE,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_STYLE,
  EARNING_STATUS_STYLE,
  durationLabel,
  formatDate,
  formatINR,
  startLabel,
  WORK_TYPE_LABEL,
} from "@/lib/worker";
import type {
  ApplicationStatus,
  AssignmentStatus,
  EarningStatus,
  JobListing,
  WorkerProfile,
} from "@/lib/worker";

/**
 * Worker-specific pieces that the shared UI kit does not cover.
 *
 * Everything generic (Panel, StatCard, Badge, EmptyState, Modal, Field) is
 * imported from `components/retailer/ui` rather than re-created here — one
 * design system for every account, as the shared-design brief requires.
 */

/* ── Verification & availability ───────────────────────────────────────── */

export type VerificationState = "unverified" | "phone" | "verified";

/**
 * What the badge should say. Identity verification comes from the admin KYC
 * workflow; a worker who has only confirmed a phone is not "verified".
 */
export function verificationState(profile: WorkerProfile | null): VerificationState {
  if (!profile) return "unverified";
  if (profile.identity_status === "verified") return "verified";
  if (profile.phone_verified) return "phone";
  return "unverified";
}

export function VerificationBadge({ profile }: { profile: WorkerProfile | null }) {
  const state = verificationState(profile);
  if (state === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
        <BadgeCheck className="h-3.5 w-3.5" /> Verified worker
      </span>
    );
  }
  if (state === "phone") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
        <ShieldAlert className="h-3.5 w-3.5" /> Phone verified
      </span>
    );
  }
  return (
    <Link
      to="/worker/profile"
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200"
    >
      <ShieldAlert className="h-3.5 w-3.5" /> Not verified
    </Link>
  );
}

export function AvailabilityBadge({ profile }: { profile: WorkerProfile | null }) {
  const open = profile?.is_open_to_work ?? true;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        open ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-slate-400"}`} />
      {open ? "Available for work" : "Not taking work"}
    </span>
  );
}

/** Circular 0–100 completion ring used in the welcome panel. */
export function CompletionRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative grid h-[68px] w-[68px] shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="h-[68px] w-[68px] -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="#16a34a"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-xs font-extrabold text-forest">{clamped}%</span>
    </div>
  );
}

/* ── Status pills ──────────────────────────────────────────────────────── */

export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold ${APPLICATION_STATUS_STYLE[status]}`}
    >
      {APPLICATION_STATUS_LABEL[status]}
    </span>
  );
}

export function AssignmentStatusPill({ status }: { status: AssignmentStatus }) {
  const style = ASSIGNMENT_STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {ASSIGNMENT_STATUS_LABEL[status]}
    </span>
  );
}

export function EarningStatusPill({ status }: { status: EarningStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold ${EARNING_STATUS_STYLE[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ── Rating ────────────────────────────────────────────────────────────── */

export function StarRating({ value, size = "sm" }: { value: number | null; size?: "sm" | "md" }) {
  const stars = Math.round(Number(value ?? 0));
  const cls = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${Number(value ?? 0).toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 20 20"
          className={`${cls} ${n <= stars ? "text-amber-400" : "text-slate-300"}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  );
}

/* ── Job card ──────────────────────────────────────────────────────────── */

/**
 * One job in a list. Used by the discovery grid and by "recommended" rails so
 * the same job never looks different in two places.
 *
 * `distance` is passed in only when the browser actually knows the worker's
 * location — we never render an invented number.
 */
export function JobCard({
  job,
  distance,
  applied,
  footer,
}: {
  job: JobListing;
  distance?: number | null;
  applied?: boolean;
  footer?: ReactNode;
}) {
  const slotsLeft = Math.max(0, job.workers_needed - job.workers_hired);
  const isFull = slotsLeft === 0 || job.status === "filled";

  return (
    <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-brand-700">
            {job.category}
          </p>
          <h3 className="mt-0.5 line-clamp-2 font-display text-[15px] font-bold leading-snug text-forest">
            {job.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-right">
          <span className="block text-[13px] font-extrabold text-emerald-800">
            {formatINR(Number(job.wage_inr))}
          </span>
          <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
            {job.pay_type === "daily" ? "per day" : "fixed"}
          </span>
        </span>
      </div>

      <p className="mt-2 flex items-center gap-1.5 truncate text-[11.5px] text-slate-500">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        {[job.village, job.district].filter(Boolean).join(", ")}
        {distance != null && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
            {distance} km
          </span>
        )}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-400" /> {durationLabel(job)}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-slate-400" /> {slotsLeft} of {job.workers_needed} left
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> {formatDate(job.start_date)}
        </span>
        <span className="flex items-center gap-1.5">
          <Banknote className="h-3.5 w-3.5 text-slate-400" /> {WORK_TYPE_LABEL[job.work_type]}
        </span>
      </div>

      {job.required_skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {job.required_skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
            >
              {skill}
            </span>
          ))}
          {job.required_skills.length > 3 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              +{job.required_skills.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
        <span className="truncate font-semibold text-slate-700">{job.employer_name}</span>
        {job.employer_verified && (
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Verified employer" />
        )}
        <span className="ml-auto shrink-0 text-[10.5px] font-semibold text-slate-400">
          {startLabel(job.start_date)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          to={`/worker/jobs/${job.id}`}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          View details
        </Link>
        {footer ?? (
          <Link
            to={`/worker/jobs/${job.id}`}
            className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-[11.5px] font-semibold text-white transition ${
              applied || isFull
                ? "pointer-events-none bg-slate-300"
                : "bg-brand-700 hover:bg-brand-800"
            }`}
          >
            {applied ? "Applied" : isFull ? "Full" : "Apply"}
          </Link>
        )}
      </div>
    </article>
  );
}

/* ── Job list wrapper ──────────────────────────────────────────────────── */

/** Grid that keeps one column on phones and breathes on large screens. */
export function JobGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

/* ── Section heading ───────────────────────────────────────────────────── */

export function SectionHeading({
  icon: Icon,
  title,
  action,
  hint,
}: {
  icon?: LucideIcon;
  title: string;
  action?: ReactNode;
  hint?: string;
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

/* ── Demo-data banner ──────────────────────────────────────────────────── */

/**
 * Shown when a screen is running on sample data because no rows exist yet.
 * The brief is explicit that demo data must never look live, so every screen
 * that falls back to it says so in the UI, in one consistent place.
 */
export function DemoNotice({ what }: { what: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <strong className="font-bold">Sample data.</strong> {what} — nothing real is shown here yet.
        Once live jobs/payments exist, this notice disappears and real values appear.
      </span>
    </div>
  );
}

export { Badge };

/** Convenience: join the location parts a worker profile may have. */
export function useLocationLine(profile: WorkerProfile | null): string {
  return useMemo(
    () => [profile?.village, profile?.district, profile?.state].filter(Boolean).join(", "),
    [profile]
  );
}
