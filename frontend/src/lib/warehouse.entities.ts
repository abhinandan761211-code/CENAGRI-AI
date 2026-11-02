/**
 * Warehouse module — row shapes that mirror `database/supabase/warehouse.sql`.
 *
 * These describe what the database returns; they never grant access. Every
 * read and write is scoped by RLS to `auth.uid()`.
 */
import type {
  BillingUnit,
  CommodityCategory,
  InvoiceStatus,
  PaymentStatus,
  QuantityUnit,
  StaffRole,
  StorageBookingStatus,
  VerificationState,
  WarehouseDocumentKind,
  WarehouseType,
} from "@/lib/warehouse.types";

/* ── Warehouse ─────────────────────────────────────────────────────────── */

export type Warehouse = {
  id: string;
  owner_id: string;
  name: string;
  /** Legacy column from features.sql — 'Dry' | 'Cold'. */
  kind: "Dry" | "Cold";
  warehouse_type: WarehouseType | null;
  address_line: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  /** Legacy mirror of `total_capacity_kg`. */
  capacity_kg: number;
  total_capacity_kg: number;
  /** Legacy mirror; the live free figure comes from `warehouse_capacity_view`. */
  available_kg: number;
  reserved_kg: number;
  occupied_kg: number;
  rate_inr: number | null;
  rate_unit: "quintal_month" | "kg_month";
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  opens_at: string;
  closes_at: string;
  facilities: string[];
  loading_facilities: string[];
  security_facilities: string[];
  photos: string[];
  accepted_commodities: string[];
  is_listed: boolean;
  is_archived: boolean;
  verification: VerificationState;
  verified_at: string | null;
  about: string | null;
  created_at: string;
  updated_at: string;
};

/** A warehouse plus the capacity figures computed by the database view. */
export type WarehouseCapacity = {
  id: string;
  owner_id: string;
  name: string;
  warehouse_type: WarehouseType | null;
  district: string | null;
  state: string | null;
  capacity_kg: number;
  reserved_kg: number;
  occupied_kg: number;
  available_kg: number;
  utilisation_pct: number;
  is_listed: boolean;
  is_archived: boolean;
  verification: VerificationState;
};

