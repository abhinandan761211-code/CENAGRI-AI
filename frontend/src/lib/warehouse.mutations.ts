/**
 * Warehouse module — writes.
 *
 * Every write here is a normal Supabase call. The real guards are in the
 * database: capacity triggers, the booking-transition trigger, the stock-ledger
 * triggers and RLS. This layer therefore never re-implements a rule as a
 * client-side check — it validates for a clear message and lets the database
 * refuse what is actually impossible.
 *
 * Documents and photos go to the private `warehouse-documents` bucket and only
 * the object path is stored. Nothing uploads a public URL.
 */
import { supabase } from "@/lib/supabase";
import {
  currentUserId,
  listLotsForOwner,
} from "@/lib/warehouse.queries";
import {
  legacyKind,
  toKg,
} from "@/lib/warehouse.types";
import type {
  BillingUnit,
  CommodityCategory,
  QuantityUnit,
  StaffRole,
  StorageBookingStatus,
  WarehouseDocumentKind,
  WarehouseType,
} from "@/lib/warehouse.types";
import type {
  GoodsDispatch,
  GoodsReceipt,
  InventoryLot,
  StorageBooking,
  StoragePricingPlan,
  StorageInspection,
  StorageReading,
  StorageRequest,
  Warehouse,
  WarehouseDocument,
  WarehouseMessage,
  WarehouseSection,
  WarehouseStaff,
} from "@/lib/warehouse.entities";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/* ── Warehouses ────────────────────────────────────────────────────────── */

export type WarehouseInput = {
  name: string;
  warehouse_type: WarehouseType;
  address_line: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  total_capacity_kg: number;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  opens_at: string;
  closes_at: string;
  facilities: string[];
  loading_facilities: string[];
  security_facilities: string[];
  accepted_commodities: string[];
  is_listed: boolean;
  about: string | null;
};

/**
 * Create a warehouse.
 *
 * `kind`, `capacity_kg` and `available_kg` are written too, because features.sql
 * declares them NOT NULL and the farmer-facing storage screen reads them.
 */
