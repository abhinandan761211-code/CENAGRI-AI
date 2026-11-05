import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Loader2, X } from "lucide-react";

/**
 * Presentational primitives for the admin panel.
 *
 * One card, one table, one dialog — shared by all 20 modules so the panel reads
 * as one product. Palette follows the Kalika identity:
 *   forest #0F3D2E · primary #16A34A · tint #DCFCE7 · page #F8FAFC · ink #172033
 */

export const FOREST = "#0F3D2E";
export const PRIMARY = "#16A34A";
export const TINT = "#DCFCE7";

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  violet: "bg-violet-50 text-violet-700",
  sky: "bg-sky-50 text-sky-700",
} as const;

export type Tone = keyof typeof TONES;

/** Map an arbitrary status string to a stable colour. */
export function toneFor(value: string): Tone {
  const v = value.toLowerCase();
  if (["active", "approved", "published", "delivered", "resolved", "sent", "ok", "healthy"].includes(v)) return "green";
  if (["pending", "scheduled", "waiting_user", "review", "in_progress", "open", "warning"].includes(v)) return "amber";
  if (["suspended", "blocked", "rejected", "cancelled", "failed", "downtime", "urgent", "removed"].includes(v)) return "rose";
  if (["draft", "archived", "closed"].includes(v)) return "neutral";
  return "sky";
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "green",
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight" style={{ color: FOREST }}>
        {loading ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-slate-100" /> : value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  flush,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Remove body padding — used when the child is a table that owns its edges. */
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            {title && (
              <h2 className="font-display text-sm font-bold" style={{ color: FOREST }}>
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Empty({ icon: Icon, title, description, action }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full" style={{ background: TINT, color: FOREST }}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold" style={{ color: FOREST }}>{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        Something went wrong
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-rose-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-[11px] font-bold text-rose-800 underline">
          Try again
        </button>
      )}
    </div>
  );
}

/** "Not available" — for a table that this deployment has not installed yet. */
export function NotAvailable({ what }: { what: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
      {what} is not enabled on this deployment.
    </p>
  );
}

/** Render a nullable counter without turning "unknown" into a false zero. */
export function Num({ value, fallback = "—" }: { value: number | null | undefined; fallback?: string }) {
  if (value === null || value === undefined) return <span className="text-slate-400">{fallback}</span>;
  return <>{value.toLocaleString("en-IN")}</>;
}

// ── form controls ─────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
      )}
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
  icon: Icon,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
  icon?: LucideIcon;
}) {
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  } as const;
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${rest.className ?? ""}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/**
 * Modal with a focus trap and Escape-to-close.
 *
 * Sensitive actions render through this so a confirmation cannot be missed and
 * a stray backdrop click cannot be mistaken for "confirm".
 */
export function Dialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !ref.current) return;
      const focusable = ref.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const firstInput = ref.current?.querySelector<HTMLElement>("input, textarea, button");
    firstInput?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={ref}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-bold" style={{ color: FOREST }}>{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ── table ─────────────────────────────────────────────────────────────────

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-slate-100 last:border-0 ${onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}`}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-2.5 align-middle text-[12.5px] text-slate-700 ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number | null;
  onPage: (page: number) => void;
}) {
  const pages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
      <p className="text-[11px] text-slate-500">
        {total === null ? "Paged results" : `${total.toLocaleString("en-IN")} total`} · page {page}
        {pages ? ` of ${pages}` : ""}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="ghost" disabled={pages !== null && page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** A tiny inline bar chart — no charting dependency, readable at any width. */
export function Sparkbars({ points, color = PRIMARY }: { points: { day: string; count: number }[]; color?: string }) {
  if (points.length === 0) return <p className="py-8 text-center text-[11px] text-slate-400">No data for this range.</p>;
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]" role="img" aria-label="Daily series">
        {points.map((point) => (
          <div
            key={point.day}
            title={`${point.day}: ${point.count}`}
            className="min-w-[3px] flex-1 rounded-t"
            style={{ height: `${Math.max(2, (point.count / max) * 100)}%`, backgroundColor: color, opacity: 0.85 }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{points[0]?.day}</span>
        <span>peak {max}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}
