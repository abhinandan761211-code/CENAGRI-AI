import { supabase } from "@/lib/supabase";
import { orderReference } from "@/lib/orders";

/**
 * Orders seen from the farmer's side: the ones on their listings (sales) and
 * the ones they placed themselves (purchases).
 *
 * Both views come from the same `orders` table that the buyer account already
 * uses, and RLS decides visibility: a seller sees orders on their listings, a
 * buyer sees their own orders. Nothing here widens that.
 */

export type FarmerOrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";

export type FarmerOrder = {
  id: string;
  reference: string;
  product: string | null;
  /** Buyer name for a sale, seller name for a purchase — hidden when unknown. */
  counterparty: string | null;
  quantity_kg: number | null;
  amount_inr: number;
  status: FarmerOrderStatus;
  created_at: string;
};

type Row = {
  id: string;
  quantity_kg: number | string | null;
  amount_inr: number | string | null;
  status: string;
  created_at: string;
  listings: { id: string; title: string | null; seller_id?: string | null } | { id: string; title: string | null; seller_id?: string | null }[] | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

function listingOf(row: Row) {
  return Array.isArray(row.listings) ? row.listings[0] : row.listings;
}

function toOrder(row: Row, counterparty: string | null): FarmerOrder {
  return {
    id: row.id,
    reference: orderReference(row.id),
    product: listingOf(row)?.title ?? null,
    counterparty,
    quantity_kg: row.quantity_kg != null ? Number(row.quantity_kg) : null,
    amount_inr: Number(row.amount_inr) || 0,
    status: (["pending", "confirmed", "delivered", "cancelled"].includes(row.status)
      ? row.status
      : "pending") as FarmerOrderStatus,
    created_at: row.created_at,
  };
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await client()
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  // A profile the seller cannot read is simply "unknown", never an error.
  if (error) return new Map();
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "CenAGRI user"]));
}

/** Orders placed on the signed-in farmer's own listings. */
export async function listSales(): Promise<FarmerOrder[]> {
  const user = (await client().auth.getUser()).data.user;
  if (!user) throw new Error("You are not signed in.");

  const { data, error } = await client()
    .from("orders")
    .select("id, quantity_kg, amount_inr, status, created_at, buyer_id, listings!inner(id,title,seller_id)")
    .eq("listings.seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as unknown as (Row & { buyer_id: string })[];
  const names = await namesFor(rows.map((r) => r.buyer_id));
  return rows.map((row) => toOrder(row, names.get(row.buyer_id) ?? "Buyer"));
}

/** Orders the signed-in farmer placed as a buyer. */
export async function listPurchases(): Promise<FarmerOrder[]> {
  const user = (await client().auth.getUser()).data.user;
  if (!user) throw new Error("You are not signed in.");

  const { data, error } = await client()
    .from("orders")
    .select("id, quantity_kg, amount_inr, status, created_at, listings(id,title,seller_id)")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  const sellerIds = rows.map((r) => (Array.isArray(r.listings) ? r.listings[0] : r.listings)?.seller_id ?? "").filter(Boolean);
  const names = await namesFor(sellerIds);
  return rows.map((row) => {
    const seller = (Array.isArray(row.listings) ? row.listings[0] : row.listings)?.seller_id;
    return toOrder(row, seller ? names.get(seller) ?? "Seller" : null);
  });
}

export const farm = { listSales, listPurchases };
