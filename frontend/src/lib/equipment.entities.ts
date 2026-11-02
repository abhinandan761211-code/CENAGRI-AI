/**
 * Equipment module — row shapes mirroring `database/supabase/equipment.sql`.
 *
 * Shapes only. Access is decided by RLS scoped to `auth.uid()`.
 */
import type {
  BookingStatus,
  DocumentKind,
  EquipmentStatus,
  ExpenseKind,
  MaintenanceKind,
  OperatorStatus,
  PaymentStatus,
  RateUnit,
  VerificationState,
} from "@/lib/equipment.types";

/* ── Equipment ─────────────────────────────────────────────────────────── */

export type Equipment = {
  id: string;
  owner_id: string;
  title: string;
  /** Legacy narrow column from features.sql. */
  kind: string;
  category: string | null;
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
  status: EquipmentStatus;
  fuel_type: string | null;
  fuel_included: boolean;
  operator_available: boolean;
  operator_included: boolean;
  description: string | null;
  is_listed: boolean;
  is_archived: boolean;
  last_service_on: string | null;
  next_service_on: string | null;
  rate_inr: number;
  rate_unit: RateUnit;
  available: boolean;
  created_at: string;
  updated_at: string;
};

export type EquipmentStats = {
  id: string;
  owner_id: string;
  title: string;
  category: string | null;
  district: string | null;
  status: EquipmentStatus;
  is_listed: boolean;
  is_archived: boolean;
  condition_score: number;
  next_service_on: string | null;
  active_bookings: number;
  revenue_inr: number;
};

export type EquipmentPricing = {
  id: string;
  equipment_id: string;
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
  updated_at: string;
};

export type EquipmentBlock = {
  id: string;
  equipment_id: string;
  kind: "maintenance" | "unavailable" | "weather" | "other";
  starts_on: string;
  ends_on: string;
  reason: string | null;
  created_at: string;
};

/* ── Operators ─────────────────────────────────────────────────────────── */

export type EquipmentOperator = {
  id: string;
  owner_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  phone_verified: boolean;
  experience_years: number;
  skills: string[];
  licence_no: string | null;
  licence_expiry: string | null;
  /** Private object path — never rendered as a URL. */
  licence_document_url: string | null;
  status: OperatorStatus;
  notes: string | null;
  created_at: string;
};

/* ── Requests & quotations ─────────────────────────────────────────────── */

export type RentalRequestStatus = "open" | "quoted" | "accepted" | "closed" | "expired" | "cancelled";

export type RentalRequest = {
  id: string;
  requester_id: string;
  equipment_id: string | null;
  owner_id: string | null;
  category: string | null;
  requester_name: string | null;
  requester_role: string | null;
  farm_location: string | null;
  district: string | null;
  required_from: string;
  duration_days: number;
  land_area_acres: number | null;
  work_type: string | null;
  needs_operator: boolean;
  needs_fuel: boolean;
  expected_budget_inr: number | null;
  description: string | null;
  status: RentalRequestStatus;
  expires_on: string | null;
  created_at: string;
};

export type EquipmentQuotation = {
  id: string;
  request_id: string;
  equipment_id: string;
  owner_id: string;
  rental_inr: number;
  operator_inr: number;
  fuel_inr: number;
  transport_inr: number;
  other_inr: number;
  other_note: string | null;
  total_inr: number;
  operator_included: boolean;
  fuel_included: boolean;
  transport_included: boolean;
  valid_until: string | null;
  message: string | null;
  status: "sent" | "accepted" | "rejected" | "withdrawn" | "expired";
  created_at: string;
  request?: RentalRequest | null;
};

/* ── Bookings ──────────────────────────────────────────────────────────── */

