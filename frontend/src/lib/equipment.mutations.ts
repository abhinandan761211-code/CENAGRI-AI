/**
 * Equipment module — writes.
 *
 * The real guards live in the database: the overlap trigger, the maintenance
 * block guard, the operator guard and the status-transition trigger. This layer
 * validates for a clear message and never replaces a database rule with a
 * client-side one.
 *
 * Documents and photographs go to the private `equipment-documents` bucket and
 * only the object path is stored.
 */
import { supabase } from "@/lib/supabase";
import { currentUserId } from "@/lib/equipment.queries";
import { legacyKind } from "@/lib/equipment.types";
import type {
  BookingStatus,
  DocumentKind,
  ExpenseKind,
  MaintenanceKind,
  OperatorStatus,
  RateUnit,
} from "@/lib/equipment.types";
import type {
  Equipment,
  EquipmentAgreement,
  EquipmentBlock,
  EquipmentBooking,
  EquipmentDocument,
  EquipmentExpense,
  EquipmentMessage,
  EquipmentOperator,
  EquipmentPricing,
  EquipmentQuotation,
  EquipmentReview,
  MaintenanceRecord,
  RentalRequest,
} from "@/lib/equipment.entities";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

function documentNumber(prefix: string): string {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 5).toUpperCase()
      : Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${unique}`;
}

/* ── Equipment ─────────────────────────────────────────────────────────── */

export type EquipmentInput = {
  title: string;
  category: string;
  brand: string | null;
  model: string | null;
  manufacture_year: number | null;
  registration_no: string | null;
  specifications: string | null;
  capacity_text: string | null;
  hourly_capacity_acres: number | null;
  hp: number | null;
  images: string[];
  location_text: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  service_districts: string[];
  service_radius_km: number | null;
  offers_delivery: boolean;
  condition_score: number;
  fuel_type: string | null;
  fuel_included: boolean;
  operator_available: boolean;
  operator_included: boolean;
  description: string | null;
  is_listed: boolean;
  rate_inr: number;
  rate_unit: RateUnit;
};

/**
 * Register a machine.
 *
 * `kind` and `rate_inr`/`rate_unit` are written too, because features.sql
 * declares them NOT NULL and the farmer-facing rental screen reads them.
 */
export async function createEquipment(input: EquipmentInput): Promise<Equipment> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("equipment")
    .insert({
      ...input,
      owner_id: ownerId,
      kind: legacyKind(input.category),
      status: "available",
      available: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Equipment;
}

export async function updateEquipment(id: string, patch: Partial<EquipmentInput>): Promise<Equipment> {
  const update: Record<string, unknown> = { ...patch };
  if (patch.category) update.kind = legacyKind(patch.category);

  const { data, error } = await client()
    .from("equipment")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Equipment;
}

/**
 * Archive instead of delete, so booking history keeps pointing at something.
 * A machine with a live booking cannot even be archived.
 */
export async function archiveEquipment(id: string, hasActiveBooking: boolean): Promise<void> {
  if (hasActiveBooking) {
    throw new Error("This machine has an active booking. Cancel or close it before archiving.");
  }
  const { error } = await client()
    .from("equipment")
    .update({ is_archived: true, is_listed: false })
    .eq("id", id);
  if (error) throw error;
}

export async function toggleListing(id: string, isListed: boolean): Promise<void> {
  const { error } = await client().from("equipment").update({ is_listed: isListed }).eq("id", id);
  if (error) throw error;
}

export async function setEquipmentStatus(id: string, status: Equipment["status"]): Promise<void> {
  const { error } = await client()
    .from("equipment")
    .update({ status, available: status === "available" })
    .eq("id", id);
  if (error) throw error;
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

export type PricingInput = {
  rate_unit: RateUnit;
  base_rate_inr: number;
  minimum_hours: number | null;
  minimum_days: number | null;
  maximum_days: number | null;
  operator_rate_inr: number;
  fuel_rate_inr: number;
  transport_rate_inr: number;
  other_service_label: string | null;
  other_service_rate_inr: number;
  advance_percent: number;
  cancellation_policy: string | null;
};

export async function savePricing(
  equipmentId: string,
  input: PricingInput
): Promise<EquipmentPricing> {
  const { data, error } = await client()
    .from("equipment_pricing")
    .upsert({ ...input, equipment_id: equipmentId }, { onConflict: "equipment_id" })
    .select()
    .single();
  if (error) throw error;
  return data as EquipmentPricing;
}

/* ── Operators ─────────────────────────────────────────────────────────── */

export type OperatorInput = {
  full_name: string;
  phone: string | null;
  phone_verified: boolean;
  experience_years: number;
  skills: string[];
  licence_no: string | null;
  licence_expiry: string | null;
  status: OperatorStatus;
  notes: string | null;
};

export async function createOperator(input: OperatorInput): Promise<EquipmentOperator> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("equipment_operators")
    .insert({ ...input, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as EquipmentOperator;
}

export async function updateOperator(id: string, patch: Partial<OperatorInput>): Promise<void> {
  const { error } = await client().from("equipment_operators").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOperator(id: string): Promise<void> {
  const { error } = await client().from("equipment_operators").update({ status: "inactive" }).eq("id", id);
  if (error) throw error;
}

/* ── Requests & quotations ─────────────────────────────────────────────── */

export type OwnerRequestInput = {
  equipment_id: string;
  requester_id: string;
  requester_name: string | null;
  farm_location: string | null;
  required_from: string;
  duration_days: number;
};

/** Owner-side request, used when a renter phones instead of using the app. */
export async function createOwnerRequest(input: OwnerRequestInput): Promise<RentalRequest> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_rental_requests")
    .insert({
      requester_id: input.requester_id,
      equipment_id: input.equipment_id,
      owner_id: me,
      requester_name: input.requester_name,
      farm_location: input.farm_location,
      required_from: input.required_from,
      duration_days: input.duration_days,
      status: "open",
    })
    .select()
    .single();
  if (error) throw error;
  return data as RentalRequest;
}

export type QuotationInput = {
  request_id: string;
  equipment_id: string;
  rental_inr: number;
  operator_inr: number;
  fuel_inr: number;
  transport_inr: number;
  other_inr: number;
  other_note: string | null;
  operator_included: boolean;
  fuel_included: boolean;
  transport_included: boolean;
  valid_until: string | null;
  message: string | null;
};

/**
 * Send an itemised quotation. `total_inr` is the sum of the parts, computed
 * here and stored, so the customer can never be shown one number and invoiced
 * another.
 */
export async function sendQuotation(input: QuotationInput): Promise<EquipmentQuotation> {
  const me = await currentUserId();
  const total =
    Number(input.rental_inr) +
    Number(input.operator_inr) +
    Number(input.fuel_inr) +
    Number(input.transport_inr) +
    Number(input.other_inr);

  const { data, error } = await client()
    .from("equipment_quotations")
    .insert({ ...input, owner_id: me, total_inr: total, status: "sent" })
    .select()
    .single();
  if (error) throw error;

  await client().from("equipment_rental_requests").update({ status: "quoted" }).eq("id", input.request_id);
  return data as EquipmentQuotation;
}

export async function withdrawQuotation(id: string, requestId: string): Promise<void> {
  const { error } = await client()
    .from("equipment_quotations")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .eq("status", "sent");
  if (error) throw error;

  const { data } = await client()
    .from("equipment_quotations")
    .select("id")
    .eq("request_id", requestId)
    .eq("status", "sent");
  if ((data ?? []).length === 0) {
    await client().from("equipment_rental_requests").update({ status: "open" }).eq("id", requestId);
  }
}

/* ── Bookings ──────────────────────────────────────────────────────────── */

export type BookingInput = {
  equipment_id: string;
  renter_id: string;
  renter_name: string | null;
  starts_on: string;
  ends_on: string;
  request_id?: string | null;
  quotation_id?: string | null;
  farm_location?: string | null;
  work_type?: string | null;
  land_area_acres?: number | null;
  agreed_price_inr?: number;
  operator_included?: boolean;
  fuel_included?: boolean;
  transport_included?: boolean;
};

/**
 * Create a booking.
 *
 * The overlap and maintenance guards run in the database before the row lands,
 * so a conflicting period is rejected even if the UI thought it was free.
 */
export async function createBooking(input: BookingInput): Promise<EquipmentBooking> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_bookings")
    .insert({ ...input, owner_id: me, status: "accepted" })
    .select()
    .single();
  if (error) throw error;

  if (input.request_id) {
    await client().from("equipment_rental_requests").update({ status: "accepted" }).eq("id", input.request_id);
  }
  return data as EquipmentBooking;
}

export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  reason?: string | null
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "cancelled" && reason) patch.cancel_reason = reason;
  const { error } = await client().from("equipment_bookings").update(patch).eq("id", id);
  if (error) throw error;
}

export async function assignOperator(bookingId: string, operatorId: string): Promise<void> {
  const { error } = await client()
    .from("equipment_bookings")
    .update({ operator_id: operatorId })
    .eq("id", bookingId);
  if (error) throw error;
}

/**
 * Record work completion.
 *
 * This fills in what actually happened — hours, acreage, photographs — and
 * stops short of confirming payment, which is backend-owned.
 */
export async function recordCompletion(params: {
  bookingId: string;
  workHours: number | null;
  completedAcres: number | null;
  notes: string | null;
  photos: string[];
}): Promise<void> {
  const { error } = await client()
    .from("equipment_bookings")
    .update({
      work_hours: params.workHours,
      completed_acres: params.completedAcres,
      completion_notes: params.notes,
      completion_photos: params.photos,
      status: "work_completed",
    })
    .eq("id", params.bookingId);
  if (error) throw error;
}

/* ── Availability blocks ───────────────────────────────────────────────── */

export async function createBlock(params: {
  equipment_id: string;
  kind: EquipmentBlock["kind"];
  starts_on: string;
  ends_on: string;
  reason: string | null;
}): Promise<EquipmentBlock> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_availability_blocks")
    .insert({ ...params, created_by: me })
    .select()
    .single();
  if (error) throw error;
  return data as EquipmentBlock;
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await client().from("equipment_availability_blocks").delete().eq("id", id);
  if (error) throw error;
}

/* ── Maintenance ───────────────────────────────────────────────────────── */

export type MaintenanceInput = {
  equipment_id: string;
  kind: MaintenanceKind;
  description: string;
  cost_inr: number;
  parts: string | null;
  workshop: string | null;
  odometer_hours: number | null;
  service_on: string;
  next_due_on: string | null;
  downtime_days: number | null;
  createBlock: boolean;
};

/**
 * Log maintenance.
 *
 * Optionally blocks the machine for the repair window in the same flow, so a
 * service record and the calendar entry cannot drift apart.
 */
export async function recordMaintenance(input: MaintenanceInput): Promise<MaintenanceRecord> {
  const me = await currentUserId();
  const { createBlock: shouldBlock, ...row } = input;

  const { data, error } = await client()
    .from("equipment_maintenance")
    .insert({ ...row, owner_id: me })
    .select()
    .single();
  if (error) throw error;

  // Keep the machine's own service dates in step.
  const patch: Record<string, unknown> = { last_service_on: input.service_on };
  if (input.next_due_on) patch.next_service_on = input.next_due_on;
  if (input.kind === "breakdown" || input.kind === "repair") patch.status = "maintenance";
  await client().from("equipment").update(patch).eq("id", input.equipment_id);

  if (shouldBlock && input.downtime_days != null && input.downtime_days > 0) {
    const end = new Date(`${input.service_on}T00:00:00`);
    end.setDate(end.getDate() + input.downtime_days - 1);
    await client()
      .from("equipment_availability_blocks")
      .insert({
        equipment_id: input.equipment_id,
        kind: "maintenance",
        starts_on: input.service_on,
        ends_on: end.toISOString().slice(0, 10),
        reason: input.description.slice(0, 200),
        created_by: me,
      });
  }

  return data as MaintenanceRecord;
}

/* ── Agreements ────────────────────────────────────────────────────────── */

export type AgreementInput = {
  booking_id: string;
  renter_id: string;
  terms: string;
  fuel_policy: string | null;
  operator_policy: string | null;
  transport_policy: string | null;
  damage_terms: string | null;
  cancellation_terms: string | null;
};

export async function createAgreement(input: AgreementInput): Promise<EquipmentAgreement> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_rental_agreements")
    .insert({ ...input, owner_id: me, owner_confirmed_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as EquipmentAgreement;
}

/* ── Reviews ───────────────────────────────────────────────────────────── */

export async function reportReview(id: string, reason: string): Promise<void> {
  const { error } = await client()
    .from("equipment_reviews")
    .update({ is_reported: true, report_reason: reason })
    .eq("id", id);
  if (error) throw error;
}

/* ── Expenses ──────────────────────────────────────────────────────────── */

export async function addExpense(input: {
  equipment_id: string | null;
  booking_id: string | null;
  kind: ExpenseKind;
  amount_inr: number;
  estimated: boolean;
  note: string | null;
  spent_on: string;
}): Promise<EquipmentExpense> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_expenses")
    .insert({ ...input, owner_id: me })
    .select()
    .single();
  if (error) throw error;
  return data as EquipmentExpense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await client().from("equipment_expenses").delete().eq("id", id);
  if (error) throw error;
}

/* ── Communication ─────────────────────────────────────────────────────── */

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client()
    .from("equipment_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const me = await currentUserId();
  const { error } = await client()
    .from("equipment_notifications")
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
}): Promise<EquipmentMessage> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("equipment_messages")
    .insert({ ...params, owner_id: me, direction: "out" })
    .select()
    .single();
  if (error) throw error;
  return data as EquipmentMessage;
}

/* ── Documents & private storage ───────────────────────────────────────── */

export const EQUIPMENT_BUCKET = "equipment-documents";
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

/** Upload into the private bucket; returns the object path, never a URL. */
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
    .from(EQUIPMENT_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error("Private storage is not set up yet. Run database/supabase/equipment.sql in Supabase.");
    }
    if (/row-level security|policy|not allowed/i.test(error.message)) {
      throw new Error("You do not have permission to upload to this bucket.");
    }
    throw error;
  }
  return path;
}

export async function signedFileUrl(path: string): Promise<string | null> {
  const { data, error } = await client().storage.from(EQUIPMENT_BUCKET).createSignedUrl(path, 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function uploadDocument(input: {
  file: File;
  kind: DocumentKind;
  equipment_id?: string | null;
  operator_id?: string | null;
}): Promise<EquipmentDocument> {
  const me = await currentUserId();
  const path = await uploadPrivateFile(input.file, input.kind);

  const { data, error } = await client()
    .from("equipment_documents")
    .insert({
      owner_id: me,
      equipment_id: input.equipment_id ?? null,
      operator_id: input.operator_id ?? null,
      kind: input.kind,
      document_url: path,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    await client().storage.from(EQUIPMENT_BUCKET).remove([path]);
    throw error;
  }
  return data as EquipmentDocument;
}

export async function deleteDocument(doc: EquipmentDocument): Promise<void> {
  if (doc.status !== "pending") {
    throw new Error("A reviewed document cannot be removed. Contact support to replace it.");
  }
  const { error } = await client().from("equipment_documents").delete().eq("id", doc.id);
  if (error) throw error;
  try {
    await client().storage.from(EQUIPMENT_BUCKET).remove([doc.document_url]);
  } catch {
    /* the row is gone; an orphaned object is harmless */
  }
}
