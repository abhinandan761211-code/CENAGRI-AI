import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared farmer UI primitives.
 *
 * Every farmer page is built from these blocks so the account reads as ONE
 * product: the same page frame (title + description + primary action),
 * breadcrumb, card, table, form field, empty/loading/error state and modal.
 * They are deliberately light-theme only — the global account palette is
 * applied by `.acct-root` in `account.css` / `farmer.css`, so nothing here
 * introduces a second colour system.
 */

/* ── Page frame ───────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Primary action first, secondary after. */
  actions?: ReactNode;
  /** Small chips under the description — location, "live data", counts. */
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
          {Icon && (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 sm:h-9 sm:w-9">
              <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </span>
          )}
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">
            {description}
          </p>
        )}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Small status chip. `tone` maps to the semantic colour of the statement. */
export function Chip({
  children,
  tone = "slate",
  icon: Icon,
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue" | "teal";
  icon?: LucideIcon;
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-rose-200 bg-rose-50 text-rose-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    teal: "border-teal-200 bg-teal-50 text-teal-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/** Marks a number as coming from a live feed (weather, mandi) or from the farmer. */
export function SourceChip({ kind }: { kind: "live" | "manual" | "server" }) {
  const map = {
    live: { label: "Live data", tone: "green" as const },
    manual: { label: "You entered this", tone: "slate" as const },
    server: { label: "Read from CenAGRI server", tone: "blue" as const },
  };
  return <Chip tone={map[kind].tone}>{map[kind].label}</Chip>;
}

/* ── Card ─────────────────────────────────────────────────────────────── */

export function Panel({
  title,
  description,
  icon: Icon,
  action,
  id,
  children,
  className = "",
  bodyClassName = "",
  /** Hides the header border when the child paints its own top edge. */
  flush,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}) {
  return (
    <section id={id} className={`creator-card scroll-mt-24 overflow-hidden ${className}`}>
      {title && (
        <div
          className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${flush ? "" : "border-b border-slate-200"
            }`}
        >
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-bold text-forest">
              {Icon && <Icon className="h-4 w-4 text-brand-700" />}
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A compact statistic tile — value, label, hint and an optional badge. */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "green",
  badge,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: "green" | "teal" | "amber" | "blue" | "violet" | "slate";
  badge?: ReactNode;
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    green: "bg-brand-50 text-brand-700",
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-600",
  };
  const Container = onClick ? "button" : "div";
  return (
    <Container
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`creator-card w-full p-3.5 text-left sm:p-4 ${onClick ? "transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card" : ""
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">
          {label}
        </p>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-8 sm:w-8 ${tones[tone]}`}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
      </div>
      <p className="mt-1.5 truncate text-lg font-extrabold tracking-tight text-forest sm:mt-2 sm:text-2xl">
        {value}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 sm:text-[11px]">
        {hint}
        {badge}
      </div>
    </Container>
  );
}

/* ── States ───────────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-forest">{title}</p>
      {body && (
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{body}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 p-4 ${className}`} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3"
    >
      <p className="min-w-0 text-xs leading-relaxed text-rose-800">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Green confirmation line that fades out of its own accord. */
export function SuccessNote({ message }: { message: string }) {
  return (
    <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
      <p className="text-xs font-semibold text-emerald-800">{message}</p>
    </div>
  );
}

/* ── Forms ────────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 ${props.className ?? ""
        }`}
    />
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`creator-btn-primary h-9 px-3.5 text-xs disabled:opacity-60 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`creator-btn-ghost h-9 px-3.5 text-xs disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Search box with a clear button; used above every list. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100 ${className}`}
    >
      <Search className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="shrink-0 text-slate-400 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────── */

/**
 * Accessible dialog used by every farmer page. Renders as a bottom sheet on
 * phones and a centred card from `sm` up, and locks the page behind it.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so keyboard and screen-reader users land here.
    window.setTimeout(() => ref.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`creator-card relative flex max-h-[92vh] w-full flex-col rounded-t-2xl shadow-xl outline-none sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"
          }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-forest">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-forest"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Table ────────────────────────────────────────────────────────────── */

/**
 * Responsive table: a real `<table>` from `md` up, stacked key/value rows on
 * phones (via the `data-label` attribute each cell sets in `Table`'s children).
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="w-full overflow-x-auto">{children}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>;
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <td className={`border-b border-slate-100 px-3 py-2.5 align-top text-slate-700 ${className}`}>
      {children}
    </td>
  );
}

/* ── Progress ─────────────────────────────────────────────────────────── */

export function ProgressBar({
  value,
  tone = "green",
  label,
}: {
  /** 0–100. */
  value: number;
  tone?: "green" | "amber" | "red" | "teal";
  label?: string;
}) {
  const tones: Record<string, string> = {
    green: "bg-brand-600",
    amber: "bg-amber-500",
    red: "bg-rose-500",
    teal: "bg-teal-500",
  };
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Section link ─────────────────────────────────────────────────────── */

export function ViewAll({ onClick, label = "View all" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
    >
      {label} <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

/* ── Toast ────────────────────────────────────────────────────────────── */

/**
 * Tiny self-dismissing success toast. Pages keep one `toast` string in state
 * and clear it after a save; this component handles the timeout and animation.
 */
export function useToast(ms = 2600) {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(id);
  }, [toast, ms]);
  return { toast, showToast: setToast, clearToast: () => setToast(null) };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-forest px-4 py-2 text-xs font-semibold text-white shadow-lg sm:bottom-6"
    >
      {message}
    </div>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────── */

export const inr = (value: number | null | undefined, opts?: { compact?: boolean }) => {
  if (value == null || Number.isNaN(value)) return "—";
  if (opts?.compact) {
    if (Math.abs(value) >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
    if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  }
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

export const num = (value: number | null | undefined, digits = 1) =>
  value == null || Number.isNaN(value) ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: digits });

export const shortDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const relativeDays = (iso: string | null | undefined) => {
  if (!iso) return "";
  const then = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.round((then - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
};
