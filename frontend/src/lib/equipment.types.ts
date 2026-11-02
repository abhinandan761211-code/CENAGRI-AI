/**
 * Equipment module — domain types, constants and formatting.
 *
 * An equipment owner rents out machinery. Unlike the warehouse module there is
 * no custody question: the owner keeps the machine and an operator drives it.
 *
 * Money is stored in rupees; duration is stored in DAYS on the booking row
 * (`starts_on` … `ends_on`), because that is what blocks the calendar. Hourly
 * and per-acre prices are pricing *models*, not scheduling units.
 */

/* ── Categories ────────────────────────────────────────────────────────── */

export const EQUIPMENT_GROUPS = [
  {
    key: "tractor_attachments",
    label: "Tractor & attachments",
    items: ["Tractor", "Rotavator", "Cultivator", "Plough", "Trolley", "Leveler"],
  },
  {
    key: "harvesting",
    label: "Harvesting",
    items: ["Combine Harvester", "Reaper", "Thresher", "Paddy Harvester", "Maize Sheller"],
  },
  {
    key: "sowing",
    label: "Sowing & planting",
    items: ["Seed Drill", "Planter", "Transplanter", "Fertilizer Spreader"],
  },
  {
    key: "irrigation_spraying",
    label: "Irrigation & spraying",
    items: ["Water Pump", "Sprayer", "Power Sprayer", "Drip Irrigation Equipment"],
  },
  {
    key: "smart",
    label: "Smart agriculture",
    items: ["Agriculture Drone", "Soil Testing Machine", "Smart Sensors", "Crop Monitoring Equipment"],
  },
] as const;

export const EQUIPMENT_CATEGORIES = EQUIPMENT_GROUPS.flatMap((g) => g.items) as readonly string[];

/** features.sql constrains `kind`; this maps a detailed category onto it. */
export function legacyKind(category: string): string {
  if (category.includes("Harvester") || category === "Reaper" || category === "Thresher" || category === "Maize Sheller")
    return "Harvester";
  if (category === "Tractor" || category === "Trolley") return "Tractor";
  if (category.includes("Pump") || category.includes("Drip")) return "Pump";
  if (category.includes("Sprayer")) return "Sprayer";
  if (category === "Power tiller") return "Power tiller";
  if (
    ["Rotavator", "Cultivator", "Plough", "Leveler", "Seed Drill", "Planter", "Transplanter", "Fertilizer Spreader"].includes(
      category
    )
  )
    return "Implement";
  if (category === "Agriculture Drone") return "Drone";
  return "Other";
}

export const EQUIPMENT_STATUSES = ["available", "booked", "in_use", "maintenance", "unavailable"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  available: "Available",
  booked: "Booked",
  in_use: "In use",
  maintenance: "Under maintenance",
  unavailable: "Temporarily unavailable",
};

