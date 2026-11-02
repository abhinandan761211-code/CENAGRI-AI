/**
 * Warehouse module — domain types, constants and formatting.
 *
 * A warehouse owner stores OTHER PEOPLE'S produce. That shapes the model:
 * every lot carries a `depositor_id`, and the owner is a custodian, never the
 * owner of the goods. Nothing in this module may merge two depositors' stock.
 *
 * Capacity is in KILOGRAMS everywhere in the database. The UI converts to
 * tonnes / quintals for display only — see `formatWeight` / `toKg`.
 *
 * Authorisation lives in RLS (`database/supabase/warehouse.sql`); these types
 * describe shapes, they never decide access.
 */

/* ── Units ─────────────────────────────────────────────────────────────── */

/** The database stores kg. These are the units a person types in. */
export const QUANTITY_UNITS = ["kg", "quintal", "tonne"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

const UNIT_IN_KG: Record<QuantityUnit, number> = { kg: 1, quintal: 100, tonne: 1000 };

/** Convert a number the user typed into the kg value the database expects. */
export function toKg(value: number, unit: QuantityUnit): number {
  const factor = UNIT_IN_KG[unit] ?? 1;
  return Math.round(value * factor * 100) / 100;
}

/** Convert stored kg back into the unit the user prefers. */
export function fromKg(kg: number | null | undefined, unit: QuantityUnit = "tonne"): number {
  if (kg == null || Number.isNaN(Number(kg))) return 0;
  const factor = UNIT_IN_KG[unit] ?? 1;
  return Math.round((Number(kg) / factor) * 100) / 100;
}

/**
 * Human weight. Always says the unit — "18.4 t", "1,450 kg" — because a number
 * without a unit in a godown dispute is worthless.
 */
export function formatWeight(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(Number(kg))) return "—";
  const n = Number(kg);
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} t`;
  return `${n.toLocaleString("en-IN")} kg`;
}

/** Compact weight for charts and tiles, e.g. "18.4t" / "940kg". */
export function compactWeight(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(Number(kg))) return "—";
  const n = Number(kg);
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}t`;
  return `${Math.round(n)}kg`;
}

/* ── Formatting ────────────────────────────────────────────────────────── */

export function formatINR(value: number, decimals = 0): string {
  return Number(value).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "08:00:00" → "8:00 AM". */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days between two dates; negative when the second is in the past. */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/* ── Warehouse vocabulary ──────────────────────────────────────────────── */

export const WAREHOUSE_TYPES = ["general", "grain", "cold", "fruit_veg", "seed", "other"] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];

export const WAREHOUSE_TYPE_LABEL: Record<WarehouseType, string> = {
  general: "General agricultural warehouse",
  grain: "Grain storage",
  cold: "Cold storage",
  fruit_veg: "Fruit & vegetable storage",
  seed: "Seed storage",
  other: "Other approved storage",
};

/**
 * The legacy `kind` column from features.sql is only 'Dry' | 'Cold'. It is kept
 * in step so the farmer-facing screen never sees an empty value.
 */
export function legacyKind(type: WarehouseType): "Dry" | "Cold" {
  return type === "cold" || type === "fruit_veg" ? "Cold" : "Dry";
}

export const COMMODITY_CATEGORIES = [
  "grain",
  "pulses",
  "oilseed",
  "seed",
  "cold_chain",
  "fruit_veg",
  "inputs",
  "other",
] as const;
export type CommodityCategory = (typeof COMMODITY_CATEGORIES)[number];

export const COMMODITY_LABEL: Record<CommodityCategory, string> = {
  grain: "Grain",
  pulses: "Pulses",
  oilseed: "Oilseed",
  seed: "Seed",
  cold_chain: "Cold chain",
  fruit_veg: "Fruit & vegetables",
  inputs: "Farm inputs",
  other: "Other",
};

/**
 * Which commodities may share a storage section.
 *
 * The rule from the brief is "do not mix incompatible commodities in the same
 * storage area". Grain absorbs odours and cold-chain produce needs a different
 * temperature, so each section holds one category only.
 */
export function sectionsCompatible(a: CommodityCategory, b: CommodityCategory): boolean {
  return a === b;
}

