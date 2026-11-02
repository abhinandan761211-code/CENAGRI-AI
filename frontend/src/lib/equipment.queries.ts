/**
 * Equipment module — read queries and pure calculations.
 *
 * Every query takes the signed-in id from the verified session; authorisation
 * is RLS in equipment.sql. Nothing here invents a value: an unknown price or an
 * unknown availability comes back as null and the UI says so.
 */
import { supabase } from "@/lib/supabase";
import { daysBetween, daysUntil, rangeDays, todayISO } from "@/lib/equipment.types";
import type { BookingStatus, RateUnit } from "@/lib/equipment.types";
import type {
  CostBreakdown,
  DashboardTotals,
  Equipment,
  EquipmentAgreement,
  EquipmentBlock,
  EquipmentBooking,
  EquipmentDocument,
  EquipmentExpense,
  EquipmentInvoice,
  EquipmentOperator,
  EquipmentPricing,
  EquipmentQuotation,
  EquipmentReview,
  EquipmentStats,
  EquipmentMessage,
  EquipmentNotification,
  MaintenanceRecord,
  RentalRequest,
} from "@/lib/equipment.entities";
import { ACTIVE_STATUSES, BLOCKING_STATUSES } from "@/lib/equipment.types";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

export async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  return user.id;
}

/* ── Equipment ─────────────────────────────────────────────────────────── */

export async function listEquipment(): Promise<Equipment[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment")
    .select("*")
    .eq("owner_id", me)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Equipment[];
}

export async function listEquipmentStats(): Promise<EquipmentStats[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_stats_view")
    .select("*")
    .eq("owner_id", me)
    .eq("is_archived", false);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    active_bookings: Number(row.active_bookings ?? 0),
    revenue_inr: Number(row.revenue_inr ?? 0),
  })) as EquipmentStats[];
}

export async function getEquipment(id: string): Promise<Equipment | null> {
  const { data, error } = await client().from("equipment").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Equipment | null) ?? null;
}

export async function getPricing(equipmentId: string): Promise<EquipmentPricing | null> {
  const { data, error } = await client()
    .from("equipment_pricing")
    .select("*")
    .eq("equipment_id", equipmentId)
    .maybeSingle();
  if (error) throw error;
  return (data as EquipmentPricing | null) ?? null;
}

/* ── Operators ─────────────────────────────────────────────────────────── */

export async function listOperators(): Promise<EquipmentOperator[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_operators")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentOperator[];
}

/* ── Requests ──────────────────────────────────────────────────────────── */

export type RequestFilters = {
  search?: string;
  category?: string | "all";
  district?: string | "all";
  needsOperatorOnly?: boolean;
};

/**
 * Open rental requests posted by other accounts.
 *
 * RLS already hides closed ones; the requester's own are filtered out so an
 * owner never quotes themselves. Expiry is finished in memory because
 * PostgREST cannot compare two columns.
 */
export async function listOpenRequests(filters: RequestFilters = {}): Promise<RentalRequest[]> {
  const me = await currentUserId();
  let query = client()
    .from("equipment_rental_requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);
  if (filters.district && filters.district !== "all") query = query.eq("district", filters.district);
  if (filters.needsOperatorOnly) query = query.eq("needs_operator", true);

  const { data, error } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as RentalRequest[]).filter((r) => r.requester_id !== me);
  const today = todayISO();
  rows = rows.filter((r) => !r.expires_on || r.expires_on >= today);

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.work_type ?? "").toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.farm_location ?? "").toLowerCase().includes(q) ||
        (r.requester_name ?? "").toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function listMyQuotations(): Promise<EquipmentQuotation[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_quotations")
    .select("*, request:equipment_rental_requests(*)")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentQuotation[];
}

export async function quotedRequestIds(): Promise<Set<string>> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_quotations")
    .select("request_id, status")
    .eq("owner_id", me)
    .in("status", ["sent", "accepted"]);
  if (error) throw error;
  return new Set((data ?? []).map((r: { request_id: string }) => r.request_id));
}

/* ── Bookings ──────────────────────────────────────────────────────────── */