export async function createWarehouse(input: WarehouseInput): Promise<Warehouse> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("warehouses")
    .insert({
      ...input,
      owner_id: ownerId,
      kind: legacyKind(input.warehouse_type),
      capacity_kg: input.total_capacity_kg,
      total_capacity_kg: input.total_capacity_kg,
      available_kg: input.total_capacity_kg,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Warehouse;
}

export async function updateWarehouse(
  id: string,
  patch: Partial<WarehouseInput>
): Promise<Warehouse> {
  const update: Record<string, unknown> = { ...patch };
  if (patch.warehouse_type) update.kind = legacyKind(patch.warehouse_type);
  if (patch.total_capacity_kg != null) update.capacity_kg = patch.total_capacity_kg;

  const { data, error } = await client()
    .from("warehouses")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Warehouse;
}

/**
 * Archiving keeps history intact. A warehouse that has ever held a booking must
 * never be deleted, because the depositor's records point at it.
 */
export async function archiveWarehouse(id: string): Promise<void> {
  const { error } = await client()
    .from("warehouses")
    .update({ is_archived: true, is_listed: false })
    .eq("id", id);
  if (error) throw error;
}

export async function toggleListing(id: string, isListed: boolean): Promise<void> {
  const { error } = await client().from("warehouses").update({ is_listed: isListed }).eq("id", id);
  if (error) throw error;
}

/* ── Sections ──────────────────────────────────────────────────────────── */

export type SectionInput = {
  warehouse_id: string;
  name: string;
  commodity_category: CommodityCategory;
  capacity_kg: number;
  temp_min_c: number | null;
  temp_max_c: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  notes: string | null;
};

export async function createSection(input: SectionInput): Promise<WarehouseSection> {
  const { data, error } = await client()
    .from("warehouse_sections")
    .insert({ ...input, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data as WarehouseSection;
}

export async function updateSection(
  id: string,
  patch: Partial<SectionInput> & { is_active?: boolean }
): Promise<void> {
  const { error } = await client().from("warehouse_sections").update(patch).eq("id", id);
  if (error) throw error;
}

/** Sections may not add up to more than the warehouse can hold. */
export function sectionsOverAllocated(
  sections: WarehouseSection[],
  warehouseCapacityKg: number
): { over: boolean; allocated: number } {
  const allocated = sections.reduce((s, sec) => s + Number(sec.capacity_kg), 0);
  return { over: allocated > Number(warehouseCapacityKg), allocated };
}

/* ── Storage requests & quotations ─────────────────────────────────────── */

export type OwnerRequestInput = {
  warehouse_id: string;
  crop_name: string;
  variety: string | null;
  quantity: number;
  quantity_unit: QuantityUnit;
  storage_type: WarehouseType;
  starts_on: string;
  duration_days: number;
  notes: string | null;
};

export async function createOwnStorageRequest(input: OwnerRequestInput): Promise<StorageRequest> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("storage_requests")
    .insert({
      requester_id: me,
      warehouse_id: input.warehouse_id,
      crop_name: input.crop_name,
      variety: input.variety,
      quantity_kg: toKg(input.quantity, input.quantity_unit),
      quantity_unit: input.quantity_unit,
      storage_type: input.storage_type,
      starts_on: input.starts_on,
      duration_days: input.duration_days,
      notes: input.notes,
      status: "open",
    })
    .select()
    .single();
  if (error) throw error;
  return data as StorageRequest;
}

export type QuotationInput = {
  request_id: string;
  warehouse_id: string;
  section_id: string | null;
  storage_price_inr: number;
  loading_price_inr: number;
  unloading_price_inr: number;
  handling_price_inr: number;
  other_price_inr: number;
  other_price_note: string | null;
  valid_until: string | null;
  message: string | null;
};

/**
 * Send a priced quotation.
 *
 * `total_inr` is the sum of the itemised parts, computed here and stored, so the
 * customer can never be shown one number and invoiced another.
 */
export async function sendQuotation(input: QuotationInput) {
  const me = await currentUserId();
  const total =
    Number(input.storage_price_inr) +
    Number(input.loading_price_inr) +
    Number(input.unloading_price_inr) +
    Number(input.handling_price_inr) +
    Number(input.other_price_inr);

  const { data, error } = await client()
    .from("storage_quotations")
    .insert({ ...input, owner_id: me, total_inr: total, status: "sent" })
    .select()
    .single();
  if (error) throw error;

  // The request is no longer "open to everyone" once it has been quoted.
  await client().from("storage_requests").update({ status: "quoted" }).eq("id", input.request_id);

  return data;
}

export async function withdrawQuotation(id: string, requestId: string): Promise<void> {
  const { error } = await client()
    .from("storage_quotations")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .eq("status", "sent");
  if (error) throw error;

  // If no live quotation remains, put the request back on the board.
  const { data } = await client()
    .from("storage_quotations")
    .select("id")
    .eq("request_id", requestId)
    .eq("status", "sent");
  if ((data ?? []).length === 0) {
    await client().from("storage_requests").update({ status: "open" }).eq("id", requestId);
  }
}

/* ── Bookings ──────────────────────────────────────────────────────────── */

export type BookingInput = {
  warehouse_id: string;
  farmer_id: string;
  quantity_kg: number;
  starts_on: string;
  ends_on: string;
  request_id?: string | null;
  quotation_id?: string | null;
  section_id?: string | null;
  depositor_name?: string | null;
  depositor_role?: string | null;
  crop_name?: string | null;
  variety?: string | null;
  agreed_price_inr?: number;
  expected_inward_on?: string | null;
  notes?: string | null;
};

/**
 * Create a booking for a storage request.
 *
 * Starts at `confirmed` only when the owner is accepting a request they already
 * priced; otherwise it starts at `accepted` and capacity is reserved by the
 * database trigger when the status reaches `confirmed`.
 */
export async function createBooking(input: BookingInput): Promise<StorageBooking> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("storage_bookings")
    .insert({ ...input, owner_id: me, status: "accepted" })
    .select()
    .single();
  if (error) throw error;

  if (input.request_id) {
    await client()
      .from("storage_requests")
      .update({ status: "accepted" })
      .eq("id", input.request_id);
  }
  return data as StorageBooking;
}

/** Move a booking to its next status. The database trigger is the real guard. */
export async function setBookingStatus(
  id: string,
  status: StorageBookingStatus,
  reason?: string | null
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "cancelled" && reason) patch.cancel_reason = reason;
  const { error } = await client().from("storage_bookings").update(patch).eq("id", id);
  if (error) throw error;
}