export const FACILITY_OPTIONS = [
  "Power backup",
  "Drying floor",
  "Weighbridge",
  "Fumigation chamber",
  "Moisture meter",
  "Pest control",
  "CCTV",
  "Fire safety",
  "Temperature control",
  "Ventilation",
  "Water supply",
] as const;

export const LOADING_OPTIONS = [
  "Manual labour",
  "Forklift",
  "Trolley / wheelbarrow",
  "Crane / hoist",
  "Loading ramp",
  "Weighbridge at gate",
] as const;

export const SECURITY_OPTIONS = [
  "24x7 guard",
  "CCTV coverage",
  "Boundary wall",
  "Gate register",
  "Fire extinguishers",
  "Night lighting",
] as const;

/* ── Booking lifecycle ─────────────────────────────────────────────────── */

export const STORAGE_BOOKING_STATUSES = [
  "requested",
  "quotation_sent",
  "accepted",
  "confirmed",
  "goods_expected",
  "goods_received",
  "stored",
  "release_requested",
  "partially_released",
  "fully_released",
  "completed",
  "cancelled",
  "disputed",
] as const;
export type StorageBookingStatus = (typeof STORAGE_BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABEL: Record<StorageBookingStatus, string> = {
  requested: "Requested",
  quotation_sent: "Quotation sent",
  accepted: "Accepted",
  confirmed: "Confirmed",
  goods_expected: "Goods expected",
  goods_received: "Goods received",
  stored: "Stored",
  release_requested: "Release requested",
  partially_released: "Partially released",
  fully_released: "Fully released",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export const BOOKING_STATUS_STYLE: Record<StorageBookingStatus, { dot: string; badge: string }> = {
  requested: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  quotation_sent: { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-800" },
  accepted: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  confirmed: { dot: "bg-blue-600", badge: "bg-blue-100 text-blue-800" },
  goods_expected: { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800" },
  goods_received: { dot: "bg-teal-500", badge: "bg-teal-100 text-teal-800" },
  stored: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  release_requested: { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-800" },
  partially_released: { dot: "bg-orange-600", badge: "bg-orange-100 text-orange-800" },
  fully_released: { dot: "bg-lime-600", badge: "bg-lime-100 text-lime-800" },
  completed: { dot: "bg-slate-500", badge: "bg-slate-200 text-slate-700" },
  cancelled: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
  disputed: { dot: "bg-rose-600", badge: "bg-rose-100 text-rose-800" },
};

/**
 * The next legal steps from each status. Mirrors `storage_booking_transition`
 * in warehouse.sql — the database is the authority, this only picks buttons.
 */
export const NEXT_BOOKING_STATUSES: Partial<Record<StorageBookingStatus, StorageBookingStatus[]>> = {
  requested: ["quotation_sent", "accepted", "cancelled"],
  quotation_sent: ["accepted", "cancelled"],
  accepted: ["confirmed", "cancelled"],
  confirmed: ["goods_expected", "cancelled"],
  goods_expected: ["goods_received", "cancelled"],
  goods_received: ["stored", "disputed"],
  stored: ["release_requested", "disputed"],
  release_requested: ["partially_released", "fully_released", "disputed"],
  partially_released: ["partially_released", "fully_released", "disputed"],
  fully_released: ["completed", "disputed"],
  disputed: ["stored", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Statuses where the booking is holding capacity but goods are not in yet. */
export const RESERVING_STATUSES: StorageBookingStatus[] = ["confirmed", "goods_expected"];

/** Statuses where the goods are physically in the warehouse. */
export const IN_STORAGE_STATUSES: StorageBookingStatus[] = [
  "goods_received",
  "stored",
  "release_requested",
  "partially_released",
];

export const PAYMENT_STATUSES = ["pending", "partially_paid", "paid", "refunded", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  partially_paid: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};

export const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  partially_paid: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  refunded: "bg-slate-100 text-slate-600",
  failed: "bg-rose-100 text-rose-800",
};

export const INVOICE_STATUSES = ["pending", "processing", "paid", "failed", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  refunded: "bg-slate-100 text-slate-600",
};

/* ── Verification & documents ──────────────────────────────────────────── */

export const VERIFICATION_STATES = ["not_submitted", "pending", "verified", "rejected", "expired"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  not_submitted: "Not submitted",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
};

export const WAREHOUSE_DOCUMENT_KINDS = [
  "ownership_proof",
  "registration",
  "licence",
  "fire_safety",
  "insurance",
  "storage_certificate",
  "facility_photo",
  "other",
] as const;
export type WarehouseDocumentKind = (typeof WAREHOUSE_DOCUMENT_KINDS)[number];

export const WAREHOUSE_DOCUMENT_LABEL: Record<WarehouseDocumentKind, string> = {
  ownership_proof: "Ownership / authorisation proof",
  registration: "Registration",
  licence: "Licence",
  fire_safety: "Fire safety certificate",
  insurance: "Insurance",
  storage_certificate: "Storage certificate",
  facility_photo: "Facility photograph",
  other: "Other document",
};

/* ── Staff ─────────────────────────────────────────────────────────────── */

export const STAFF_ROLES = ["manager", "operator", "inward", "outward", "inspector", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  manager: "Manager",
  operator: "Warehouse operator",
  inward: "Inward clerk",
  outward: "Outward clerk",
  inspector: "Stock inspector",
  viewer: "View only",
};

/** Default permissions per role — deliberately narrower than the owner. */
export function defaultPermissions(role: StaffRole): {
  can_inward: boolean;
  can_outward: boolean;
  can_inspect: boolean;
  can_manage_pricing: boolean;
} {
  switch (role) {
    case "manager":
      return { can_inward: true, can_outward: true, can_inspect: true, can_manage_pricing: false };
    case "inward":
      return { can_inward: true, can_outward: false, can_inspect: false, can_manage_pricing: false };
    case "outward":
      return { can_inward: false, can_outward: true, can_inspect: false, can_manage_pricing: false };
    case "inspector":
      return { can_inward: false, can_outward: false, can_inspect: true, can_manage_pricing: false };
    case "operator":
      return { can_inward: true, can_outward: true, can_inspect: false, can_manage_pricing: false };
    default:
      return { can_inward: false, can_outward: false, can_inspect: false, can_manage_pricing: false };
  }
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

export const BILLING_UNITS = ["kg_day", "quintal_day", "tonne_month", "fixed_period"] as const;
export type BillingUnit = (typeof BILLING_UNITS)[number];

export const BILLING_UNIT_LABEL: Record<BillingUnit, string> = {
  kg_day: "Per kg per day",
  quintal_day: "Per quintal per day",
  tonne_month: "Per metric tonne per month",
  fixed_period: "Fixed charge for the storage period",
};

export const EXPENSE_WAIT_DAYS = 30;

/* ── Error messages ────────────────────────────────────────────────────── */

/** Friendly message for the failures a fresh deploy can actually hit. */
export function describeWarehouseError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  if (/relation|does not exist|schema cache|not find the table/i.test(message)) {
    return "The warehouse tables are not set up yet. Run database/supabase/warehouse.sql in Supabase.";
  }
  if (/not enough free capacity/i.test(message)) {
    return "There is not enough free capacity for this booking. Reduce the quantity or choose another warehouse.";
  }
  if (/would exceed the warehouse capacity/i.test(message)) {
    return "Receiving this quantity would exceed the warehouse capacity.";
  }
  if (/only .* remains in lot/i.test(message)) {
    return "You cannot release more than the quantity recorded in this lot.";
  }
  if (/cannot be reopened/i.test(message)) {
    return "This booking is finished or cancelled and cannot be reopened.";
  }
  if (/cannot move booking/i.test(message)) {
    return "That status change is not allowed from the current stage.";
  }
  if (/duplicate key/i.test(message)) {
    return "That record already exists (same lot, quotation or invoice number).";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Your account is not allowed to manage this warehouse.";
  }
  if (/bucket not found/i.test(message)) {
    return "Private storage is not set up yet. Run database/supabase/warehouse.sql in Supabase.";
  }
  return message || "Something went wrong. Please try again.";
}
