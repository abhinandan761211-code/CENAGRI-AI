import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Small presentational primitives for the retailer screens. They exist so the
 * dashboard, products, orders, inventory and analytics pages share one card,
 * badge, empty-state and dialog look instead of each inventing its own.
 */

/** Headline number card: label, value, hint and optional trend. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  trend?: { value: number | null; period: string };
  tone?: "brand" | "amber" | "rose" | "violet";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
  } as const;

  const up = trend?.value != null && trend.value >= 0;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-forest">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {trend && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${trend.value == null
                ? "bg-slate-100 text-slate-600"
                : up
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
          >
            {trend.value == null
              ? "No prior data"
              : `${up ? "▲" : "▼"} ${Math.abs(trend.value).toFixed(1)}%`}
          </span>
        )}
        {hint && <p className="text-[11px] leading-snug text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

/** Small pill used for stock, expiry, order status and offer kind. */
export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

/** Section wrapper: titled card with an optional action in the header. */
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-display text-sm font-bold text-forest">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-forest">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return <p className="py-16 text-center text-sm text-slate-500">{label}</p>;
}

/** Inline error with a retry button — used by every screen that loads data. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
      <p className="text-xs font-semibold text-red-700">Could not load this screen</p>
      <p className="mt-1 text-[11px] leading-relaxed text-red-600">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-[11px] font-bold text-red-700 underline">
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Accessible modal. Rendered only when `open`; clicking the backdrop or the ✕
 * closes it. Screens use it for add/edit forms so they never navigate away.
 */
export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-xl2 bg-white p-5 shadow-xl ${wide ? "max-w-2xl" : "max-w-md"
          }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-forest">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/** Labelled form field — keeps every form in the module visually identical. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
        {required && <span className="text-rose-600">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";
