/**
 * Warehouse module — read queries and pure calculations.
 *
 * Every function takes the signed-in id from the verified session, never from a
 * caller-supplied value, and defers authorisation to RLS in warehouse.sql.
 *
 * Nothing here invents a number. Where a value depends on a booking or a plan
 * that does not exist yet, the function returns null or zero and the UI says so.
 */
import { supabase } from "@/lib/supabase";
import { toKg } from "@/lib/warehouse.types";
import type {
  BillingUnit,
  CommodityCategory,
  QuantityUnit,
  StorageBookingStatus,
} from "@/lib/warehouse.types";
import type {
  CapacityBreakdown,
  GoodsDispatch,
  GoodsReceipt,
  InventoryLot,
  InventoryTransaction,
  ReadingLevel,
  StorageBooking,
  StorageInspection,
  StoragePricingPlan,
  StorageQuotation,
  StorageReading,
  StorageRequest,
  StorageRequestStatus,
  Warehouse,
  WarehouseCapacity,
  WarehouseDocument,
  WarehouseMessage,
  WarehouseNotification,
  WarehouseSection,
  WarehouseStaff,
  WarehouseTotals,
} from "@/lib/warehouse.entities";
import { IN_STORAGE_STATUSES, RESERVING_STATUSES } from "@/lib/warehouse.types";

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

/* ── Warehouses ────────────────────────────────────────────────────────── */

export async function listWarehouses(): Promise<Warehouse[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouses")
    .select("*")
    .eq("owner_id", me)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Warehouse[];
}

/** Capacity figures come from the database view, so they cannot drift. */
export async function listCapacity(): Promise<WarehouseCapacity[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_capacity_view")
    .select("*")
    .eq("owner_id", me)
    .eq("is_archived", false);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    capacity_kg: Number(row.capacity_kg ?? 0),
    reserved_kg: Number(row.reserved_kg ?? 0),
    occupied_kg: Number(row.occupied_kg ?? 0),
    available_kg: Number(row.available_kg ?? 0),
    utilisation_pct: Number(row.utilisation_pct ?? 0),
  })) as WarehouseCapacity[];
}

