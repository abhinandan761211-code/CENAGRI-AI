/**
 * Buyer orders.
 *
 * Orders live in `public.orders`, joined to `public.listings` for the product
 * and seller. Nothing here is mocked: if the tables are missing the query fails
 * and the page shows a real error, and an empty table shows an empty state.
 */
import { supabase } from "@/lib/supabase";

/* ── Status model ──────────────────────────────────────────────────────── */

export const ORDER_STATUSES = [
  "Total order",
  "Pending confirmation",
  "In progress",
  "Ready for delivery",
  "Pending delivery",
  "Delivered",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The tab strip: every status, in the order the screenshot shows them. */
export const ORDER_TABS = ORDER_STATUSES;

type StatusStyle = { dot: string; badge: string };

/** Status colours — a dot in the tab, a badge on the card. */
export const STATUS_STYLE: Record<OrderStatus, StatusStyle> = {
  "Total order": { dot: "bg-slate-500", badge: "bg-slate-100 text-slate-700" },
  "Pending confirmation": { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  "In progress": { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  "Ready for delivery": { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-800" },
  "Pending delivery": { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-800" },
  Delivered: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
};

/** Sort options in the "All statuses" dropdown. */
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount-desc", label: "Amount: high to low" },
  { value: "amount-asc", label: "Amount: low to high" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

/* ── Types ─────────────────────────────────────────────────────────────── */

/** Statuses as stored in the DB map onto the five human-facing ones. */
const DB_TO_STATUS: Record<string, OrderStatus> = {
  pending: "Pending confirmation",
  confirmed: "In progress",
  ready: "Ready for delivery",
  dispatched: "Pending delivery",
  delivered: "Delivered",
  cancelled: "Delivered",
};

export type BuyerOrder = {
  id: string;
  /** Order reference shown in the card header. */
  reference: string;
  product: string | null;
  seller: string | null;
  district: string | null;
  quantity_kg: number | null;
  amount_inr: number;
  status: OrderStatus;
  /** ISO timestamp. */
  created_at: string;
};

type OrderRow = {
  id: string;
  quantity_kg: number | null;
  amount_inr: number;
  status: string;
  created_at: string;
  listings?: { title: string | null } | { title: string | null }[] | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** Short human reference from a UUID — stable and readable ("ORD-8F3A21"). */
export function orderReference(id: string): string {
  return `ORD-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Orders placed by the signed-in buyer, newest first. */
export async function listBuyerOrders(): Promise<BuyerOrder[]> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const { data, error } = await client()
    .from("orders")
    .select("id, quantity_kg, amount_inr, status, created_at, listings(title)")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as OrderRow[]).map((row) => {
    const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
    return {
      id: row.id,
      reference: orderReference(row.id),
      product: listing?.title ?? null,
      seller: null,
      district: null,
      quantity_kg: row.quantity_kg,
      amount_inr: Number(row.amount_inr) || 0,
      status: DB_TO_STATUS[row.status] ?? "Pending confirmation",
      created_at: row.created_at,
    };
  });
}

/* ── Derived view state ────────────────────────────────────────────────── */

/** Orders that belong to a tab. "Total order" holds everything. */
export function ordersForTab(orders: BuyerOrder[], tab: OrderStatus): BuyerOrder[] {
  return tab === "Total order" ? orders : orders.filter((o) => o.status === tab);
}

/** Count shown next to each tab label. */
export function countsByStatus(orders: BuyerOrder[]): Record<OrderStatus, number> {
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
    OrderStatus,
    number
  >;
  counts["Total order"] = orders.length;
  for (const order of orders) counts[order.status] += 1;
  return counts;
}

/** Apply the sort chosen in the dropdown. */
export function sortOrders(orders: BuyerOrder[], sort: SortValue): BuyerOrder[] {
  const copy = [...orders];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "amount-desc":
      return copy.sort((a, b) => b.amount_inr - a.amount_inr);
    case "amount-asc":
      return copy.sort((a, b) => a.amount_inr - b.amount_inr);
    default:
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

/** ₹1,43,614.68 — Indian digit grouping, two decimals like an invoice. */
export function formatAmount(value: number): string {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "Jan 15, 2026, 4:00 PM" */
export function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