export async function listBookings(): Promise<EquipmentBooking[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_booking_view")
    .select("*")
    .eq("owner_id", me)
    .order("starts_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentBooking[];
}

export async function getBooking(id: string): Promise<EquipmentBooking | null> {
  const { data, error } = await client()
    .from("equipment_booking_view")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as EquipmentBooking | null) ?? null;
}

export async function listBlocks(equipmentId?: string): Promise<EquipmentBlock[]> {
  let query = client()
    .from("equipment_availability_blocks")
    .select("*")
    .order("starts_on", { ascending: true });
  if (equipmentId) query = query.eq("equipment_id", equipmentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EquipmentBlock[];
}

/* ── Calendar & conflict logic (pure) ──────────────────────────────────── */

/** Two inclusive date ranges overlap when each starts before the other ends. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export type CalendarDay = {
  date: string;
  state: "available" | "booked" | "blocked" | "past";
  booking?: EquipmentBooking;
  block?: EquipmentBlock;
};

/**
 * Build a day-by-day picture of one machine.
 *
 * Used by the calendar and by the availability checker, so the two can never
 * disagree. Pure — no query.
 */
export function buildCalendar(
  days: string[],
  bookings: EquipmentBooking[],
  blocks: EquipmentBlock[],
  equipmentId: string
): CalendarDay[] {
  const mine = bookings.filter(
    (b) => b.equipment_id === equipmentId && BLOCKING_STATUSES.includes(b.status)
  );
  const myBlocks = blocks.filter((b) => b.equipment_id === equipmentId);
  const today = todayISO();

  return days.map((date) => {
    const booking = mine.find((b) => date >= b.starts_on && date <= b.ends_on);
    if (booking) return { date, state: "booked" as const, booking };
    const block = myBlocks.find((b) => date >= b.starts_on && date <= b.ends_on);
    if (block) return { date, state: "blocked" as const, block };
    if (date < today) return { date, state: "past" as const };
    return { date, state: "available" as const };
  });
}

/** Dates from `from` to `to` inclusive, as ISO strings. */
export function dateRange(from: string, to: string): string[] {
  const total = rangeDays(from, to);
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(`${from}T00:00:00`);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/**
 * Would these dates be free for this machine?
 *
 * The database re-checks under a row lock — this exists so the UI can explain
 * the conflict before the user presses Confirm.
 */
export function checkAvailability(
  equipmentId: string,
  startsOn: string,
  endsOn: string,
  bookings: EquipmentBooking[],
  blocks: EquipmentBlock[],
  ignoreBookingId?: string
): { ok: boolean; reason: string | null; conflictWith: EquipmentBooking | null } {
  const clash = bookings.find(
    (b) =>
      b.equipment_id === equipmentId &&
      b.id !== ignoreBookingId &&
      BLOCKING_STATUSES.includes(b.status) &&
      rangesOverlap(startsOn, endsOn, b.starts_on, b.ends_on)
  );
  if (clash) {
    return {
      ok: false,
      reason: `Already booked ${clash.starts_on} → ${clash.ends_on}.`,
      conflictWith: clash,
    };
  }

  const block = blocks.find(
    (b) => b.equipment_id === equipmentId && rangesOverlap(startsOn, endsOn, b.starts_on, b.ends_on)
  );
  if (block) {
    return {
      ok: false,
      reason: `Blocked (${block.kind}) ${block.starts_on} → ${block.ends_on}${block.reason ? ` — ${block.reason}` : ""}.`,
      conflictWith: null,
    };
  }

  return { ok: true, reason: null, conflictWith: null };
}

/** Can this operator take the job without double-booking? */
export function checkOperatorAvailability(
  operatorId: string,
  startsOn: string,
  endsOn: string,
  bookings: EquipmentBooking[],
  ignoreBookingId?: string
): { ok: boolean; reason: string | null } {
  const clash = bookings.find(
    (b) =>
      b.operator_id === operatorId &&
      b.id !== ignoreBookingId &&
      BLOCKING_STATUSES.includes(b.status) &&
      rangesOverlap(startsOn, endsOn, b.starts_on, b.ends_on)
  );
  if (clash) return { ok: false, reason: `Already on another job ${clash.starts_on} → ${clash.ends_on}.` };
  return { ok: true, reason: null };
}

/* ── Pricing maths (pure) ──────────────────────────────────────────────── */

/**
 * Full, itemised cost of a rental.
 *
 * Shown before confirmation so no charge can appear afterwards. The minimum
 * duration in the price sheet is applied here exactly as it would be on the
 * invoice.
 */
export function quoteCost(params: {
  pricing: Pick<
    EquipmentPricing,
    | "rate_unit"
    | "base_rate_inr"
    | "minimum_days"
    | "minimum_hours"
    | "operator_rate_inr"
    | "fuel_rate_inr"
    | "transport_rate_inr"
    | "other_service_rate_inr"
    | "other_service_label"
    | "advance_percent"
  >;
  days: number;
  hours?: number | null;
  acres?: number | null;
  withOperator: boolean;
  withFuel: boolean;
  withTransport: boolean;
}): CostBreakdown {
  const { pricing, days, withOperator, withFuel, withTransport } = params;
  const hours = params.hours ?? days * 8;
  const acres = params.acres ?? null;
  const billedDays = Math.max(days, pricing.minimum_days ?? 1);
  const billedHours = Math.max(hours, pricing.minimum_hours ?? 0);

  let rental = 0;
  switch (pricing.rate_unit as RateUnit) {
    case "hour":
      rental = billedHours * Number(pricing.base_rate_inr);
      break;
    case "day":
      rental = billedDays * Number(pricing.base_rate_inr);
      break;
    case "week":
      rental = (billedDays / 7) * Number(pricing.base_rate_inr);
      break;
    case "acre":
      rental = (acres ?? 0) * Number(pricing.base_rate_inr);
      break;
    case "job":
    case "quotation":
    default:
      rental = Number(pricing.base_rate_inr);
      break;
  }

  const operator = withOperator ? Number(pricing.operator_rate_inr) * billedDays : 0;
  const fuel = withFuel ? Number(pricing.fuel_rate_inr) * billedDays : 0;
  const transport = withTransport ? Number(pricing.transport_rate_inr) : 0;
  const other = Number(pricing.other_service_rate_inr) || 0;

  const total = rental + operator + fuel + transport + other;
  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    rental: round(rental),
    operator: round(operator),
    fuel: round(fuel),
    transport: round(transport),
    other: round(other),
    otherLabel: pricing.other_service_label,
    advance: round((total * (Number(pricing.advance_percent) || 0)) / 100),
    total: round(total),
    days: billedDays,
  };
}

/* ── Dashboard totals (pure) ───────────────────────────────────────────── */

export function dashboardTotals(params: {
  equipment: Equipment[];
  bookings: EquipmentBooking[];
  requests: RentalRequest[];
  invoices: EquipmentInvoice[];
}): DashboardTotals {
  const paid = params.invoices.filter((i) => i.status === "paid");
  const pending = params.invoices.filter((i) => i.status === "pending" || i.status === "processing");

  return {
    total: params.equipment.length,
    available: params.equipment.filter((e) => e.status === "available" && !e.is_archived).length,
    booked: params.equipment.filter((e) => e.status === "booked" || e.status === "in_use").length,
    maintenance: params.equipment.filter((e) => e.status === "maintenance").length,
    newRequests: params.requests.length,
    activeBookings: params.bookings.filter((b) => ACTIVE_STATUSES.includes(b.status)).length,
    completed: params.bookings.filter((b) => b.status === "closed" || b.status === "payment_confirmed").length,
    earnings: paid.reduce((s, i) => s + Number(i.total_inr), 0),
    pending: pending.reduce((s, i) => s + Number(i.total_inr), 0),
  };
}

/** Utilisation of one machine: booked days out of a window of days. */
export function utilisation(
  equipmentId: string,
  bookings: EquipmentBooking[],
  windowDays = 30
): { bookedDays: number; windowDays: number; pct: number } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - windowDays + 1);
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = today.toISOString().slice(0, 10);

  const booked = new Set<string>();
  for (const b of bookings) {
    if (b.equipment_id !== equipmentId) continue;
    if (!BLOCKING_STATUSES.includes(b.status)) continue;
    const start = b.starts_on > fromISO ? b.starts_on : fromISO;
    const end = b.ends_on < toISO ? b.ends_on : toISO;
    if (start > end) continue;
    const total = rangeDays(start, end);
    for (let i = 0; i < total; i += 1) {
      const d = new Date(`${start}T00:00:00`);
      d.setDate(d.getDate() + i);
      booked.add(d.toISOString().slice(0, 10));
    }
  }
  const pct = Math.round((booked.size / windowDays) * 100);
  return { bookedDays: booked.size, windowDays, pct: Math.min(pct, 100) };
}