export async function getWarehouse(id: string): Promise<Warehouse | null> {
  const { data, error } = await client().from("warehouses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Warehouse | null) ?? null;
}

export async function listSections(warehouseId?: string): Promise<WarehouseSection[]> {
  let query = client()
    .from("warehouse_sections")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WarehouseSection[];
}

/** Add up the owner's capacity. Pure — no query. */
export function warehouseTotals(rows: WarehouseCapacity[]): WarehouseTotals {
  const sum = (pick: (r: WarehouseCapacity) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const capacity = sum((r) => r.capacity_kg);
  const reserved = sum((r) => r.reserved_kg);
  const occupied = sum((r) => r.occupied_kg);
  return {
    warehouses: rows.length,
    capacity_kg: capacity,
    reserved_kg: reserved,
    occupied_kg: occupied,
    available_kg: Math.max(capacity - reserved - occupied, 0),
    utilisation_pct: capacity > 0 ? Math.round(((reserved + occupied) / capacity) * 1000) / 10 : 0,
  };
}

/**
 * Can this warehouse take `quantityKg` more right now?
 *
 * The UI asks first so it can disable a button with a reason; the database
 * checks again under a row lock, because two owners' tabs are not a lock.
 */
export function canAccommodate(
  warehouse: Pick<WarehouseCapacity, "capacity_kg" | "reserved_kg" | "occupied_kg"> | null,
  quantityKg: number
): { ok: boolean; reason: string | null; freeKg: number } {
  if (!warehouse) return { ok: false, reason: "Choose a warehouse.", freeKg: 0 };
  const freeKg = Math.max(
    Number(warehouse.capacity_kg) - Number(warehouse.reserved_kg) - Number(warehouse.occupied_kg),
    0
  );
  if (quantityKg <= 0) return { ok: false, reason: "Enter a quantity greater than zero.", freeKg };
  if (quantityKg > freeKg) {
    return {
      ok: false,
      reason: `Only ${(freeKg / 1000).toFixed(2)} t is free in this warehouse.`,
      freeKg,
    };
  }
  return { ok: true, reason: null, freeKg };
}

/** Per-warehouse capacity split for the charts. */
export function capacityBreakdown(rows: WarehouseCapacity[]): CapacityBreakdown {
  const t = warehouseTotals(rows);
  return {
    capacity_kg: t.capacity_kg,
    reserved_kg: t.reserved_kg,
    occupied_kg: t.occupied_kg,
    available_kg: t.available_kg,
    utilisation_pct: t.utilisation_pct,
  };
}

/* ── Storage requests ──────────────────────────────────────────────────── */

export type StorageRequestFilters = {
  search?: string;
  storageType?: string | "all";
  district?: string | "all";
  minQuantityKg?: number | null;
  startsFrom?: string | null;
  includeQuoted?: boolean;
};

/**
 * Open storage requests posted by other accounts.
 *
 * RLS already hides closed requests from owners, and the requester's own
 * requests are excluded here so an owner never quotes themselves.
 * Expiry is finished in memory because PostgREST cannot compare two columns.
 */
export async function listOpenStorageRequests(
  filters: StorageRequestFilters = {}
): Promise<StorageRequest[]> {
  const me = await currentUserId();
  let query = client()
    .from("storage_requests")
    .select("*")
    .in("status", filters.includeQuoted ? ["open", "quoted"] : ["open"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.storageType && filters.storageType !== "all") {
    query = query.eq("storage_type", filters.storageType);
  }
  if (filters.district && filters.district !== "all") {
    query = query.eq("preferred_district", filters.district);
  }
  if (filters.startsFrom) query = query.gte("starts_on", filters.startsFrom);

  const { data, error } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as StorageRequest[]).filter((r) => r.requester_id !== me);

  const today = new Date().toISOString().slice(0, 10);
  rows = rows.filter((r) => !r.expires_on || r.expires_on >= today);

  if (filters.minQuantityKg != null) {
    rows = rows.filter((r) => Number(r.quantity_kg) >= filters.minQuantityKg!);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.crop_name.toLowerCase().includes(q) ||
        (r.variety ?? "").toLowerCase().includes(q) ||
        (r.preferred_district ?? "").toLowerCase().includes(q) ||
        (r.requester_name ?? "").toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function getStorageRequest(id: string): Promise<StorageRequest | null> {
  const { data, error } = await client()
    .from("storage_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as StorageRequest | null) ?? null;
}

/* ── Quotations ────────────────────────────────────────────────────────── */

export async function listMyQuotations(): Promise<StorageQuotation[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("storage_quotations")
    .select("*, request:storage_requests(*)")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StorageQuotation[];
}

/** Request ids this owner has already quoted — blocks a duplicate live quote. */
export async function quotedRequestIds(): Promise<Set<string>> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("storage_quotations")
    .select("request_id, status")
    .eq("owner_id", me)
    .in("status", ["sent", "accepted"]);
  if (error) throw error;
  return new Set((data ?? []).map((row: { request_id: string }) => row.request_id));
}

/* ── Bookings ──────────────────────────────────────────────────────────── */

export async function listStorageBookings(): Promise<StorageBooking[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_booking_view")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StorageBooking[];
}

export async function getStorageBooking(id: string): Promise<StorageBooking | null> {
  const { data, error } = await client()
    .from("warehouse_booking_view")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as StorageBooking | null) ?? null;
}

/** How many booking rows sit in each lifecycle stage. */
export function bookingCounts(
  bookings: StorageBooking[]
): Record<StorageBookingStatus, number> {
  const counts = {} as Record<StorageBookingStatus, number>;
  for (const b of bookings) counts[b.status] = (counts[b.status] ?? 0) + 1;
  return counts;
}

export function activeBookings(bookings: StorageBooking[]): StorageBooking[] {
  return bookings.filter((b) => !["completed", "cancelled"].includes(b.status));
}

/* ── Inventory ─────────────────────────────────────────────────────────── */

export async function listInventoryLots(): Promise<InventoryLot[]> {
  return listLotsForOwner();
}

/**
 * Lots in the owner's warehouses.
 *
 * Filtered through the owner's warehouse ids rather than a role, because RLS
 * allows the owner AND the depositor to read a lot — the screen must show only
 * the owner's side.
 */
export async function listLotsForOwner(): Promise<InventoryLot[]> {
  const me = await currentUserId();
  const { data: whs, error: whErr } = await client()
    .from("warehouses")
    .select("id")
    .eq("owner_id", me)
    .eq("is_archived", false);
  if (whErr) throw whErr;
  const ids = (whs ?? []).map((w: { id: string }) => w.id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from("inventory_lots")
    .select("*")
    .in("warehouse_id", ids)
    .order("received_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InventoryLot[];
}

export async function getLot(id: string): Promise<InventoryLot | null> {
  const { data, error } = await client()
    .from("inventory_lots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as InventoryLot | null) ?? null;
}

export async function listLotTransactions(lotId: string): Promise<InventoryTransaction[]> {
  const { data, error } = await client()
    .from("inventory_transactions")
    .select("*")
    .eq("lot_id", lotId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InventoryTransaction[];
}

export type CropStock = { crop: string; kg: number; lots: number };

/** Stock grouped by crop. Ownership is preserved: this is a sum for display. */
export function stockByCrop(lots: InventoryLot[]): CropStock[] {
  const map = new Map<string, CropStock>();
  for (const lot of lots) {
    if (lot.status === "released") continue;
    const key = lot.crop_name || "Unnamed crop";
    const row = map.get(key) ?? { crop: key, kg: 0, lots: 0 };
    row.kg += Number(lot.current_kg);
    row.lots += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.kg - a.kg);
}

export type DepositorStock = { depositor_id: string; kg: number; lots: number };

/** Stock grouped by depositor — never merged across customers. */
export function stockByDepositor(lots: InventoryLot[]): DepositorStock[] {
  const map = new Map<string, DepositorStock>();
  for (const lot of lots) {
    if (lot.status === "released") continue;
    const row = map.get(lot.depositor_id) ?? { depositor_id: lot.depositor_id, kg: 0, lots: 0 };
    row.kg += Number(lot.current_kg);
    row.lots += 1;
    map.set(lot.depositor_id, row);
  }
  return [...map.values()].sort((a, b) => b.kg - a.kg);
}

/** Total kg currently held, excluding fully released lots. */
export function totalStoredKg(lots: InventoryLot[]): number {
  return lots
    .filter((l) => l.status !== "released")
    .reduce((sum, l) => sum + Number(l.current_kg), 0);
}

/**
 * How long a lot has been in storage — used for storage-duration reports.
 * Counts to today for stock still held, or to the last release for closed lots.
 */
export function storedDays(lot: InventoryLot, today = new Date()): number {
  const start = new Date(`${lot.received_on}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86_400_000));
}

/* ── Goods movement ────────────────────────────────────────────────────── */

export async function listReceipts(): Promise<GoodsReceipt[]> {
  const me = await currentUserId();
  const { data: whs, error: whErr } = await client()
    .from("warehouses")
    .select("id")
    .eq("owner_id", me);
  if (whErr) throw whErr;
  const ids = (whs ?? []).map((w: { id: string }) => w.id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from("goods_receipts")
    .select("*")
    .in("warehouse_id", ids)
    .order("received_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as GoodsReceipt[];
}

export async function listDispatches(): Promise<GoodsDispatch[]> {
  const me = await currentUserId();
  const { data: whs, error: whErr } = await client()
    .from("warehouses")
    .select("id")
    .eq("owner_id", me);
  if (whErr) throw whErr;
  const ids = (whs ?? []).map((w: { id: string }) => w.id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from("goods_dispatches")
    .select("*")
    .in("warehouse_id", ids)
    .order("dispatched_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as GoodsDispatch[];
}

/* ── Inspections ───────────────────────────────────────────────────────── */

export async function listInspections(): Promise<StorageInspection[]> {
  const me = await currentUserId();
  const { data: whs, error: whErr } = await client()
    .from("warehouses")
    .select("id")
    .eq("owner_id", me);
  if (whErr) throw whErr;
  const ids = (whs ?? []).map((w: { id: string }) => w.id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from("storage_inspections")
    .select("*")
    .in("warehouse_id", ids)
    .order("inspected_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as StorageInspection[];
}

/* ── Readings ──────────────────────────────────────────────────────────── */

export async function listReadings(warehouseId?: string): Promise<StorageReading[]> {
  let query = client()
    .from("storage_readings")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(200);
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StorageReading[];
}

/**
 * Grade a reading against the configured acceptable range.
 *
 * A missing range or a missing value is `ok` with no claim attached — the UI
 * shows "not configured" rather than inventing comfort.
 */
export function readingLevel(
  value: number | null,
  min: number | null | undefined,
  max: number | null | undefined
): ReadingLevel {
  if (value == null || (min == null && max == null)) return "ok";
  const span = min != null && max != null ? Math.abs(max - min) : null;
  if (min != null && value < min) {
    const over = min - value;
    return span && over > span * 0.1 ? "critical" : "warning";
  }
  if (max != null && value > max) {
    const over = value - max;
    return span && over > span * 0.1 ? "critical" : "warning";
  }
  return "ok";
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

export async function listPricingPlans(): Promise<StoragePricingPlan[]> {
  const me = await currentUserId();
  const { data: whs, error: whErr } = await client()
    .from("warehouses")
    .select("id")
    .eq("owner_id", me);
  if (whErr) throw whErr;
  const ids = (whs ?? []).map((w: { id: string }) => w.id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from("storage_pricing_plans")
    .select("*")
    .in("warehouse_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoragePricingPlan[];
}

export type CostBreakdown = {
  storage: number;
  loading: number;
  unloading: number;
  handling: number;
  other: number;
  otherLabel: string | null;
  total: number;
  billableDays: number;
};

/**
 * The full cost of a storage stay, itemised.
 *
 * Shown BEFORE the customer confirms, so no handling fee can appear later. The
 * minimum stay in the plan is applied, exactly as it would be on the invoice.
 */
export function quoteCost(params: {
  plan: Pick<
    StoragePricingPlan,
    | "billing_unit"
    | "rate_inr"
    | "minimum_days"
    | "fixed_period_days"
    | "cold_premium_pct"
    | "loading_rate_inr"
    | "unloading_rate_inr"
    | "handling_rate_inr"
    | "other_service_rate_inr"
    | "other_service_label"
  >;
  quantityKg: number;
  days: number;
  isCold: boolean;
  includeLoading?: boolean;
  includeUnloading?: boolean;
}): CostBreakdown {
  const { plan, quantityKg, days, isCold } = params;
  const billableDays = Math.max(Math.round(days), plan.minimum_days || 1);
  const premium = isCold ? 1 + (Number(plan.cold_premium_pct) || 0) / 100 : 1;

  let storage = 0;
  switch (plan.billing_unit as BillingUnit) {
    case "kg_day":
      storage = quantityKg * billableDays * Number(plan.rate_inr);
      break;
    case "quintal_day":
      storage = (quantityKg / 100) * billableDays * Number(plan.rate_inr);
      break;
    case "tonne_month":
      storage = (quantityKg / 1000) * (billableDays / 30) * Number(plan.rate_inr);
      break;
    case "fixed_period":
      storage = Number(plan.rate_inr);
      break;
  }
  storage = Math.round(storage * premium * 100) / 100;

  const loading = params.includeLoading ? Number(plan.loading_rate_inr) || 0 : 0;
  const unloading = params.includeUnloading ? Number(plan.unloading_rate_inr) || 0 : 0;
  const handling = Number(plan.handling_rate_inr) || 0;
  const other = Number(plan.other_service_rate_inr) || 0;

  return {
    storage,
    loading: Math.round(loading * 100) / 100,
    unloading: Math.round(unloading * 100) / 100,
    handling: Math.round(handling * 100) / 100,
    other: Math.round(other * 100) / 100,
    otherLabel: plan.other_service_label,
    total: Math.round((storage + loading + unloading + handling + other) * 100) / 100,
    billableDays,
  };
}

/** Storage days a request asks for, converted from the quantity the user typed. */
export function requestQuantityKg(quantity: number, unit: QuantityUnit): number {
  return toKg(quantity, unit);
}

/* ── Staff, documents, money ───────────────────────────────────────────── */

export async function listStaff(): Promise<WarehouseStaff[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_staff")
    .select("*")
    .eq("owner_id", me)
    .neq("status", "removed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WarehouseStaff[];
}

export async function listDocuments(): Promise<WarehouseDocument[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_documents")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WarehouseDocument[];
}

export async function listInvoices() {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("storage_invoices")
    .select("*")
    .eq("owner_id", me)
    .order("issued_on", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ── Communication ─────────────────────────────────────────────────────── */

export async function listNotifications(): Promise<WarehouseNotification[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_notifications")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as WarehouseNotification[];
}

export async function listMessages(): Promise<WarehouseMessage[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_messages")
    .select("*")
    .eq("owner_id", me)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WarehouseMessage[];
}

/* ── Cross-cutting ─────────────────────────────────────────────────────── */

export const RESERVING = RESERVING_STATUSES;
export const IN_STORAGE = IN_STORAGE_STATUSES;

/** Commodity category a warehouse type stores by default. */
export function defaultCategory(type: string | null): CommodityCategory {
  switch (type) {
    case "grain":
      return "grain";
    case "cold":
      return "cold_chain";
    case "fruit_veg":
      return "fruit_veg";
    case "seed":
      return "seed";
    default:
      return "grain";
  }
}