export const EQUIPMENT_STATUS_STYLE: Record<EquipmentStatus, { dot: string; badge: string }> = {
  available: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  booked: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  in_use: { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800" },
  maintenance: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  unavailable: { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" },
};

/* ── Pricing ───────────────────────────────────────────────────────────── */

export const RATE_UNITS = ["hour", "day", "acre", "job", "week", "quotation"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  hour: "Per hour",
  day: "Per day",
  acre: "Per acre",
  job: "Per job",
  week: "Per week",
  quotation: "Custom quotation",
};

export const FUEL_TYPES = ["Diesel", "Petrol", "Electric", "CNG", "Manual", "Other"] as const;

/* ── Booking lifecycle ─────────────────────────────────────────────────── */

export const BOOKING_STATUSES = [
  "requested",
  "quotation_sent",
  "accepted",
  "confirmed",
  "operator_assigned",
  "scheduled",
  "work_started",
  "work_completed",
  "payment_confirmed",
  "closed",
  "rejected",
  "declined",
  "cancelled",
  "disputed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  requested: "Requested",
  quotation_sent: "Quotation sent",
  accepted: "Accepted",
  confirmed: "Confirmed",
  operator_assigned: "Operator assigned",
  scheduled: "Scheduled",
  work_started: "Work started",
  work_completed: "Work completed",
  payment_confirmed: "Payment confirmed",
  closed: "Closed",
  rejected: "Rejected",
  declined: "Declined",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export const BOOKING_STYLE: Record<BookingStatus, { dot: string; badge: string }> = {
  requested: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  quotation_sent: { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-800" },
  accepted: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  confirmed: { dot: "bg-blue-600", badge: "bg-blue-100 text-blue-800" },
  operator_assigned: { dot: "bg-teal-500", badge: "bg-teal-100 text-teal-800" },
  scheduled: { dot: "bg-cyan-600", badge: "bg-cyan-100 text-cyan-800" },
  work_started: { dot: "bg-indigo-600", badge: "bg-indigo-100 text-indigo-800" },
  work_completed: { dot: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-800" },
  payment_confirmed: { dot: "bg-emerald-700", badge: "bg-emerald-100 text-emerald-800" },
  closed: { dot: "bg-slate-500", badge: "bg-slate-200 text-slate-700" },
  rejected: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
  declined: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
  cancelled: { dot: "bg-rose-400", badge: "bg-rose-100 text-rose-800" },
  disputed: { dot: "bg-orange-600", badge: "bg-orange-100 text-orange-800" },
};

/**
 * Next legal steps. Mirrors `equipment_booking_transition` in equipment.sql —
 * the database is the authority; this only decides which buttons to show.
 */
export const NEXT_STATUSES: Partial<Record<BookingStatus, BookingStatus[]>> = {
  requested: ["quotation_sent", "accepted", "rejected", "cancelled"],
  quotation_sent: ["accepted", "rejected", "cancelled"],
  accepted: ["confirmed", "cancelled"],
  confirmed: ["operator_assigned", "scheduled", "cancelled"],
  operator_assigned: ["scheduled", "cancelled"],
  scheduled: ["work_started", "cancelled", "disputed"],
  work_started: ["work_completed", "disputed"],
  work_completed: ["payment_confirmed", "disputed"],
  payment_confirmed: ["closed", "disputed"],
  disputed: ["work_completed", "closed", "cancelled"],
  closed: [],
  rejected: [],
  declined: [],
  cancelled: [],
};

/** Bookings that occupy the machine's calendar. */
export const BLOCKING_STATUSES: BookingStatus[] = [
  "requested",
  "quotation_sent",
  "accepted",
  "confirmed",
  "operator_assigned",
  "scheduled",
  "work_started",
  "work_completed",
  "payment_confirmed",
];

export const ACTIVE_STATUSES: BookingStatus[] = [
  "confirmed",
  "operator_assigned",
  "scheduled",
  "work_started",
];

export const INVOICE_STATUSES = ["pending", "processing", "paid", "failed", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "processing", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

export const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  refunded: "bg-slate-100 text-slate-600",
};

/* ── Operators & maintenance ───────────────────────────────────────────── */

export const OPERATOR_STATUSES = ["available", "on_job", "leave", "inactive"] as const;
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number];

export const OPERATOR_STATUS_LABEL: Record<OperatorStatus, string> = {
  available: "Available",
  on_job: "On a job",
  leave: "On leave",
  inactive: "Inactive",
};

export const MAINTENANCE_KINDS = ["service", "repair", "breakdown", "inspection", "tyre", "other"] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

export const MAINTENANCE_LABEL: Record<MaintenanceKind, string> = {
  service: "Scheduled service",
  repair: "Repair",
  breakdown: "Breakdown",
  inspection: "Inspection",
  tyre: "Tyres",
  other: "Other",
};

/* ── Documents ─────────────────────────────────────────────────────────── */

export const DOCUMENT_KINDS = [
  "registration",
  "rc",
  "insurance",
  "fitness",
  "operator_licence",
  "ownership_proof",
  "permit",
  "photo",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  registration: "Equipment registration",
  rc: "RC book",
  insurance: "Insurance",
  fitness: "Fitness certificate",
  operator_licence: "Operator licence",
  ownership_proof: "Ownership / authorisation",
  permit: "Permit",
  photo: "Photograph",
  other: "Other document",
};

export const VERIFICATION_STATES = ["not_submitted", "pending", "verified", "rejected", "expired"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  not_submitted: "Not submitted",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
};

export const EXPENSE_KINDS = ["operator", "fuel", "transport", "maintenance", "spare_parts", "other"] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const EXPENSE_LABEL: Record<ExpenseKind, string> = {
  operator: "Operator charges",
  fuel: "Fuel",
  transport: "Transportation",
  maintenance: "Maintenance",
  spare_parts: "Spare parts",
  other: "Other",
};

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
  return d.toISOString().slice(0, 10);
}

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

/** Inclusive day count for a booking range. */
export function rangeDays(startsOn: string, endsOn: string): number {
  return Math.max(daysBetween(startsOn, endsOn) + 1, 1);
}

/* ── Errors ────────────────────────────────────────────────────────────── */

export function describeEquipmentError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  if (/relation|does not exist|schema cache|not find the table/i.test(message)) {
    return "The equipment tables are not set up yet. Run database/supabase/equipment.sql in Supabase.";
  }
  if (/already booked for/i.test(message)) {
    return "This machine is already booked for those dates. Choose another period or machine.";
  }
  if (/blocked for maintenance/i.test(message)) {
    return "This machine is under maintenance for those dates.";
  }
  if (/already has a booking/i.test(message)) {
    return "That period already has a booking. Cancel or move it before blocking the dates.";
  }
  if (/operator is already assigned/i.test(message)) {
    return "That operator is already on another job for those dates.";
  }
  if (/cannot be reopened/i.test(message)) {
    return "This booking is closed and cannot be reopened.";
  }
  if (/cannot move booking/i.test(message)) {
    return "That status change is not allowed from the current stage.";
  }
  if (/duplicate key/i.test(message)) {
    return "That record already exists — a quotation or review is already on file.";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Your account is not allowed to manage this equipment.";
  }
  return message || "Something went wrong. Please try again.";
}