export type EquipmentBooking = {
  id: string;
  equipment_id: string;
  renter_id: string;
  request_id: string | null;
  quotation_id: string | null;
  owner_id: string | null;
  operator_id: string | null;
  renter_name: string | null;
  renter_role: string | null;
  farm_location: string | null;
  work_type: string | null;
  land_area_acres: number | null;
  starts_on: string;
  ends_on: string;
  start_time: string | null;
  end_time: string | null;
  agreed_price_inr: number;
  payment_status: PaymentStatus;
  operator_included: boolean;
  fuel_included: boolean;
  transport_included: boolean;
  work_hours: number | null;
  completed_acres: number | null;
  completion_notes: string | null;
  completion_photos: string[];
  customer_acknowledged_at: string | null;
  cancel_reason: string | null;
  status: BookingStatus;
  created_at: string;
  /** From `equipment_booking_view`. */
  equipment_title?: string | null;
  equipment_category?: string | null;
  equipment_district?: string | null;
  equipment_images?: string[] | null;
  operator_name?: string | null;
  operator_phone?: string | null;
  invoice_status?: string | null;
  invoice_no?: string | null;
  invoice_total?: number | null;
};

/* ── Maintenance, money, documents ─────────────────────────────────────── */

export type MaintenanceRecord = {
  id: string;
  equipment_id: string;
  owner_id: string;
  kind: MaintenanceKind;
  description: string;
  cost_inr: number;
  parts: string | null;
  workshop: string | null;
  odometer_hours: number | null;
  service_on: string;
  next_due_on: string | null;
  photos: string[];
  downtime_days: number | null;
  created_at: string;
};

export type EquipmentExpense = {
  id: string;
  owner_id: string;
  equipment_id: string | null;
  booking_id: string | null;
  kind: ExpenseKind;
  amount_inr: number;
  estimated: boolean;
  note: string | null;
  spent_on: string;
  created_at: string;
};

export type EquipmentInvoice = {
  id: string;
  invoice_no: string;
  booking_id: string;
  owner_id: string;
  renter_id: string | null;
  amount_inr: number;
  tax_inr: number;
  total_inr: number;
  status: "pending" | "processing" | "paid" | "failed" | "refunded";
  issued_on: string;
  due_on: string | null;
  paid_on: string | null;
  reference: string | null;
  breakdown: Record<string, number | string>;
  created_at: string;
};

export type EquipmentDocument = {
  id: string;
  owner_id: string;
  equipment_id: string | null;
  operator_id: string | null;
  kind: DocumentKind;
  /** Private object path. */
  document_url: string;
  status: "pending" | "verified" | "rejected" | "expired";
  reviewed_at: string | null;
  expires_on: string | null;
  note: string | null;
  created_at: string;
};

export type EquipmentAgreement = {
  id: string;
  booking_id: string;
  owner_id: string;
  renter_id: string;
  terms: string;
  fuel_policy: string | null;
  operator_policy: string | null;
  transport_policy: string | null;
  damage_terms: string | null;
  cancellation_terms: string | null;
  owner_confirmed_at: string | null;
  renter_confirmed_at: string | null;
  created_at: string;
};

export type EquipmentReview = {
  id: string;
  booking_id: string;
  equipment_id: string;
  owner_id: string;
  reviewer_id: string;
  equipment_rating: number;
  operator_rating: number | null;
  condition_notes: string | null;
  comment: string | null;
  is_reported: boolean;
  report_reason: string | null;
  created_at: string;
};

/* ── Communication ─────────────────────────────────────────────────────── */

export type EquipmentNotificationKind =
  | "request"
  | "quotation"
  | "booking"
  | "operator"
  | "reminder"
  | "maintenance"
  | "payment"
  | "review"
  | "system";

export type EquipmentNotification = {
  id: string;
  owner_id: string;
  kind: EquipmentNotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type EquipmentMessage = {
  id: string;
  owner_id: string;
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  booking_id: string | null;
  direction: "in" | "out";
  body: string;
  read_at: string | null;
  created_at: string;
};

/* ── Derived ───────────────────────────────────────────────────────────── */

export type CostBreakdown = {
  rental: number;
  operator: number;
  fuel: number;
  transport: number;
  other: number;
  otherLabel: string | null;
  advance: number;
  total: number;
  days: number;
};

export type DashboardTotals = {
  total: number;
  available: number;
  booked: number;
  maintenance: number;
  newRequests: number;
  activeBookings: number;
  completed: number;
  earnings: number;
  pending: number;
};

export type VerificationSummary = VerificationState;