/**
 * An operator's licence state. `expired` is true when the date is in the past,
 * `expiringSoon` within 30 days. No expiry on file is neither.
 */
export function licenceState(op: {
  licence_expiry: string | null;
}): { expired: boolean; expiringSoon: boolean; days: number | null } {
  const days = daysUntil(op.licence_expiry);
  if (days == null) return { expired: false, expiringSoon: false, days: null };
  return { expired: days < 0, expiringSoon: days >= 0 && days <= 30, days };
}

/**
 * A short, human label for a machine's service state.
 * `nextServiceLabel(null)` says "Not set" rather than pretending it is fine.
 */
export function nextServiceLabel(nextServiceOn: string | null | undefined): {
  label: string;
  days: number | null;
  overdue: boolean;
} {
  if (!nextServiceOn) return { label: "Not set", days: null, overdue: false };
  const days = daysBetween(todayISO(), nextServiceOn);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, days, overdue: true };
  if (days === 0) return { label: "Due today", days, overdue: false };
  return { label: `in ${days}d`, days, overdue: false };
}

/** Maintenance that is due or overdue, for the reminder panel. */
export function serviceDue(
  equipment: Equipment[]
): { equipment: Equipment; days: number | null; overdue: boolean }[] {
  return equipment
    .map((e) => {
      const days = e.next_service_on
        ? daysBetween(todayISO(), e.next_service_on)
        : null;
      return { equipment: e, days, overdue: days != null && days < 0 };
    })
    .filter((row) => row.days == null || row.days <= 30)
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
}

