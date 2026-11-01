/**
 * Retailer data layer.
 *
 * A retailer sells agricultural INPUTS (seeds, fertilisers, pesticides, tools,
 * irrigation) and manages stock; a buyer sources PRODUCE from farmers. Both
 * share `profiles` and the marketplace, but every table below is retailer-only
 * and is never written by a buyer account.
 *
 * All Supabase access for the retailer module lives in this file so screens
 * stay presentational. Nothing here is mocked: missing tables raise a real
 * error and empty tables render an empty state.
 */
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** Friendly message for the one setup error a fresh deploy can hit. */
export function describeRetailerError(err: unknown): string {
  if (err instanceof Error && /relation|does not exist|schema cache/i.test(err.message)) {
    return "The retailer tables are not set up yet. Run database/supabase/retailer.sql in Supabase.";
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

/* ── Domain constants ──────────────────────────────────────────────────── */

/** The five input categories the shop sells. */
export const PRODUCT_CATEGORIES = [
  "Seeds",
  "Fertilizers",
  "Pesticides",
  "Tools",
  "Irrigation",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_UNITS = ["kg", "g", "litre", "ml", "piece", "bag", "packet"] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/**
 * Expiry is a regulatory requirement for fertilisers and pesticides, so those
 * categories cannot be saved without an expiry date — enforced in the form and
 * by a DB check constraint of the same name.
 */
export const EXPIRY_REQUIRED_CATEGORIES: readonly ProductCategory[] = ["Fertilizers", "Pesticides"];

export const ORDER_STATUSES = ["processing", "shipped", "delivered", "cancelled"] as const;

export type RetailerOrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_STYLE: Record<RetailerOrderStatus, { dot: string; badge: string }> = {
  processing: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  shipped: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  delivered: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  cancelled: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
};

export const OFFER_KINDS = ["discount", "coupon", "festival", "seasonal", "combo"] as const;

export type OfferKind = (typeof OFFER_KINDS)[number];

export const VERIFICATION_LABEL: Record<ShopVerification, string> = {
  pending: "Not submitted",
  submitted: "Under review",
  verified: "Verified",
  rejected: "Rejected",
};

/* ── Types ─────────────────────────────────────────────────────────────── */

export type ShopVerification = "pending" | "submitted" | "verified" | "rejected";

export type RetailerShop = {
  id: string;
  owner_id: string;
  shop_name: string;
  shop_type: string | null;
  address_line: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  gstin: string | null;
  license_no: string | null;
  opening_time: string | null;
  closing_time: string | null;
  weekly_off: string | null;
  verification: ShopVerification;
  verified_at: string | null;
};

export type RetailerProduct = {
  id: string;
  retailer_id: string;
  name: string;
  brand: string | null;
  category: ProductCategory;
  description: string | null;
  unit: ProductUnit;
  price_inr: number;
  mrp_inr: number | null;
  stock_qty: number;
  low_stock_at: number;
  expiry_date: string | null;
  batch_no: string | null;
  image_url: string | null;
  status: "active" | "paused" | "archived";
  created_at: string;
};

export type RetailerOrder = {
  id: string;
  retailer_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  amount_inr: number;
  cost_inr: number;
  payment_mode: "cash" | "upi" | "card" | "credit";
  status: RetailerOrderStatus;
  placed_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
};

/** Profit on a single line — what the sales analytics screen sums. */
export function orderProfit(order: RetailerOrder): number {
  if (order.status === "cancelled") return 0;
  return Number(order.amount_inr) - Number(order.cost_inr);
}

export type RetailerOffer = {
  id: string;
  retailer_id: string;
  title: string;
  kind: OfferKind;
  code: string | null;
  discount_pct: number | null;
  flat_off_inr: number | null;
  min_order_inr: number | null;
  category: string | null;
  starts_on: string;
  ends_on: string;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
};

export type ProcurementStatus =
  | "requested"
  | "accepted"
  | "pickup_scheduled"
  | "received"
  | "cancelled";

export type ProcurementRequest = {
  id: string;
  retailer_id: string;
  listing_id: string | null;
  farmer_id: string | null;
  farmer_name: string | null;
  farmer_phone: string | null;
  product_name: string;
  quantity_kg: number;
  rate_inr: number;
  farmer_district: string | null;
  status: ProcurementStatus;
  notes: string | null;
  requested_at: string;
  received_at: string | null;
};

export const PROCUREMENT_STATUS_STYLE: Record<ProcurementStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  pickup_scheduled: "bg-violet-100 text-violet-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
};

export type RetailerMessage = {
  id: string;
  retailer_id: string;
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  direction: "in" | "out";
  body: string;
  read_at: string | null;
  created_at: string;
};

export type NotificationKind =
  | "order"
  | "payment"
  | "low_stock"
  | "expiry"
  | "procurement"
  | "system";

export type RetailerNotification = {
  id: string;
  retailer_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/* ── Formatting helpers ────────────────────────────────────────────────── */

/** ₹1,43,614 — Indian grouping, no paise unless there are some. */
export function formatINR(value: number, decimals = 0): string {
  return Number(value).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatQty(value: number, unit: string): string {
  const n = Number(value);
  return `${Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toFixed(2)} ${unit}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "09:00:00" → "9:00 AM". */
export function formatTime(time: string | null): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

/** Whole days from today until `date`. Negative when already expired. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/* ── Stock & expiry derivations ────────────────────────────────────────── */

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(product: RetailerProduct): StockLevel {
  if (Number(product.stock_qty) <= 0) return "out";
  if (Number(product.stock_qty) <= Number(product.low_stock_at)) return "low";
  return "ok";
}

export const STOCK_STYLE: Record<StockLevel, string> = {
  out: "bg-rose-100 text-rose-800",
  low: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
};

export type ExpiryState = "expired" | "critical" | "soon" | "ok" | "none";

/** Expired, within 30 days (critical), within 90 days (soon), or fine. */
export function expiryState(product: RetailerProduct): ExpiryState {
  const days = daysUntil(product.expiry_date);
  if (days == null) return "none";
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "soon";
  return "ok";
}

export const EXPIRY_STYLE: Record<ExpiryState, string> = {
  expired: "bg-rose-100 text-rose-800",
  critical: "bg-orange-100 text-orange-800",
  soon: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
  none: "bg-slate-100 text-slate-600",
};

export const EXPIRY_LABEL: Record<ExpiryState, string> = {
  expired: "Expired",
  critical: "Expires ≤ 30 days",
  soon: "Expires ≤ 90 days",
  ok: "In date",
  none: "No expiry",
};

export function needsExpiry(category: ProductCategory): boolean {
  return EXPIRY_REQUIRED_CATEGORIES.includes(category);
}

/* ── Queries ───────────────────────────────────────────────────────────── */

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  return user.id;
}

/** The signed-in retailer's shop row, or null before it is created. */
export async function getShop(): Promise<RetailerShop | null> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_shops")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as RetailerShop | null) ?? null;
}

export type ShopInput = Omit<RetailerShop, "id" | "owner_id" | "verification" | "verified_at">;

/** Create or update the shop profile. Keeps any existing verification state. */
export async function saveShop(input: ShopInput): Promise<RetailerShop> {
  const ownerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_shops")
    .upsert({ ...input, owner_id: ownerId }, { onConflict: "owner_id" })
    .select()
    .single();
  if (error) throw error;
  return data as RetailerShop;
}

/** Mark the shop as submitted for verification. */
export async function submitForVerification(): Promise<void> {
  const ownerId = await currentUserId();
  const { error } = await client()
    .from("retailer_shops")
    .update({ verification: "submitted" })
    .eq("owner_id", ownerId)
    .in("verification", ["pending", "rejected"]);
  if (error) throw error;
}

export async function listProducts(): Promise<RetailerProduct[]> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_products")
    .select("*")
    .eq("retailer_id", retailerId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RetailerProduct[];
}

export type ProductInput = {
  name: string;
  brand: string | null;
  category: ProductCategory;
  description: string | null;
  unit: ProductUnit;
  price_inr: number;
  mrp_inr: number | null;
  stock_qty: number;
  low_stock_at: number;
  expiry_date: string | null;
  batch_no: string | null;
  /** Public URL from Supabase Storage (see lib/storage.ts). */
  image_url: string | null;
};

export async function createProduct(input: ProductInput): Promise<RetailerProduct> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_products")
    .insert({ ...input, retailer_id: retailerId })
    .select()
    .single();
  if (error) throw error;
  return data as RetailerProduct;
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductInput> & { status?: RetailerProduct["status"] }
): Promise<RetailerProduct> {
  const { data, error } = await client()
    .from("retailer_products")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as RetailerProduct;
}

/** Restock: adds `delta` to stock and returns the refreshed row. */
export async function adjustStock(product: RetailerProduct, delta: number): Promise<RetailerProduct> {
  const next = Math.max(0, Number(product.stock_qty) + delta);
  return updateProduct(product.id, { stock_qty: next });
}

export async function listOrders(sinceDays = 365): Promise<RetailerOrder[]> {
  const retailerId = await currentUserId();
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await client()
    .from("retailer_orders")
    .select("*")
    .eq("retailer_id", retailerId)
    .gte("placed_at", since)
    .order("placed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RetailerOrder[];
}

export async function setOrderStatus(
  id: string,
  status: RetailerOrderStatus
): Promise<RetailerOrder> {
  const patch: Record<string, unknown> = { status };
  if (status === "shipped") patch.shipped_at = new Date().toISOString();
  if (status === "delivered") patch.delivered_at = new Date().toISOString();

  const { data, error } = await client()
    .from("retailer_orders")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as RetailerOrder;
}

export async function listOffers(): Promise<RetailerOffer[]> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_offers")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("ends_on", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RetailerOffer[];
}

export type OfferInput = {
  title: string;
  kind: OfferKind;
  code: string | null;
  discount_pct: number | null;
  flat_off_inr: number | null;
  min_order_inr: number | null;
  category: string | null;
  starts_on: string;
  ends_on: string;
  usage_limit: number | null;
  is_active: boolean;
};

export async function createOffer(input: OfferInput): Promise<RetailerOffer> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_offers")
    .insert({ ...input, retailer_id: retailerId })
    .select()
    .single();
  if (error) throw error;
  return data as RetailerOffer;
}

export async function toggleOffer(id: string, isActive: boolean): Promise<RetailerOffer> {
  const { data, error } = await client()
    .from("retailer_offers")
    .update({ is_active: isActive })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as RetailerOffer;
}

/** Is the offer live right now? */
export function offerIsLive(offer: RetailerOffer): boolean {
  if (!offer.is_active) return false;
  const today = new Date().toISOString().slice(0, 10);
  return offer.starts_on <= today && offer.ends_on >= today;
}

/* Procurement — retailer buys directly from farmers ------------------------ */

/** A farmer listing the retailer can procure from (marketplace produce/seed). */
export type FarmerListing = {
  id: string;
  seller_id: string;
  title: string;
  category: string;
  quantity_kg: number | null;
  price_inr: number | null;
  unit: string;
  district: string | null;
  state: string | null;
};

export async function listFarmerListings(district?: string | null): Promise<FarmerListing[]> {
  let query = client()
    .from("listings")
    .select("id, seller_id, title, category, quantity_kg, price_inr, unit, district, state")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(60);

  if (district) query = query.eq("district", district);

  const { data, error } = await query;
  if (error) throw error;

  // A retailer should not be offered its own listings.
  const me = await currentUserId();
  return ((data ?? []) as FarmerListing[]).filter((row) => row.seller_id !== me);
}

export async function listProcurement(): Promise<ProcurementRequest[]> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_procurement")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProcurementRequest[];
}

export type ProcurementInput = {
  listing_id: string | null;
  farmer_id: string | null;
  product_name: string;
  quantity_kg: number;
  rate_inr: number;
  farmer_district: string | null;
  notes: string | null;
};

export async function createProcurement(input: ProcurementInput): Promise<ProcurementRequest> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_procurement")
    .insert({ ...input, retailer_id: retailerId })
    .select()
    .single();
  if (error) throw error;
  return data as ProcurementRequest;
}

/* Messages ---------------------------------------------------------------- */

export async function listMessages(): Promise<RetailerMessage[]> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_messages")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RetailerMessage[];
}

export async function sendMessage(params: {
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  body: string;
}): Promise<RetailerMessage> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_messages")
    .insert({ ...params, retailer_id: retailerId, direction: "out" })
    .select()
    .single();
  if (error) throw error;
  return data as RetailerMessage;
}

/* Notifications ----------------------------------------------------------- */

export async function listNotifications(): Promise<RetailerNotification[]> {
  const retailerId = await currentUserId();
  const { data, error } = await client()
    .from("retailer_notifications")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as RetailerNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client()
    .from("retailer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const retailerId = await currentUserId();
  const { error } = await client()
    .from("retailer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("retailer_id", retailerId)
    .is("read_at", null);
  if (error) throw error;
}

/* ── Dashboard & analytics derivations ─────────────────────────────────── */

export type DashboardTotals = {
  totalOrders: number;
  totalSales: number;
  productsListed: number;
  monthlyProfit: number;
  ordersThisMonth: number;
  salesChangePct: number | null;
};

function startOfMonth(monthsAgo = 0): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - monthsAgo);
  return d;
}

/** The four KPI cards on the retailer home screen. */
export function dashboardTotals(
  orders: RetailerOrder[],
  products: RetailerProduct[]
): DashboardTotals {
  const paid = orders.filter((o) => o.status !== "cancelled");
  const thisMonthStart = startOfMonth();
  const lastMonthStart = startOfMonth(1);

  const thisMonth = paid.filter((o) => new Date(o.placed_at) >= thisMonthStart);
  const lastMonth = paid.filter((o) => {
    const at = new Date(o.placed_at);
    return at >= lastMonthStart && at < thisMonthStart;
  });

  const sum = (rows: RetailerOrder[], pick: (o: RetailerOrder) => number) =>
    rows.reduce((total, order) => total + pick(order), 0);

  const currentSales = sum(thisMonth, (o) => Number(o.amount_inr));
  const previousSales = sum(lastMonth, (o) => Number(o.amount_inr));

  return {
    totalOrders: orders.length,
    totalSales: sum(paid, (o) => Number(o.amount_inr)),
    productsListed: products.filter((p) => p.status === "active").length,
    monthlyProfit: sum(thisMonth, orderProfit),
    ordersThisMonth: thisMonth.length,
    salesChangePct:
      previousSales > 0 ? ((currentSales - previousSales) / previousSales) * 100 : null,
  };
}

export type Period = "day" | "week" | "month";

/** Bucket key used by the sales chart: day → yyyy-mm-dd, week → "Wk n", month → yyyy-mm. */
function bucketFor(date: Date, period: Period): string {
  if (period === "month") return date.toISOString().slice(0, 7);
  if (period === "week") {
    const monday = new Date(date);
    const day = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - day);
    return monday.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export type SalesPoint = {
  key: string;
  label: string;
  sales: number;
  profit: number;
  orders: number;
};

/** Sales and profit rolled up by day / week / month, oldest first. */
export function salesSeries(
  orders: RetailerOrder[],
  period: Period,
  buckets: number
): SalesPoint[] {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const keys: string[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const d = new Date(now);
    if (period === "day") d.setDate(d.getDate() - i);
    if (period === "week") d.setDate(d.getDate() - i * 7);
    if (period === "month") d.setMonth(d.getMonth() - i);
    keys.push(bucketFor(d, period));
  }
  const uniqueKeys = Array.from(new Set(keys));

  const map = new Map<string, SalesPoint>(
    uniqueKeys.map((key) => [key, { key, label: periodLabel(key, period), sales: 0, profit: 0, orders: 0 }])
  );

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const key = bucketFor(new Date(order.placed_at), period);
    const point = map.get(key);
    if (!point) continue;
    point.sales += Number(order.amount_inr);
    point.profit += orderProfit(order);
    point.orders += 1;
  }

  return Array.from(map.values());
}

function periodLabel(key: string, period: Period): string {
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  }
  const date = new Date(`${key}T00:00:00`);
  if (period === "week") {
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export type CategorySales = { category: ProductCategory; sales: number; orders: number };

/** Revenue per category, biggest first — the analytics breakdown. */
export function salesByCategory(
  orders: RetailerOrder[],
  products: RetailerProduct[]
): CategorySales[] {
  const categoryOf = new Map(products.map((p) => [p.id, p.category]));
  const totals = new Map<ProductCategory, CategorySales>(
    PRODUCT_CATEGORIES.map((category) => [category, { category, sales: 0, orders: 0 }])
  );

  for (const order of orders) {
    if (order.status === "cancelled" || !order.product_id) continue;
    const category = categoryOf.get(order.product_id);
    if (!category) continue;
    const row = totals.get(category)!;
    row.sales += Number(order.amount_inr);
    row.orders += 1;
  }

  return Array.from(totals.values()).sort((a, b) => b.sales - a.sales);
}

/** Best-selling products by revenue. */
export function topProducts(orders: RetailerOrder[], limit = 5) {
  const totals = new Map<string, { name: string; sales: number; qty: number }>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const row = totals.get(order.product_name) ?? { name: order.product_name, sales: 0, qty: 0 };
    row.sales += Number(order.amount_inr);
    row.qty += Number(order.quantity);
    totals.set(order.product_name, row);
  }
  return Array.from(totals.values())
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}