export async function assignSection(bookingId: string, sectionId: string | null): Promise<void> {
  const { error } = await client()
    .from("storage_bookings")
    .update({ section_id: sectionId })
    .eq("id", bookingId);
  if (error) throw error;
}

/* ── Goods inward ──────────────────────────────────────────────────────── */

export type ReceiptInput = {
  booking_id: string;
  warehouse_id: string;
  expected_kg: number | null;
  received_kg: number;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  weight_slip_no: string | null;
  bags_count: number | null;
  photos: string[];
  section_id: string | null;
  storage_location: string | null;
};

/** GRN number the gateway never has to guess: date + short random suffix. */
function documentNumber(prefix: string): string {
  const stamp = new Date()
    .toISOString()
    .slice(2, 10)
    .replace(/-/g, "");
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 5).toUpperCase()
      : Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${unique}`;
}

/**
 * Record a goods receipt.
 *
 * The database trigger creates the inventory lot, moves capacity from reserved
 * to occupied, writes the ledger entry and updates the booking — all in one
 * transaction. If capacity is short, nothing at all is written.
 */
export async function recordReceipt(input: ReceiptInput): Promise<GoodsReceipt> {
  const me = await currentUserId();
  const expected = input.expected_kg;
  const discrepancy =
    expected != null && Math.abs(expected - input.received_kg) > 0.01 * Math.max(expected, 1);

  const { data, error } = await client()
    .from("goods_receipts")
    .insert({
      ...input,
      grn_no: documentNumber("GRN"),
      received_by: me,
      discrepancy,
      discrepancy_note: discrepancy
        ? `Expected ${expected} kg, received ${input.received_kg} kg.`
        : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as GoodsReceipt;
}

/* ── Goods outward ─────────────────────────────────────────────────────── */

export type DispatchInput = {
  booking_id: string;
  lot_id: string;
  warehouse_id: string;
  requested_kg: number;
  dispatched_kg: number;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  dispatch_weight_slip: string | null;
  gate_pass_no: string | null;
  photos: string[];
  notes: string | null;
};

export async function recordDispatch(input: DispatchInput): Promise<GoodsDispatch> {
  const me = await currentUserId();

  // Read the lot first so the message is specific; the trigger re-checks under
  // a lock so a stale screen can never over-release.
  const { data: lot, error: lotError } = await client()
    .from("inventory_lots")
    .select("current_kg, lot_no")
    .eq("id", input.lot_id)
    .single();
  if (lotError) throw lotError;
  if (input.dispatched_kg > Number((lot as { current_kg: number }).current_kg)) {
    throw new Error(
      `Only ${(lot as { current_kg: number }).current_kg} kg remains in lot ${(lot as { lot_no: string }).lot_no}.`
    );
  }

  const { data, error } = await client()
    .from("goods_dispatches")
    .insert({
      ...input,
      dispatch_no: documentNumber("DSP"),
      dispatched_by: me,
      partial: input.dispatched_kg < Number((lot as { current_kg: number }).current_kg),
    })
    .select()
    .single();
  if (error) throw error;
  return data as GoodsDispatch;
}

/* ── Inventory adjustments (never silent) ──────────────────────────────── */

/**
 * Adjust a lot's quantity with an explicit reason.
 *
 * This does NOT invent a second write path in SQL: the trigger on the dispatch
 * table owns releases, and this function owns corrections. The ledger row is
 * written by `recordAdjustment` in the same transaction as the lot update, so
 * the two can never disagree.
 */
export async function adjustLot(params: {
  lot: Pick<InventoryLot, "id" | "current_kg">;
  newKg: number;
  kind: "adjustment" | "damage" | "disposal";
  reason: string;
}): Promise<void> {
  const me = await currentUserId();
  const { lot, newKg, kind, reason } = params;
  if (!reason.trim() || reason.trim().length < 3) {
    throw new Error("Give a reason for the adjustment — it is recorded against your account.");
  }
  if (newKg < 0) throw new Error("The quantity cannot be negative.");
  if (newKg > Number(lot.current_kg) && kind !== "adjustment") {
    throw new Error("Damage and disposal can only reduce the recorded quantity.");
  }

  const { error: txError } = await client().from("inventory_transactions").insert({
    lot_id: lot.id,
    kind,
    quantity_kg: newKg - Number(lot.current_kg),
    balance_after_kg: newKg,
    reason: reason.trim(),
    actor_id: me,
  });
  if (txError) throw txError;

  const { error } = await client()
    .from("inventory_lots")
    .update({
      current_kg: newKg,
      status: newKg === 0 ? "released" : "partially_released",
    })
    .eq("id", lot.id);
  if (error) throw error;
}

/* ── Inspections ───────────────────────────────────────────────────────── */

export type InspectionInput = {
  warehouse_id: string;
  booking_id: string | null;
  lot_id: string | null;
  kind: StorageInspection["kind"];
  inspector_name: string | null;
  moisture_pct: number | null;
  grade: string | null;
  pest_damage: boolean;
  damage_notes: string | null;
  damaged_kg: number;
  rejected_kg: number;
  photos: string[];
  result: "passed" | "conditional" | "failed";
  quantity_before_kg: number | null;
  notes: string | null;
};

/**
 * An inspection records what was SEEN. It never changes the stored quantity:
 * `quantity_after_kg` is left empty until an authorised adjustment is applied
 * separately, which is how a dispute stays traceable.
 */
export async function recordInspection(input: InspectionInput): Promise<StorageInspection> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("storage_inspections")
    .insert({
      ...input,
      inspector_id: me,
      quantity_after_kg: input.quantity_before_kg,
      adjustment_applied: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as StorageInspection;
}

/* ── Readings ──────────────────────────────────────────────────────────── */

export type ReadingInput = {
  warehouse_id: string;
  section_id: string | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  moisture_pct: number | null;
  ventilation: "good" | "fair" | "poor" | null;
  pest_seen: boolean | null;
  fumigated_on: string | null;
  notes: string | null;
};

/**
 * A reading taken by hand.
 *
 * `source` is always 'manual' here — the UI shows it as such. A sensor feed
 * would write with its own device id and is deliberately not simulated.
 */
export async function recordReading(input: ReadingInput): Promise<StorageReading> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("storage_readings")
    .insert({ ...input, source: "manual", recorded_by: me })
    .select()
    .single();
  if (error) throw error;
  return data as StorageReading;
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

export type PricingPlanInput = {
  warehouse_id: string;
  name: string;
  commodity_category: CommodityCategory;
  billing_unit: BillingUnit;
  rate_inr: number;
  minimum_days: number;
  fixed_period_days: number | null;
  cold_premium_pct: number;
  loading_rate_inr: number;
  unloading_rate_inr: number;
  handling_rate_inr: number;
  other_service_label: string | null;
  other_service_rate_inr: number;
};

export async function createPricingPlan(input: PricingPlanInput): Promise<StoragePricingPlan> {
  const { data, error } = await client()
    .from("storage_pricing_plans")
    .insert({ ...input, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data as StoragePricingPlan;
}

export async function updatePricingPlan(
  id: string,
  patch: Partial<PricingPlanInput> & { is_active?: boolean }
): Promise<void> {
  const { error } = await client().from("storage_pricing_plans").update(patch).eq("id", id);
  if (error) throw error;
}

/* ── Staff ─────────────────────────────────────────────────────────────── */

export type StaffInput = {
  warehouse_id: string;
  full_name: string;
  phone: string | null;
  role: StaffRole;
  can_inward: boolean;
  can_outward: boolean;
  can_inspect: boolean;
  can_manage_pricing: boolean;
  notes: string | null;
};

export async function createStaff(input: StaffInput): Promise<WarehouseStaff> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_staff")
    .insert({ ...input, owner_id: me, status: "active" })
    .select()
    .single();
  if (error) throw error;
  return data as WarehouseStaff;
}

export async function updateStaff(
  id: string,
  patch: Partial<StaffInput> & { status?: WarehouseStaff["status"] }
): Promise<void> {
  const { error } = await client().from("warehouse_staff").update(patch).eq("id", id);
  if (error) throw error;
}

export async function removeStaff(id: string): Promise<void> {
  const { error } = await client()
    .from("warehouse_staff")
    .update({ status: "removed" })
    .eq("id", id);
  if (error) throw error;
}

/* ── Communication ─────────────────────────────────────────────────────── */

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client()
    .from("warehouse_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const me = await currentUserId();
  const { error } = await client()
    .from("warehouse_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("owner_id", me)
    .is("read_at", null);
  if (error) throw error;
}

export async function sendMessage(params: {
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  booking_id: string | null;
  body: string;
}): Promise<WarehouseMessage> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("warehouse_messages")
    .insert({ ...params, owner_id: me, direction: "out" })
    .select()
    .single();
  if (error) throw error;
  return data as WarehouseMessage;
}

/* ── Documents & private storage ───────────────────────────────────────── */

export const WAREHOUSE_BUCKET = "warehouse-documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const ACCEPTED_DOCUMENT_TYPES = DOCUMENT_TYPES.join(",");

export function validateDocument(file: File): string | null {
  if (!DOCUMENT_TYPES.includes(file.type)) return "Use a JPG, PNG, WebP or PDF file.";
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 10 MB.`;
  }
  return null;
}