/* ── Money & paperwork ─────────────────────────────────────────────────── */

export async function listInvoices(): Promise<EquipmentInvoice[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_invoices")
    .select("*")
    .eq("owner_id", me)
    .order("issued_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentInvoice[];
}

export async function listExpenses(): Promise<EquipmentExpense[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_expenses")
    .select("*")
    .eq("owner_id", me)
    .order("spent_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentExpense[];
}

export async function listMaintenance(): Promise<MaintenanceRecord[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_maintenance")
    .select("*")
    .eq("owner_id", me)
    .order("service_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MaintenanceRecord[];
}

export async function listDocuments(): Promise<EquipmentDocument[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_documents")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentDocument[];
}

export async function listReviews(): Promise<EquipmentReview[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_reviews")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentReview[];
}

export async function listAgreements(): Promise<EquipmentAgreement[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_rental_agreements")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EquipmentAgreement[];
}

export async function getAgreement(bookingId: string): Promise<EquipmentAgreement | null> {
  const { data, error } = await client()
    .from("equipment_rental_agreements")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw error;
  return (data as EquipmentAgreement | null) ?? null;
}

/* ── Communication ─────────────────────────────────────────────────────── */

export async function listNotifications(): Promise<EquipmentNotification[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_notifications")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as EquipmentNotification[];
}

export async function listMessages(): Promise<EquipmentMessage[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_messages")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EquipmentMessage[];
}

/* ── Derived helpers ───────────────────────────────────────────────────── */

export function countByStatus(bookings: EquipmentBooking[], status: BookingStatus): number {
  return bookings.filter((b) => b.status === status).length;
}

/** Upcoming bookings, soonest first. */
export function upcomingBookings(bookings: EquipmentBooking[], limit = 5): EquipmentBooking[] {
  const today = todayISO();
  return bookings
    .filter((b) => b.ends_on >= today && BLOCKING_STATUSES.includes(b.status))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .slice(0, limit);
}
