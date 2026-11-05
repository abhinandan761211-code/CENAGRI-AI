import { supabase } from "@/lib/supabase";

/**
 * Marketplace — produce listings and the orders raised against them.
 *
 * `listings` and `orders` are defined in features.sql with RLS already in place
 * (anyone signed in browses active listings, only the seller writes theirs, and
 * a buyer creates their own order). The screen was a demo preview that showed
 * nothing even when sellers had posted, because nothing queried those tables.
 *
 * Prices are shown exactly as the seller typed them. No mandi comparison is
 * computed here: the app has no reliable daily price feed wired to a listing,
 * and an invented "below market rate" badge would be a lie.
 */

export type ListingCategory = "Grains" | "Vegetables" | "Fruits" | "Seeds" | "Fertiliser" | "Equipment";

export const LISTING_CATEGORIES: ListingCategory[] = [
  "Grains",
  "Vegetables",
  "Fruits",
  "Seeds",
  "Fertiliser",
  "Equipment",
];

export type Listing = {
  id: string;
  seller_id: string;
  title: string;
  category: ListingCategory;
  description: string | null;
  quantity_kg: number | null;
  price_inr: number | null;
  unit: "kg" | "quintal" | "tonne" | "piece";
  district: string | null;
  state: string | null;
  image_url: string | null;
  status: "draft" | "active" | "sold" | "archived";
  created_at: string;
  /** Filled in from `profiles`, not stored on the listing. */
  seller_name?: string | null;
};

export type MyOrder = {
  id: string;
  listing_id: string;
  quantity_kg: number;
  amount_inr: number;
  status: "pending" | "confirmed" | "delivered" | "cancelled";
  created_at: string;
  listing_title?: string | null;
};

/** Active listings, newest first, optionally narrowed by category and text. */
export async function listListings(category?: ListingCategory | null): Promise<Listing[]> {
  if (!supabase) return [];

  let query = supabase
    .from("listings")
    .select(
      "id, seller_id, title, category, description, quantity_kg, price_inr, unit, district, state, image_url, status, created_at"
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  // Only a genuinely missing table blames the schema file; an auth or network
  // failure says so instead.
  if (error) {
    if (error.code === "42P01" || /does not exist/i.test(error.message)) {
      throw new Error("The marketplace tables are missing. Apply database/supabase/features.sql.");
    }
    if (error.code === "42501" || error.code === "PGRST301" || /jwt|permission/i.test(error.message)) {
      throw new Error("Your session has expired. Sign in again to see listings.");
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Listing[];
  if (rows.length === 0) return [];

  // Seller names in one round trip rather than one per card.
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const { data: sellers } = await supabase.from("profiles").select("id, full_name").in("id", sellerIds);
  const nameById = new Map(
    ((sellers ?? []) as { id: string; full_name: string | null }[]).map((s) => [s.id, s.full_name])
  );

  return rows.map((r) => ({ ...r, seller_name: nameById.get(r.seller_id) ?? null }));
}

/** The signed-in account's own listings, all statuses. */
export async function listMyListings(): Promise<Listing[]> {
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, seller_id, title, category, description, quantity_kg, price_inr, unit, district, state, image_url, status, created_at"
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as Listing[];
}

export async function createListing(input: {
  title: string;
  category: ListingCategory;
  description?: string;
  quantityKg?: number | null;
  priceInr?: number | null;
  unit: Listing["unit"];
  district?: string | null;
  state?: string | null;
}): Promise<void> {
  if (!supabase) throw new Error("The marketplace is not connected on this deployment.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  if (input.title.trim().length < 3) throw new Error("Give the listing a title of at least 3 characters.");

  const { error } = await supabase.from("listings").insert({
    seller_id: user.id,
    title: input.title.trim().slice(0, 120),
    category: input.category,
    description: input.description?.trim().slice(0, 600) || null,
    quantity_kg: input.quantityKg ?? null,
    price_inr: input.priceInr ?? null,
    unit: input.unit,
    district: input.district ?? null,
    state: input.state ?? null,
    status: "active",
  });
  if (error) throw error;
}

/** Marks one of the seller's own listings sold; only the owner may do this. */
export async function markListingSold(listingId: string): Promise<void> {
  if (!supabase) throw new Error("The marketplace is not connected on this deployment.");
  const { error } = await supabase.from("listings").update({ status: "sold" }).eq("id", listingId);
  if (error) throw error;
}

/**
 * Buys `quantityKg` of a listing.
 *
 * `amount_inr` is computed client-side from the listing price and is NOT
 * trusted: features.sql only guards `amount_inr >= 0`. The seller confirms the
 * order before anything is paid, and the order row is what they work from.
 */
export async function placeOrder(input: {
  listing: Listing;
  quantityKg: number;
}): Promise<void> {
  if (!supabase) throw new Error("The marketplace is not connected on this deployment.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  if (input.listing.seller_id === user.id) {
    throw new Error("This is your own listing.");
  }
  if (!(input.quantityKg > 0)) throw new Error("Enter how much you want to buy.");

  // Per-kg price, whatever unit the seller used.
  const perKg =
    input.listing.price_inr == null
      ? 0
      : input.listing.unit === "quintal"
        ? input.listing.price_inr / 100
        : input.listing.unit === "tonne"
          ? input.listing.price_inr / 1000
          : input.listing.price_inr;

  const { error } = await supabase.from("orders").insert({
    listing_id: input.listing.id,
    buyer_id: user.id,
    quantity_kg: input.quantityKg,
    amount_inr: Math.round(perKg * input.quantityKg * 100) / 100,
    status: "pending",
  });
  if (error) throw error;
}

export async function listMyOrders(): Promise<MyOrder[]> {
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("orders")
    .select("id, listing_id, quantity_kg, amount_inr, status, created_at, listings(title)")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];

  const rows = (data ?? []) as unknown as (MyOrder & {
    listings: { title: string }[] | { title: string } | null;
  })[];

  return rows.map((r) => {
    const nested = Array.isArray(r.listings) ? r.listings[0] : r.listings;
    return {
      id: r.id,
      listing_id: r.listing_id,
      quantity_kg: r.quantity_kg,
      amount_inr: r.amount_inr,
      status: r.status,
      created_at: r.created_at,
      listing_title: nested?.title ?? null,
    };
  });
}

/** Human label for a price, e.g. "₹2,200 / quintal". */
export function priceLabel(listing: Listing): string {
  if (listing.price_inr == null) return "Price on request";
  const amount = `₹${Number(listing.price_inr).toLocaleString("en-IN")}`;
  return `${amount} / ${listing.unit}`;
}