/**
 * Upload into the PRIVATE bucket and return the object path.
 *
 * The path is `<user-id>/<name>`, which is exactly what the storage policies in
 * section 15 of warehouse.sql check. No public URL is produced.
 */
export async function uploadPrivateFile(file: File, prefix?: string): Promise<string> {
  const invalid = validateDocument(file);
  if (invalid) throw new Error(invalid);

  const sb = client();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${user.id}/${prefix ? `${prefix}-` : ""}${unique}.${ext || "bin"}`;

  const { error } = await sb.storage
    .from(WAREHOUSE_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        "Private storage is not set up yet. Run database/supabase/warehouse.sql in Supabase."
      );
    }
    if (/row-level security|policy|not allowed/i.test(error.message)) {
      throw new Error("You do not have permission to upload to this bucket.");
    }
    throw error;
  }
  return path;
}

/** Short-lived link to a private file, for the owner only. */
export async function signedFileUrl(path: string): Promise<string | null> {
  const { data, error } = await client().storage.from(WAREHOUSE_BUCKET).createSignedUrl(path, 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function uploadDocument(input: {
  file: File;
  kind: WarehouseDocumentKind;
  warehouse_id?: string | null;
}): Promise<WarehouseDocument> {
  const me = await currentUserId();
  const path = await uploadPrivateFile(input.file, input.kind);

  const { data, error } = await client()
    .from("warehouse_documents")
    .insert({
      owner_id: me,
      warehouse_id: input.warehouse_id ?? null,
      kind: input.kind,
      document_url: path,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    // The object is already in storage; drop it so a failed row leaves no orphan.
    await client().storage.from(WAREHOUSE_BUCKET).remove([path]);
    throw error;
  }
  return data as WarehouseDocument;
}

export async function deleteDocument(doc: WarehouseDocument): Promise<void> {
  if (doc.status !== "pending") {
    throw new Error("A reviewed document cannot be removed. Contact support to replace it.");
  }
  const { error } = await client().from("warehouse_documents").delete().eq("id", doc.id);
  if (error) throw error;
  try {
    await client().storage.from(WAREHOUSE_BUCKET).remove([doc.document_url]);
  } catch {
    /* the row is gone; an orphaned object is harmless */
  }
}

/* ── Transport hand-off (reuse, never re-implement) ────────────────────── */

/**
 * Ask the existing transporter module for a vehicle.
 *
 * This writes an ordinary `transport_requests` row — the very table the
 * transporter account already browses and quotes. No second trip, booking or
 * vehicle system is introduced.
 */
export async function requestTransport(params: {
  pickup: string;
  dropoff: string;
  load_kg: number;
  needed_on: string | null;
  title?: string;
  notes?: string | null;
}): Promise<{ id: string }> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_requests")
    .insert({
      requester_id: me,
      pickup: params.pickup,
      dropoff: params.dropoff,
      load_kg: params.load_kg,
      needed_on: params.needed_on,
      status: "open",
      title: params.title ?? "Storage goods movement",
      cargo_type: "Produce",
      notes: params.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

/** The owner's own transport requests, so the hand-off can be followed. */
export async function listMyTransportRequests() {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_requests")
    .select("id, title, pickup, dropoff, load_kg, needed_on, status, created_at")
    .eq("requester_id", me)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

/* ── Aggregation helper for the dashboard ──────────────────────────────── */

/** Lots currently held, used by the overview and inventory screens. */
export async function lotsInCustody(): Promise<InventoryLot[]> {
  const lots = await listLotsForOwner();
  return lots.filter((l) => l.status !== "released");
}