export type WarehouseSection = {
  id: string;
  warehouse_id: string;
  name: string;
  commodity_category: CommodityCategory;
  capacity_kg: number;
  reserved_kg: number;
  occupied_kg: number;
  temp_min_c: number | null;
  temp_max_c: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

/* ── Requests & quotations ─────────────────────────────────────────────── */

export const STORAGE_REQUEST_STATUSES = ["open", "quoted", "accepted", "closed", "expired", "cancelled"] as const;
export type StorageRequestStatus = (typeof STORAGE_REQUEST_STATUSES)[number];

export type StorageRequest = {
  id: string;
  requester_id: string;
  warehouse_id: string | null;
  requester_name: string | null;
  requester_role: string | null;
  crop_name: string;
  variety: string | null;
  quantity_kg: number;
  quantity_unit: QuantityUnit;
  storage_type: WarehouseType;
  starts_on: string;
  duration_days: number;
  expected_release: string | null;
  temp_required_c: number | null;
  humidity_required: number | null;
  pickup_location: string | null;
  preferred_district: string | null;
  notes: string | null;
  status: StorageRequestStatus;
  expires_on: string | null;
  created_at: string;
};

export type StorageQuotation = {
  id: string;
  request_id: string;
  warehouse_id: string;
  owner_id: string;
  section_id: string | null;
  storage_price_inr: number;
  loading_price_inr: number;
  unloading_price_inr: number;
  handling_price_inr: number;
  other_price_inr: number;
  other_price_note: string | null;
  total_inr: number;
  valid_until: string | null;
  message: string | null;
  status: "sent" | "accepted" | "rejected" | "withdrawn" | "expired";
  created_at: string;
  /** Joined when listing quotations for the owner's requests. */
  request?: StorageRequest | null;
};

/* ── Bookings ──────────────────────────────────────────────────────────── */

export type StorageBooking = {
  id: string;
  warehouse_id: string;
  farmer_id: string;
  request_id: string | null;
  quotation_id: string | null;
  section_id: string | null;
  owner_id: string | null;
  depositor_name: string | null;
  depositor_role: string | null;
  crop_name: string | null;
  variety: string | null;
  quantity_kg: number;
  received_kg: number;
  released_kg: number;
  starts_on: string;
  ends_on: string;
  expected_inward_on: string | null;
  agreed_price_inr: number;
  payment_status: PaymentStatus;
  status: StorageBookingStatus;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** From `warehouse_booking_view`. */
  warehouse_name?: string | null;
  warehouse_district?: string | null;
  section_name?: string | null;
  lots_count?: number;
  stored_kg?: number;
};

/* ── Inventory ─────────────────────────────────────────────────────────── */

export type InventoryLotStatus = "in_storage" | "partially_released" | "released" | "on_hold" | "disposed";
export type QualityStatus = "pending" | "passed" | "conditional" | "rejected";

export type InventoryLot = {
  id: string;
  lot_no: string;
  booking_id: string;
  warehouse_id: string;
  section_id: string | null;
  /** The depositor owns the goods; the warehouse only holds them. */
  depositor_id: string;
  crop_name: string;
  variety: string | null;
  grade: string | null;
  received_kg: number;
  current_kg: number;
  moisture_pct: number | null;
  received_on: string;
  batch_no: string | null;
  bags_count: number | null;
  storage_location: string | null;
  quality_status: QualityStatus;
  status: InventoryLotStatus;
  notes: string | null;
  created_at: string;
};

export const INVENTORY_TX_KINDS = ["inward", "release", "adjustment", "damage", "disposal", "transfer"] as const;
export type InventoryTxKind = (typeof INVENTORY_TX_KINDS)[number];

export const INVENTORY_TX_LABEL: Record<InventoryTxKind, string> = {
  inward: "Goods inward",
  release: "Release",
  adjustment: "Adjustment",
  damage: "Damage",
  disposal: "Disposal",
  transfer: "Transfer",
};

export type InventoryTransaction = {
  id: string;
  lot_id: string;
  kind: InventoryTxKind;
  quantity_kg: number;
  balance_after_kg: number;
  reason: string;
  inspection_id: string | null;
  actor_id: string | null;
  created_at: string;
};

/* ── Goods movement ────────────────────────────────────────────────────── */

export type GoodsReceipt = {
  id: string;
  grn_no: string;
  booking_id: string;
  warehouse_id: string;
  lot_id: string | null;
  expected_kg: number | null;
  received_kg: number;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  weight_slip_no: string | null;
  bags_count: number | null;
  photos: string[];
  inspection_id: string | null;
  discrepancy: boolean;
  discrepancy_note: string | null;
  section_id: string | null;
  storage_location: string | null;
  received_by: string | null;
  received_at: string;
};

export type GoodsDispatch = {
  id: string;
  dispatch_no: string;
  booking_id: string;
  lot_id: string;
  warehouse_id: string;
  requested_kg: number;
  dispatched_kg: number;
  partial: boolean;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  transporter_booking_id: string | null;
  dispatch_weight_slip: string | null;
  gate_pass_no: string | null;
  photos: string[];
  notes: string | null;
  dispatched_by: string | null;
  dispatched_at: string;
};

/* ── Inspections & readings ────────────────────────────────────────────── */

export const INSPECTION_KINDS = ["inward", "periodic", "pre_dispatch", "complaint"] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

export type StorageInspection = {
  id: string;
  warehouse_id: string;
  booking_id: string | null;
  lot_id: string | null;
  kind: InspectionKind;
  inspector_id: string | null;
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
  quantity_after_kg: number | null;
  adjustment_applied: boolean;
  notes: string | null;
  inspected_at: string;
};

export type StorageReading = {
  id: string;
  warehouse_id: string;
  section_id: string | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  moisture_pct: number | null;
  ventilation: "good" | "fair" | "poor" | null;
  pest_seen: boolean | null;
  fumigated_on: string | null;
  /** 'manual' until a device actually reports. The UI must say which. */
  source: "manual" | "sensor";
  device_id: string | null;
  recorded_by: string | null;
  recorded_at: string;
  notes: string | null;
};

export type ReadingLevel = "ok" | "warning" | "critical";

/* ── Pricing ───────────────────────────────────────────────────────────── */

export type StoragePricingPlan = {
  id: string;
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
  is_active: boolean;
  created_at: string;
};

/* ── Staff & documents ─────────────────────────────────────────────────── */

export type WarehouseStaff = {
  id: string;
  owner_id: string;
  warehouse_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  role: StaffRole;
  can_inward: boolean;
  can_outward: boolean;
  can_inspect: boolean;
  can_manage_pricing: boolean;
  status: "active" | "suspended" | "removed";
  notes: string | null;
  created_at: string;
};

export type WarehouseDocument = {
  id: string;
  owner_id: string;
  warehouse_id: string | null;
  kind: WarehouseDocumentKind;
  /** Object path inside the private bucket — never a public URL. */
  document_url: string;
  status: "pending" | "verified" | "rejected" | "expired";
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_on: string | null;
  note: string | null;
  created_at: string;
};

/* ── Money ─────────────────────────────────────────────────────────────── */

export type StorageInvoice = {
  id: string;
  invoice_no: string;
  booking_id: string;
  owner_id: string;
  depositor_id: string | null;
  amount_inr: number;
  tax_inr: number;
  total_inr: number;
  status: InvoiceStatus;
  issued_on: string;
  due_on: string | null;
  paid_on: string | null;
  reference: string | null;
  breakdown: Record<string, number | string>;
  notes: string | null;
  created_at: string;
};

/* ── Communication ─────────────────────────────────────────────────────── */

export type WarehouseNotificationKind =
  | "request"
  | "quotation"
  | "booking"
  | "inward"
  | "outward"
  | "payment"
  | "inspection"
  | "environment"
  | "dispute"
  | "system";

export type WarehouseNotification = {
  id: string;
  owner_id: string;
  kind: WarehouseNotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type WarehouseMessage = {
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

/* ── Derived (never stored) ────────────────────────────────────────────── */

export type CapacityBreakdown = {
  capacity_kg: number;
  reserved_kg: number;
  occupied_kg: number;
  available_kg: number;
  utilisation_pct: number;
};

export type WarehouseTotals = {
  warehouses: number;
  capacity_kg: number;
  reserved_kg: number;
  occupied_kg: number;
  available_kg: number;
  utilisation_pct: number;
};
