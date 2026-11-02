/**
 * Transporter data layer — agricultural logistics.
 *
 * A transporter moves cargo for farmers, buyers, retailers and warehouses. The
 * module is a lifecycle: transport request → quote (offer) → booking → trip →
 * proof of delivery → invoice → review.
 *
 * All Supabase access for the transporter screens lives here so the pages stay
 * presentational. Nothing is mocked: a missing table raises a real error and an
 * empty table renders an empty state. The signed-in account's id is always
 * taken from the verified session — never from a value a caller passes in.
 *
 * Authorisation is enforced by RLS in `database/supabase/transporter.sql`.
 */
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** Friendly message for the errors a fresh deploy can actually hit. */
export function describeTransporterError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  if (/relation|does not exist|schema cache|not find the table/i.test(message)) {
    return "The transporter tables are not set up yet. Run database/supabase/transporter.sql in Supabase.";
  }
  if (/cannot be reopened/i.test(message)) {
    return "This booking is finished or cancelled and cannot be reopened.";
  }
  if (/cannot move booking/i.test(message)) {
    return "That status change is not allowed from the current stage.";
  }
  if (/duplicate key/i.test(message)) {
    return "You have already sent a quote for this request.";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Your account is not allowed to do that.";
  }
  return message || "Something went wrong. Please try again.";
}

/* ── Domain constants ──────────────────────────────────────────────────── */

export const VEHICLE_TYPES = [
  "Tractor Trolley",
  "Pickup",
  "Mini Truck",
  "Light Commercial Vehicle",
  "Heavy Truck",
  "Refrigerated Truck",
  "Other",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const FUEL_TYPES = ["Diesel", "Petrol", "CNG", "Electric", "Other"] as const;

export const CARGO_TYPES = [
  "Produce",
  "Seeds & Fertiliser",
  "Machinery",
  "Livestock",
  "Cold Chain",
  "Other",
] as const;
export type CargoType = (typeof CARGO_TYPES)[number];

export const BOOKING_STATUSES = [
  "requested",
  "quotation_submitted",
  "accepted",
  "confirmed",
  "vehicle_assigned",
  "driver_assigned",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Requested",
  quotation_submitted: "Quotation submitted",
  accepted: "Accepted",
  confirmed: "Confirmed",
  vehicle_assigned: "Vehicle assigned",
  driver_assigned: "Driver assigned",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export const BOOKING_STATUS_STYLE: Record<BookingStatus, { dot: string; badge: string }> = {
  requested: { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700" },
  quotation_submitted: { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-800" },
  accepted: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  confirmed: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  vehicle_assigned: { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800" },
  driver_assigned: { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800" },
  pickup_scheduled: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  picked_up: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  in_transit: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  delivered: { dot: "bg-teal-500", badge: "bg-teal-100 text-teal-800" },
  completed: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  cancelled: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
  disputed: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
};

/**
 * The next legal steps from each status. This mirrors the database trigger in
 * section 9 of transporter.sql — the database is the authority, this only
 * decides which buttons to show.
 */
export const NEXT_STATUSES: Partial<Record<BookingStatus, BookingStatus[]>> = {
  requested: ["confirmed", "cancelled"],
  quotation_submitted: ["confirmed", "cancelled"],
  accepted: ["confirmed", "vehicle_assigned", "cancelled"],
  confirmed: ["vehicle_assigned", "cancelled"],
  vehicle_assigned: ["driver_assigned", "cancelled"],
  driver_assigned: ["pickup_scheduled", "cancelled"],
  pickup_scheduled: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "delivered", "disputed"],
  in_transit: ["delivered", "disputed"],
  delivered: ["completed", "disputed"],
  disputed: ["delivered", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Statuses that mean the vehicle and driver are actually busy. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "pickup_scheduled",
  "picked_up",
  "in_transit",
];

export const EXPENSE_KINDS = [
  "fuel",
  "toll",
  "loading",
  "unloading",
  "driver",
  "maintenance",
  "other",
] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const EXPENSE_LABEL: Record<ExpenseKind, string> = {
  fuel: "Fuel",
  toll: "Toll / tax",
  loading: "Loading charges",
  unloading: "Unloading charges",
  driver: "Driver expenses",
  maintenance: "Maintenance",
  other: "Other",
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

export const REPORT_REASONS = [
  { value: "fake_request", label: "This request looks fake" },
  { value: "wrong_pay", label: "Agreed pay was not honoured" },
  { value: "unsafe", label: "Unsafe loading or transport" },
  { value: "damaged_cargo", label: "Cargo was damaged" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REPORT_STATUS_STYLE: Record<"open" | "reviewing" | "resolved" | "dismissed", string> = {
  open: "bg-amber-100 text-amber-800",
  reviewing: "bg-blue-100 text-blue-800",
  resolved: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-slate-100 text-slate-600",
};

/* ── Types ─────────────────────────────────────────────────────────────── */

export type TransporterProfile = {
  id: string;
  user_id: string;
  business_name: string | null;
  about: string | null;
  service_districts: string[];
  service_categories: string[];
  experience_years: number;
  contact_phone: string | null;
  operating_since: number | null;
  verification: "not_submitted" | "pending" | "verified" | "rejected";
  verified_at: string | null;
  rating_avg: number;
  rating_count: number;
  trips_completed: number;
  is_accepting: boolean;
};

export type Vehicle = {
  id: string;
  owner_id: string;
  kind: string;
  capacity_kg: number;
  district: string | null;
  state: string | null;
  available: boolean;
  registration_no: string | null;
  vehicle_type: VehicleType | null;
  make_model: string | null;
  manufacture_year: number | null;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  fuel_type: string | null;
  insurance_valid_till: string | null;
  fitness_valid_till: string | null;
  permit_no: string | null;
  permit_valid_till: string | null;
  rc_document_url: string | null;
  photo_url: string | null;
  odometer_km: number | null;
  last_service_on: string | null;
  next_service_on: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
};

export type FleetVehicle = Vehicle & { active_trips: number };

export type Driver = {
  id: string;
  transporter_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  licence_no: string | null;
  licence_expiry: string | null;
  licence_document_url: string | null;
  experience_years: number;
  assigned_vehicle_id: string | null;
  status: "available" | "on_trip" | "leave" | "inactive";
  notes: string | null;
  created_at: string;
};

export type TransportRequest = {
  id: string;
  requester_id: string;
  pickup: string;
  dropoff: string;
  load_kg: number | null;
  needed_on: string | null;
  status: "open" | "assigned" | "completed" | "cancelled";
  title: string | null;
  cargo_type: CargoType | null;
  commodity: string | null;
  quantity: string | null;
  weight_kg: number | null;
  pickup_district: string | null;
  pickup_state: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_district: string | null;
  dropoff_state: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  distance_km: number | null;
  vehicle_type: VehicleType | null;
  min_capacity_kg: number | null;
  pickup_on: string | null;
  pickup_time: string | null;
  needs_loading_help: boolean;
  needs_unloading_help: boolean;
  price_type: "fixed" | "offer";
  offered_price_inr: number | null;
  expires_on: string | null;
  requester_name: string | null;
  requester_role: string | null;
  requester_verified: boolean;
  notes: string | null;
  created_at: string;
};

export type TransportOffer = {
  id: string;
  request_id: string;
  transporter_id: string;
  price_inr: number;
  vehicle_id: string | null;
  driver_id: string | null;
  eta_hours: number | null;
  message: string | null;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  created_at: string;
  /** Joined when listing my offers. */
  request?: TransportRequest | null;
};

export type TransportBooking = {
  id: string;
  request_id: string | null;
  offer_id: string | null;
  transporter_id: string;
  requester_id: string;
  requester_name: string | null;
  requester_role: string | null;
  title: string;
  cargo_type: string | null;
  commodity: string | null;
  weight_kg: number | null;
  pickup: string;
  dropoff: string;
  pickup_district: string | null;
  dropoff_district: string | null;
  distance_km: number | null;
  agreed_price_inr: number;
  vehicle_id: string | null;
  driver_id: string | null;
  status: BookingStatus;
  pickup_on: string | null;
  pickup_time: string | null;
  expected_delivery_at: string | null;
  actual_delivery_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  /** From `transporter_booking_view`. */
  vehicle_registration?: string | null;
  vehicle_type?: VehicleType | null;
  vehicle_capacity_kg?: number | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_licence?: string | null;
  proof_status?: string | null;
  proof_receiver?: string | null;
  proof_delivered_at?: string | null;
  invoice_status?: InvoiceStatus | null;
  invoice_no?: string | null;
  invoice_amount?: number | null;
  /**
   * Destination coordinates, joined from `transport_requests`. The view does not
   * carry them, so a booking loaded without the join simply has null here — the
   * UI then reports the distance as unknown instead of guessing it.
   */
  request_dropoff_lat?: number | null;
  request_dropoff_lng?: number | null;
};

export type TripEvent = {
  id: string;
  booking_id: string;
  type: "status" | "note" | "document" | "location" | "delay";
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_id: string | null;
  created_at: string;
};

export type TripLocation = {
  id: string;
  booking_id: string;
  lat: number;
  lng: number;
  speed_kmph: number | null;
  accuracy_m: number | null;
  recorded_at: string;
};

export type DeliveryProof = {
  id: string;
  booking_id: string;
  receiver_name: string;
  receiver_phone: string | null;
  received_qty: string | null;
  damage_notes: string | null;
  notes: string | null;
  photo_url: string | null;
  otp_verified_at: string | null;
  delivered_at: string;
};

export type TripExpense = {
  id: string;
  booking_id: string;
  transporter_id: string;
  kind: ExpenseKind;
  amount_inr: number;
  estimated: boolean;
  receipt_url: string | null;
  note: string | null;
  spent_on: string;
  created_at: string;
};

export type TransportInvoice = {
  id: string;
  booking_id: string;
  transporter_id: string;
  requester_id: string | null;
  invoice_no: string;
  amount_inr: number;
  status: InvoiceStatus;
  issued_on: string;
  due_on: string | null;
  paid_on: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type TransportReview = {
  id: string;
  booking_id: string;
  transporter_id: string;
  reviewer_id: string;
  reviewer_role: "requester" | "transporter";
  rating: number;
  comment: string | null;
  is_reported: boolean;
  created_at: string;
};

export type TransporterNotification = {
  id: string;
  transporter_id: string;
  kind: "request" | "offer" | "booking" | "trip" | "payment" | "review" | "system";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type TransporterMessage = {
  id: string;
  transporter_id: string;
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  booking_id: string | null;
  direction: "in" | "out";
  body: string;
  attachment_url: string | null;
  read_at: string | null;
  created_at: string;
};

export const DOCUMENT_KINDS = [
  "business_registration",
  "vehicle_rc",
  "insurance",
  "fitness",
  "permit",
  "driver_licence",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  business_registration: "Business registration",
  vehicle_rc: "Vehicle RC",
  insurance: "Insurance",
  fitness: "Fitness certificate",
  permit: "Permit",
  driver_licence: "Driver licence",
  other: "Other document",
};

export type TransporterDocument = {
  id: string;
  transporter_id: string;
  kind: DocumentKind;
  /** Object path inside the private bucket — never a public URL. */
  document_url: string;
  vehicle_id: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
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

/** "08:30:00" → "8:30 AM". */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

/** Human file size, e.g. "3.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Weight in a unit a human reads: 1450 kg → "1.45 t". */
export function formatWeight(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(Number(kg))) return "—";
  const n = Number(kg);
  return n >= 1000 ? `${(n / 1000).toFixed(2)} t` : `${n.toLocaleString("en-IN")} kg`;
}

/**
 * Distance between two coordinates (haversine), in km.
 * Returns null when either point is unknown — this module never invents a
 * distance or an ETA from thin air.
 */
export function distanceKm(
  a: { lat: number | null; lng: number | null } | null,
  b: { lat: number | null; lng: number | null } | null
): number | null {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/* ── Session ───────────────────────────────────────────────────────────── */

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  return user.id;
}

/* ── Transporter profile ───────────────────────────────────────────────── */

export async function ensureTransporterProfile(seed?: {
  business_name?: string | null;
  contact_phone?: string | null;
  service_districts?: string[];
}): Promise<TransporterProfile> {
  const userId = await currentUserId();
  const { data: existing, error } = await client()
    .from("transporter_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as TransporterProfile;

  const { data, error: insertError } = await client()
    .from("transporter_profiles")
    .insert({
      user_id: userId,
      business_name: seed?.business_name ?? null,
      contact_phone: seed?.contact_phone ?? null,
      service_districts: seed?.service_districts ?? [],
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return data as TransporterProfile;
}

export type TransporterProfileInput = {
  business_name: string | null;
  about: string | null;
  contact_phone: string | null;
  service_districts: string[];
  service_categories: string[];
  experience_years: number;
  operating_since: number | null;
  is_accepting: boolean;
};

export async function saveTransporterProfile(
  input: TransporterProfileInput
): Promise<TransporterProfile> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("transporter_profiles")
    .upsert({ ...input, user_id: userId }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data as TransporterProfile;
}

export function profileCompletion(profile: TransporterProfile | null, vehicleCount: number): number {
  if (!profile) return 0;
  const checks = [
    Boolean(profile.business_name),
    Boolean(profile.contact_phone),
    Boolean(profile.about && profile.about.length > 20),
    profile.service_districts.length > 0,
    profile.service_categories.length > 0,
    profile.experience_years > 0,
    vehicleCount > 0,
    profile.verification !== "not_submitted",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/* ── Vehicles ──────────────────────────────────────────────────────────── */

export async function listFleet(): Promise<FleetVehicle[]> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("transporter_fleet_stats")
    .select("*")
    .eq("owner_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;

  // `transporter_fleet_stats` has no created_at, so fall back to the table order.
  return ((data ?? []) as FleetVehicle[]).map((row) => ({
    ...row,
    active_trips: Number(row.active_trips ?? 0),
  })) as FleetVehicle[];
}

export type VehicleInput = {
  registration_no: string;
  vehicle_type: VehicleType;
  make_model: string | null;
  manufacture_year: number | null;
  capacity_kg: number;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  fuel_type: string | null;
  district: string | null;
  state: string | null;
  insurance_valid_till: string | null;
  fitness_valid_till: string | null;
  permit_no: string | null;
  permit_valid_till: string | null;
  odometer_km: number | null;
  last_service_on: string | null;
  next_service_on: string | null;
  notes: string | null;
  available: boolean;
};

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("vehicles")
    .insert({
      ...input,
      owner_id: ownerId,
      // `kind` is the legacy column from features.sql; keep it in step so older
      // reads never see an empty value.
      kind: input.vehicle_type.includes("Truck")
        ? "Truck"
        : input.vehicle_type.includes("Tractor")
          ? "Tractor-trolley"
          : "Tempo",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Vehicle;
}

export async function updateVehicle(id: string, patch: Partial<VehicleInput>): Promise<Vehicle> {
  const { data, error } = await client()
    .from("vehicles")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Vehicle;
}

/** Archive, not delete: a vehicle on a booking history must stay traceable. */
export async function archiveVehicle(id: string): Promise<void> {
  const { error } = await client()
    .from("vehicles")
    .update({ is_archived: true, available: false })
    .eq("id", id);
  if (error) throw error;
}

export async function setVehicleAvailability(id: string, available: boolean): Promise<void> {
  const { error } = await client().from("vehicles").update({ available }).eq("id", id);
  if (error) throw error;
}

/** Compliance warnings for the fleet card: expired or expiring documents. */
export type VehicleAlert = { kind: "insurance" | "fitness" | "permit" | "service"; days: number };

export function vehicleAlerts(vehicle: FleetVehicle): VehicleAlert[] {
  const alerts: VehicleAlert[] = [];
  const check = (date: string | null, kind: VehicleAlert["kind"]) => {
    const days = daysUntil(date);
    if (days != null && days <= 30) alerts.push({ kind, days });
  };
  check(vehicle.insurance_valid_till, "insurance");
  check(vehicle.fitness_valid_till, "fitness");
  check(vehicle.permit_valid_till, "permit");
  check(vehicle.next_service_on, "service");
  return alerts;
}

/* ── Drivers ───────────────────────────────────────────────────────────── */

export async function listDrivers(): Promise<Driver[]> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("transporter_drivers")
    .select(
      "id, transporter_id, user_id, full_name, phone, licence_no, licence_expiry, licence_document_url, experience_years, assigned_vehicle_id, status, notes, created_at"
    )
    .eq("transporter_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Driver[];
}

export type DriverInput = {
  full_name: string;
  phone: string | null;
  licence_no: string | null;
  licence_expiry: string | null;
  experience_years: number;
  assigned_vehicle_id: string | null;
  status: Driver["status"];
  notes: string | null;
};

export async function createDriver(input: DriverInput): Promise<Driver> {
  const transporterId = await currentUserId();
  const { data, error } = await client()
    .from("transporter_drivers")
    .insert({ ...input, transporter_id: transporterId })
    .select()
    .single();
  if (error) throw error;
  return data as Driver;
}

export async function updateDriver(id: string, patch: Partial<DriverInput>): Promise<Driver> {
  const { data, error } = await client()
    .from("transporter_drivers")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Driver;
}

export async function deleteDriver(id: string): Promise<void> {
  const { error } = await client().from("transporter_drivers").delete().eq("id", id);
  if (error) throw error;
}

export function licenceState(driver: Driver): { expired: boolean; expiringSoon: boolean; days: number | null } {
  const days = daysUntil(driver.licence_expiry);
  if (days == null) return { expired: false, expiringSoon: false, days: null };
  return { expired: days < 0, expiringSoon: days >= 0 && days <= 30, days };
}

/* ── Transport requests ────────────────────────────────────────────────── */

export type RequestFilters = {
  search?: string;
  cargoType?: CargoType | "all";
  vehicleType?: VehicleType | "all";
  pickupDistrict?: string | "all";
  dropoffDistrict?: string | "all";
  minWeight?: number | null;
  maxWeight?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  pickupFrom?: string | null;
  pickupTo?: string | null;
  maxDistance?: number | null;
  openOnly?: boolean;
};

/**
 * Open transport requests other people posted.
 *
 * PostgREST cannot compare two columns, so "still open and not expired" is
 * finished in memory — the same fix the worker module needed.
 */
export async function listTransportRequests(filters: RequestFilters = {}): Promise<TransportRequest[]> {
  const me = await currentUserId();
  let query = client()
    .from("transport_requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.cargoType && filters.cargoType !== "all") query = query.eq("cargo_type", filters.cargoType);
  if (filters.vehicleType && filters.vehicleType !== "all") {
    query = query.eq("vehicle_type", filters.vehicleType);
  }
  if (filters.pickupDistrict && filters.pickupDistrict !== "all") {
    query = query.eq("pickup_district", filters.pickupDistrict);
  }
  if (filters.dropoffDistrict && filters.dropoffDistrict !== "all") {
    query = query.eq("dropoff_district", filters.dropoffDistrict);
  }
  if (filters.pickupFrom) query = query.gte("pickup_on", filters.pickupFrom);
  if (filters.pickupTo) query = query.lte("pickup_on", filters.pickupTo);
  if (filters.minPrice != null) query = query.gte("offered_price_inr", filters.minPrice);
  if (filters.maxPrice != null) query = query.lte("offered_price_inr", filters.maxPrice);

  const { data, error } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as TransportRequest[]).filter((r) => r.requester_id !== me);

  // Expired requests are not work.
  const today = todayISO();
  rows = rows.filter((r) => !r.expires_on || r.expires_on >= today);

  if (filters.minWeight != null) {
    rows = rows.filter((r) => Number(r.weight_kg ?? r.load_kg ?? 0) >= filters.minWeight!);
  }
  if (filters.maxWeight != null) {
    rows = rows.filter((r) => Number(r.weight_kg ?? r.load_kg ?? 0) <= filters.maxWeight!);
  }
  if (filters.maxDistance != null) {
    rows = rows.filter((r) => r.distance_km != null && Number(r.distance_km) <= filters.maxDistance!);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.title ?? "").toLowerCase().includes(q) ||
        (r.commodity ?? "").toLowerCase().includes(q) ||
        (r.pickup ?? "").toLowerCase().includes(q) ||
        (r.dropoff ?? "").toLowerCase().includes(q) ||
        (r.requester_name ?? "").toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function getTransportRequest(id: string): Promise<TransportRequest | null> {
  const { data, error } = await client()
    .from("transport_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as TransportRequest | null) ?? null;
}

/* ── Offers (quotes) ───────────────────────────────────────────────────── */

export async function listMyOffers(): Promise<TransportOffer[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_offers")
    .select("*, request:transport_requests(*)")
    .eq("transporter_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransportOffer[];
}

/** The request ids this transporter already has a live offer on. */
export async function offeredRequestIds(): Promise<Set<string>> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_offers")
    .select("request_id, status")
    .eq("transporter_id", me)
    .in("status", ["pending", "accepted"]);
  if (error) throw error;
  return new Set((data ?? []).map((row: { request_id: string }) => row.request_id));
}

export type OfferInput = {
  price_inr: number;
  vehicle_id: string | null;
  driver_id: string | null;
  eta_hours: number | null;
  message: string | null;
};

export async function submitOffer(requestId: string, input: OfferInput): Promise<TransportOffer> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_offers")
    .insert({ ...input, request_id: requestId, transporter_id: me, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data as TransportOffer;
}

export async function updateOffer(id: string, input: Partial<OfferInput>): Promise<TransportOffer> {
  const { data, error } = await client()
    .from("transport_offers")
    .update(input)
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();
  if (error) throw error;
  return data as TransportOffer;
}

export async function withdrawOffer(id: string): Promise<void> {
  const { error } = await client()
    .from("transport_offers")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

/* ── Bookings ──────────────────────────────────────────────────────────── */

export async function listBookings(): Promise<TransportBooking[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transporter_booking_view")
    .select("*, request:transport_requests(dropoff_lat, dropoff_lng)")
    .eq("transporter_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(withRequestCoords) as TransportBooking[];
}

export async function getBooking(id: string): Promise<TransportBooking | null> {
  const { data, error } = await client()
    .from("transporter_booking_view")
    .select("*, request:transport_requests(dropoff_lat, dropoff_lng)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? (withRequestCoords(data) as TransportBooking) : null;
}

/**
 * Flatten the joined request coordinates onto the booking.
 *
 * `security_invoker` on the view means the join is still governed by the
 * policy on `transport_requests`; if the requester's row is not readable the
 * join is simply null and the coordinates stay unknown — never zero.
 */
function withRequestCoords(row: Record<string, unknown>): Record<string, unknown> {
  const request = row.request as { dropoff_lat?: number | null; dropoff_lng?: number | null } | null;
  const { request: _request, ...rest } = row;
  return {
    ...rest,
    request_dropoff_lat: request?.dropoff_lat ?? null,
    request_dropoff_lng: request?.dropoff_lng ?? null,
  };
}

/** Move a booking to its next status. The database trigger is the real guard. */
export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  reason?: string | null
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "cancelled" && reason) patch.cancel_reason = reason;
  const { error } = await client().from("transport_bookings").update(patch).eq("id", id);
  if (error) throw error;
}

export async function assignVehicle(bookingId: string, vehicleId: string): Promise<void> {
  const { error } = await client()
    .from("transport_bookings")
    .update({ vehicle_id: vehicleId, status: "vehicle_assigned" })
    .eq("id", bookingId);
  if (error) throw error;
}

export async function assignDriver(bookingId: string, driverId: string): Promise<void> {
  const { error } = await client()
    .from("transport_bookings")
    .update({ driver_id: driverId, status: "driver_assigned" })
    .eq("id", bookingId);
  if (error) throw error;
}

/**
 * Assign a vehicle and/or driver without forcing a particular next status.
 *
 * The status is advanced only as far as the assignment justifies and only when
 * that is the current stage — the database trigger validates the transition, so
 * an illegal jump is rejected rather than silently applied.
 */
export async function updateBookingAssignments(
  bookingId: string,
  patch: { vehicle_id?: string; driver_id?: string }
): Promise<void> {
  const { data: current, error: readError } = await client()
    .from("transport_bookings")
    .select("status")
    .eq("id", bookingId)
    .single();
  if (readError) throw readError;

  const update: Record<string, unknown> = { ...patch };
  const status = (current as { status: BookingStatus }).status;

  if (patch.driver_id) {
    // A driver can only be attached once the vehicle stage (or later) is reached.
    if (status === "accepted" || status === "confirmed") {
      if (patch.vehicle_id) update.status = "driver_assigned";
      else update.status = "vehicle_assigned";
    } else if (status === "vehicle_assigned") {
      update.status = "driver_assigned";
    }
  } else if (patch.vehicle_id) {
    if (status === "accepted" || status === "confirmed") update.status = "vehicle_assigned";
  }

  const { error } = await client()
    .from("transport_bookings")
    .update(update)
    .eq("id", bookingId);
  if (error) throw error;
}

export async function listTripEvents(bookingId: string): Promise<TripEvent[]> {
  const { data, error } = await client()
    .from("trip_events")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TripEvent[];
}

/* ── Manual tracking ───────────────────────────────────────────────────── */

/**
 * The latest reported position for a booking, or null.
 *
 * This reads real rows only. If no device has ever reported, the page shows
 * "not available" rather than a guessed location — the whole point of not
 * adding a map was to avoid pretending we know where the truck is.
 */
export async function latestLocation(bookingId: string): Promise<TripLocation | null> {
  const { data, error } = await client()
    .from("trip_locations")
    .select("*")
    .eq("booking_id", bookingId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as TripLocation | null) ?? null;
}

/** A driver-reported position, written only when the driver opts in. */
export async function reportLocation(bookingId: string, lat: number, lng: number): Promise<void> {
  const me = await currentUserId();
  const { error } = await client()
    .from("trip_locations")
    .insert({ booking_id: bookingId, lat, lng, reported_by: me });
  if (error) throw error;
}

/* ── Proof of delivery ─────────────────────────────────────────────────── */

export async function getProof(bookingId: string): Promise<DeliveryProof | null> {
  const { data, error } = await client()
    .from("delivery_proofs")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw error;
  return (data as DeliveryProof | null) ?? null;
}

export type ProofInput = {
  receiver_name: string;
  receiver_phone: string | null;
  received_qty: string | null;
  damage_notes: string | null;
  notes: string | null;
  photo_url: string | null;
};

export async function recordProof(bookingId: string, input: ProofInput): Promise<void> {
  const me = await currentUserId();
  const { error } = await client()
    .from("delivery_proofs")
    .insert({
      ...input,
      booking_id: bookingId,
      recorded_by: me,
      // The OTP hash is written by the backend when it verifies the receiver's
      // code. The browser never sees or stores the code itself.
    });
  if (error) throw error;
}

/* ── Expenses ──────────────────────────────────────────────────────────── */

export async function listExpenses(): Promise<TripExpense[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("trip_expenses")
    .select("*")
    .eq("transporter_id", me)
    .order("spent_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TripExpense[];
}

export async function addExpense(input: {
  booking_id: string;
  kind: ExpenseKind;
  amount_inr: number;
  estimated: boolean;
  note: string | null;
  spent_on: string;
}): Promise<TripExpense> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("trip_expenses")
    .insert({ ...input, transporter_id: me })
    .select()
    .single();
  if (error) throw error;
  return data as TripExpense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await client().from("trip_expenses").delete().eq("id", id);
  if (error) throw error;
}

/* ── Invoices ──────────────────────────────────────────────────────────── */

export async function listInvoices(): Promise<TransportInvoice[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_invoices")
    .select("*")
    .eq("transporter_id", me)
    .order("issued_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransportInvoice[];
}

export type EarningsTotals = {
  totalRevenue: number;
  thisMonth: number;
  pending: number;
  processing: number;
  paid: number;
  tripsCount: number;
};

/** Only `paid` invoices count as revenue — nothing is estimated as earned. */
export function earningsTotals(invoices: TransportInvoice[]): EarningsTotals {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paid = invoices.filter((i) => i.status === "paid");
  const totalRevenue = paid.reduce((sum, i) => sum + Number(i.amount_inr), 0);
  const thisMonth = paid
    .filter((i) => new Date(i.paid_on ?? i.issued_on) >= monthStart)
    .reduce((sum, i) => sum + Number(i.amount_inr), 0);

  return {
    totalRevenue,
    thisMonth,
    pending: invoices.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i.amount_inr), 0),
    processing: invoices
      .filter((i) => i.status === "processing")
      .reduce((s, i) => s + Number(i.amount_inr), 0),
    paid: totalRevenue,
    tripsCount: paid.length,
  };
}

/** Per-trip profit: agreed price minus recorded expenses. */
export function tripProfit(booking: TransportBooking, expenses: TripExpense[]): number {
  const spent = expenses
    .filter((e) => e.booking_id === booking.id)
    .reduce((sum, e) => sum + Number(e.amount_inr), 0);
  return Number(booking.agreed_price_inr) - spent;
}

/**
 * Trips that were delivered/completed but have no invoice row yet.
 *
 * Invoices are written by the backend on payment, so right after a trip this
 * list is what the transporter is actually owed. It is labelled "agreed", not
 * "earned": nothing is counted as revenue until an invoice says `paid`.
 */
export function uninvoicedBookings(
  bookings: TransportBooking[],
  invoices: TransportInvoice[]
): TransportBooking[] {
  const invoiced = new Set(invoices.map((i) => i.booking_id));
  return bookings.filter(
    (b) =>
      (b.status === "delivered" || b.status === "completed") &&
      !invoiced.has(b.id) &&
      b.invoice_status == null
  );
}

/** Agreed value of trips that are not on any invoice yet. */
export function awaitingInvoiceTotals(
  bookings: TransportBooking[],
  invoices: TransportInvoice[]
): { count: number; amount: number } {
  const rows = uninvoicedBookings(bookings, invoices);
  return {
    count: rows.length,
    amount: rows.reduce((sum, b) => sum + Number(b.agreed_price_inr), 0),
  };
}

/* ── Reviews ───────────────────────────────────────────────────────────── */

export async function listReviews(): Promise<TransportReview[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_reviews")
    .select("*")
    .eq("transporter_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransportReview[];
}

export async function reportReview(id: string, reason: string): Promise<void> {
  const { error } = await client()
    .from("transport_reviews")
    .update({ is_reported: true, report_reason: reason })
    .eq("id", id);
  if (error) throw error;
}

/* ── Reports ───────────────────────────────────────────────────────────── */

export type TransportReport = {
  id: string;
  booking_id: string | null;
  reporter_id: string;
  reason: ReportReason;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
};

/**
 * File a report about a request, a booking or a person.
 *
 * The reporter is taken from the session, never from the form — the RLS policy
 * on `transport_reports` only accepts a row whose `reporter_id` is you.
 */
export async function fileReport(input: {
  reason: ReportReason;
  details: string | null;
  booking_id?: string | null;
}): Promise<TransportReport> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_reports")
    .insert({
      reporter_id: me,
      reason: input.reason,
      details: input.details,
      booking_id: input.booking_id ?? null,
      status: "open",
    })
    .select()
    .single();
  if (error) throw error;
  return data as TransportReport;
}

/** Reports this account has filed, newest first. */
export async function listMyReports(): Promise<TransportReport[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transport_reports")
    .select("*")
    .eq("reporter_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransportReport[];
}

/* ── Notifications & messages ──────────────────────────────────────────── */

export async function listNotifications(): Promise<TransporterNotification[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transporter_notifications")
    .select("*")
    .eq("transporter_id", me)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as TransporterNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client()
    .from("transporter_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const me = await currentUserId();
  const { error } = await client()
    .from("transporter_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("transporter_id", me)
    .is("read_at", null);
  if (error) throw error;
}

export async function listMessages(): Promise<TransporterMessage[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transporter_messages")
    .select("*")
    .eq("transporter_id", me)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TransporterMessage[];
}

export async function sendMessage(params: {
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  booking_id: string | null;
  body: string;
}): Promise<TransporterMessage> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transporter_messages")
    .insert({ ...params, transporter_id: me, direction: "out" })
    .select()
    .single();
  if (error) throw error;
  return data as TransporterMessage;
}

/* ── Documents ─────────────────────────────────────────────────────────── */

/** Private buckets created by transporter.sql section 15. */
export const DOCUMENT_BUCKET = "transporter-documents";
export const VEHICLE_BUCKET = "transporter-vehicles";
export const PROOF_BUCKET = "transport-delivery-proofs";

/** 10 MB — RC scans and permit PDFs are bigger than a product photo. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const ACCEPTED_DOCUMENT_TYPES = DOCUMENT_TYPES.join(",");

/** Clear message before the upload is attempted. Returns null when fine. */
export function validateDocument(file: File): string | null {
  if (!DOCUMENT_TYPES.includes(file.type)) {
    return "Use a JPG, PNG, WebP or PDF file.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `File is ${mb} MB — the limit is 10 MB.`;
  }
  return null;
}

/**
 * Upload a file into a PRIVATE bucket and return the object path.
 *
 * The path is always `<user-id>/<name>`, which is exactly what the storage
 * policies in section 15 check. The public URL helper is deliberately not used:
 * these buckets are not public, so only a short-lived signed URL can open them.
 */
export async function uploadPrivateFile(
  file: File,
  bucket: string,
  prefix?: string
): Promise<string> {
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
  const name = `${prefix ? `${prefix}-` : ""}${unique}.${ext || "bin"}`;
  const path = `${user.id}/${name}`;

  const { error } = await sb.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        "Private storage is not set up yet. Run database/supabase/transporter.sql in Supabase."
      );
    }
    if (/row-level security|policy|not allowed/i.test(error.message)) {
      throw new Error("You do not have permission to upload to this bucket.");
    }
    if (/already exists/i.test(error.message)) {
      throw new Error("That file was already uploaded — try again.");
    }
    throw error;
  }
  return path;
}

/**
 * A temporary link to a private file, for the owner only.
 *
 * Sixty seconds is enough to open the document in a new tab and long enough
 * that nothing needs caching. A failure returns null; the UI then says the file
 * could not be opened rather than showing a broken link.
 */
export async function signedFileUrl(path: string, bucket: string): Promise<string | null> {
  const { data, error } = await client().storage.from(bucket).createSignedUrl(path, 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Bucket a document kind belongs in. */
export function bucketForKind(kind: DocumentKind): string {
  return kind === "vehicle_rc" || kind === "insurance" || kind === "fitness"
    ? VEHICLE_BUCKET
    : DOCUMENT_BUCKET;
}

export async function listDocuments(): Promise<TransporterDocument[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transporter_documents")
    .select("*")
    .eq("transporter_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransporterDocument[];
}

/**
 * Upload one document and register it for review.
 *
 * The row is created with `status = 'pending'`; only a reviewer may change it,
 * so nothing here can mark its own paperwork approved.
 */
export async function uploadDocument(input: {
  file: File;
  kind: DocumentKind;
  vehicle_id?: string | null;
}): Promise<TransporterDocument> {
  const me = await currentUserId();
  const bucket = bucketForKind(input.kind);
  const path = await uploadPrivateFile(input.file, bucket, input.kind);

  const { data, error } = await client()
    .from("transporter_documents")
    .insert({
      transporter_id: me,
      kind: input.kind,
      document_url: path,
      vehicle_id: input.vehicle_id ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    // The file is already in storage; drop it so a failed row leaves no orphan.
    await client().storage.from(bucket).remove([path]);
    throw error;
  }
  return data as TransporterDocument;
}

/** Withdraw a document that has not been reviewed yet. */
export async function deleteDocument(doc: TransporterDocument): Promise<void> {
  if (doc.status !== "pending") {
    throw new Error("A reviewed document cannot be removed. Contact support to replace it.");
  }
  const { error } = await client().from("transporter_documents").delete().eq("id", doc.id);
  if (error) throw error;
  await deletePrivateFile(doc.document_url, bucketForKind(doc.kind));
}

/** Best-effort Object delete — a storage miss must not block the row change. */
async function deletePrivateFile(path: string, bucket: string): Promise<void> {
  try {
    await client().storage.from(bucket).remove([path]);
  } catch {
    /* the row is gone; an orphaned object is harmless */
  }
}

/**
 * A vehicle photo is public-facing inside the app, so it goes in the private
 * vehicles bucket and is signed on read like every other fleet file.
 */
export async function uploadVehiclePhoto(file: File): Promise<string> {
  return uploadPrivateFile(file, VEHICLE_BUCKET, "photo");
}

/* ── Availability ──────────────────────────────────────────────────────── */

export type AvailabilityRow = {
  id: string;
  transporter_id: string;
  day: string;
  available: boolean;
  note: string | null;
};

export async function listAvailability(fromISO?: string): Promise<AvailabilityRow[]> {
  const me = await currentUserId();
  const { data, error } = await client()
    .from("transporter_availability")
    .select("*")
    .eq("transporter_id", me)
    .gte("day", fromISO ?? todayISO())
    .order("day", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AvailabilityRow[];
}

export async function setDayAvailability(day: string, available: boolean): Promise<void> {
  const me = await currentUserId();
  const { error } = await client()
    .from("transporter_availability")
    .upsert({ transporter_id: me, day, available }, { onConflict: "transporter_id,day" });
  if (error) throw error;
}

/** Bookings whose dates include `day` — used for conflict warnings. */
export function bookingsOn(bookings: TransportBooking[], day: string): TransportBooking[] {
  return bookings.filter((b) => {
    if (["completed", "cancelled"].includes(b.status)) return false;
    return b.pickup_on === day;
  });
}

/**
 * Can this vehicle take this trip? Capacity must cover the load, and the
 * vehicle must not already be on another active trip.
 */
export function vehicleEligible(
  vehicle: FleetVehicle,
  booking: TransportBooking,
  allBookings: TransportBooking[]
): { ok: boolean; reason: string | null } {
  if (vehicle.is_archived) return { ok: false, reason: "This vehicle is archived." };
  const load = Number(booking.weight_kg ?? 0);
  if (load > 0 && Number(vehicle.capacity_kg) < load) {
    return {
      ok: false,
      reason: `Capacity ${formatWeight(Number(vehicle.capacity_kg))} is less than the load ${formatWeight(load)}.`,
    };
  }
  const busy = allBookings.some(
    (b) => b.id !== booking.id && b.vehicle_id === vehicle.id && ACTIVE_BOOKING_STATUSES.includes(b.status)
  );
  if (busy) return { ok: false, reason: "This vehicle is already on an active trip." };
  return { ok: true, reason: null };
}

/** Same idea for drivers: available and not already on an active trip. */
export function driverEligible(
  driver: Driver,
  booking: TransportBooking,
  allBookings: TransportBooking[]
): { ok: boolean; reason: string | null } {
  if (driver.status === "inactive") return { ok: false, reason: "This driver is inactive." };
  if (driver.status === "leave") return { ok: false, reason: "This driver is on leave." };
  const lic = licenceState(driver);
  if (lic.expired) return { ok: false, reason: "This driver's licence has expired." };
  const busy = allBookings.some(
    (b) => b.id !== booking.id && b.driver_id === driver.id && ACTIVE_BOOKING_STATUSES.includes(b.status)
  );
  if (busy) return { ok: false, reason: "This driver is already on an active trip." };
  return { ok: true, reason: null };
}

/* ── Dashboard roll-up ─────────────────────────────────────────────────── */

export type TransporterDashboardTotals = {
  newRequests: number;
  pendingBookings: number;
  activeTrips: number;
  completedTrips: number;
  availableVehicles: number;
  totalEarnings: number;
  pendingPayments: number;
};

export function dashboardTotals(params: {
  requests: TransportRequest[];
  bookings: TransportBooking[];
  fleet: FleetVehicle[];
  invoices: TransportInvoice[];
}): TransporterDashboardTotals {
  const totals = earningsTotals(params.invoices);
  return {
    newRequests: params.requests.length,
    pendingBookings: params.bookings.filter((b) =>
      ["accepted", "confirmed", "vehicle_assigned", "driver_assigned"].includes(b.status)
    ).length,
    activeTrips: params.bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)).length,
    completedTrips: params.bookings.filter((b) => b.status === "completed").length,
    availableVehicles: params.fleet.filter((v) => v.available && !v.is_archived).length,
    totalEarnings: totals.totalRevenue,
    pendingPayments: totals.pending + totals.processing,
  };
}
