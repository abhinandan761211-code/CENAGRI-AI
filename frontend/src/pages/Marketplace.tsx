import { useCallback, useEffect, useMemo, useState } from "react";
import { IndianRupee, Package, Search, Store, Tag, Users } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { ErrorNote, Input, PrimaryButton, Select, Textarea } from "@/components/farm/farmerUI";
import { SchemaBanner } from "@/components/farm/SchemaBanner";
import { useAuth } from "@/hooks/useAuth";
import { useTableExists } from "@/lib/schemaCheck";
import {
  LISTING_CATEGORIES,
  createListing,
  listListings,
  listMyListings,
  listMyOrders,
  markListingSold,
  placeOrder,
  priceLabel,
} from "@/lib/marketplace";
import type { Listing, ListingCategory, MyOrder } from "@/lib/marketplace";

const FILTERS = ["All", ...LISTING_CATEGORIES] as const;

/**
 * Marketplace.
 *
 * Reads `listings` (published by any account) and writes both a new listing and
 * an `orders` row. The page used to be a demo preview with a disabled "Post a
 * listing" button and a hardcoded zero, even though features.sql already had the
 * tables and the RLS policies for exactly this flow.
 */
export default function Marketplace() {
  const { profile } = useAuth();
  const schema = useTableExists("listings");

  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [category, setCategory] = useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = useState("");

  // Post-listing dialog
  const [postOpen, setPostOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "Grains" as ListingCategory,
    quantity: "",
    price: "",
    unit: "quintal" as Listing["unit"],
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Buy dialog
  const [buying, setBuying] = useState<Listing | null>(null);
  const [buyQty, setBuyQty] = useState("");
  const [buySaving, setBuySaving] = useState(false);
  const [buyError, setBuyError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // One unfiltered fetch; category and text filtering happen locally so the
      // filter chips feel instant and do not re-query on every keystroke.
      const [rows, own, myOrders] = await Promise.all([listListings(), listMyListings(), listMyOrders()]);
      setListings(rows);
      setMine(own);
      setOrders(myOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the marketplace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schema.exists !== false) void load();
  }, [schema.exists, load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const district = (profile?.details?.district ?? "").toLowerCase();
    return listings
      .filter((l) => (category === "All" ? true : l.category === category))
      .filter((l) =>
        !q
          ? true
          : [l.title, l.description ?? "", l.district ?? "", l.category]
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
      // Same-district listings first — a farmer can actually collect those.
      .sort((a, b) => {
        const aMine = (a.district ?? "").toLowerCase() === district ? 0 : 1;
        const bMine = (b.district ?? "").toLowerCase() === district ? 0 : 1;
        return aMine - bMine;
      });
  }, [listings, category, query, profile?.details?.district]);

  async function submitListing(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await createListing({
        title: form.title,
        category: form.category,
        description: form.description,
        quantityKg: form.quantity ? Number(form.quantity) : null,
        priceInr: form.price ? Number(form.price) : null,
        unit: form.unit,
        district: profile?.details?.district ?? null,
        state: profile?.details?.state ?? null,
      });
      setPostOpen(false);
      setForm({ title: "", category: "Grains", quantity: "", price: "", unit: "quintal", description: "" });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not publish the listing.");
    } finally {
      setSaving(false);
    }
  }

  async function submitOrder() {
    if (!buying) return;
    setBuyError("");
    setBuySaving(true);
    try {
      await placeOrder({ listing: buying, quantityKg: Number(buyQty) });
      setBuying(null);
      setBuyQty("");
      await load();
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Could not place the order.");
    } finally {
      setBuySaving(false);
    }
  }

  async function sold(listing: Listing) {
    try {
      await markListingSold(listing.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark the listing sold.");
    }
  }

  const sellers = useMemo(() => new Set(listings.map((l) => l.seller_id)).size, [listings]);

  return (
    <FeatureShell
      title="Marketplace"
      description="Buy and sell produce, seeds, fertiliser and equipment directly with other CenAGRI users."
    >
      {schema.exists === false && <SchemaBanner file={schema.file} tables={["listings", "orders"]} />}

      <FarmerStats
        items={[
          { label: "Live listings", value: String(listings.length), icon: Store, hint: "Active posts" },
          { label: "Sellers", value: String(sellers), icon: Users, hint: "Accounts selling here" },
          { label: "Your listings", value: String(mine.length), icon: Package, hint: "Things you are selling" },
          { label: "Your orders", value: String(orders.length), icon: IndianRupee, hint: "Things you have bought" },
        ]}
      />

      {error && (
        <div className="px-4 sm:px-5">
          <ErrorNote message={error} />
        </div>
      )}

      <FarmerSection
        title="Browse the marketplace"
        description="Produce, seeds, fertiliser and equipment from other CenAGRI users"
        icon={Search}
        action={
          <button
            type="button"
            onClick={() => setPostOpen(true)}
            className="creator-btn-primary h-9 px-3.5 text-xs"
          >
            <Tag className="h-4 w-4" /> Post a listing
          </button>
        }
      >
        <div className="space-y-3 border-b border-slate-200 p-4 sm:px-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search produce, seeds, equipment…"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
              aria-label="Search marketplace"
            />
          </label>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {FILTERS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${category === c ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">Loading listings…</p>
        ) : visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Store className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-forest">
              {query || category !== "All" ? "No listings match this search" : "No listings yet"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              {query || category !== "All"
                ? "Nothing in the marketplace matches your filters right now."
                : "Be the first — post what you have harvested and buyers in your district will see it here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((listing) => {
              const isMine = listing.seller_id === profile?.id;
              return (
                <li key={listing.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-forest">{listing.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {listing.category}
                      {listing.seller_name ? ` · ${listing.seller_name}` : ""}
                      {listing.district ? ` · ${listing.district}` : ""}
                      {listing.quantity_kg ? ` · ${Number(listing.quantity_kg).toLocaleString("en-IN")} kg left` : ""}
                    </p>
                  </div>
                  <p className="text-[13px] font-bold text-brand-700">{priceLabel(listing)}</p>
                  {isMine ? (
                    <button
                      type="button"
                      onClick={() => void sold(listing)}
                      className="btn-outline h-9 px-3 text-xs"
                    >
                      Mark sold
                    </button>
                  ) : (
                    <PrimaryButton
                      type="button"
                      onClick={() => {
                        setBuying(listing);
                        setBuyQty("");
                        setBuyError("");
                      }}
                      disabled={listing.seller_id === profile?.id}
                    >
                      Buy
                    </PrimaryButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </FarmerSection>

      {orders.length > 0 && (
        <FarmerSection title="Your orders" icon={IndianRupee}>
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-[12px] sm:px-5">
                <span className="min-w-0 flex-1 truncate font-semibold text-forest">
                  {o.listing_title ?? "Listing"}
                </span>
                <span className="text-slate-500">{Number(o.quantity_kg).toLocaleString("en-IN")} kg</span>
                <span className="font-bold text-brand-700">₹{Number(o.amount_inr).toLocaleString("en-IN")}</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${o.status === "delivered"
                      ? "bg-emerald-50 text-emerald-700"
                      : o.status === "cancelled"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                >
                  {o.status}
                </span>
              </li>
            ))}
          </ul>
        </FarmerSection>
      )}

      {mine.length > 0 && (
        <FarmerSection title="Your listings" icon={Package}>
          <ul className="divide-y divide-slate-100">
            {mine.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-[12px] sm:px-5">
                <span className="min-w-0 flex-1 truncate font-semibold text-forest">{l.title}</span>
                <span className="text-slate-500">{priceLabel(l)}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                  {l.status}
                </span>
              </li>
            ))}
          </ul>
        </FarmerSection>
      )}

      {/* ── Post a listing ── */}
      {postOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <form onSubmit={submitListing} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-sm font-bold text-forest">Post a listing</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Buyers in {profile?.details?.district || "your district"} see this first.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">What are you selling?</span>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Fresh potatoes, graded"
                  required
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Category</span>
                  <Select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as ListingCategory })}
                  >
                    {LISTING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Priced per</span>
                  <Select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value as Listing["unit"] })}
                  >
                    <option value="kg">kg</option>
                    <option value="quintal">quintal</option>
                    <option value="tonne">tonne</option>
                    <option value="piece">piece</option>
                  </Select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Quantity (kg)</span>
                  <Input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    placeholder="e.g. 500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Price (₹)</span>
                  <Input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="e.g. 2200"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Details</span>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Variety, grade, when it can be collected…"
                />
              </label>
            </div>

            {formError && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPostOpen(false)}
                disabled={saving}
                className="btn-outline h-9 px-3 text-xs"
              >
                Cancel
              </button>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Publishing…" : "Publish listing"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}

      {/* ── Buy ── */}
      {buying && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-sm font-bold text-forest">Buy {buying.title}</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {priceLabel(buying)}
              {buying.seller_name ? ` · ${buying.seller_name}` : ""}
            </p>

            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">Quantity (kg)</span>
              <Input
                type="number"
                min={1}
                value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)}
                placeholder="e.g. 100"
              />
            </label>

            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              The seller confirms the order before anything is paid or collected.
            </p>

            {buyError && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {buyError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBuying(null)}
                disabled={buySaving}
                className="btn-outline h-9 px-3 text-xs"
              >
                Cancel
              </button>
              <PrimaryButton type="button" onClick={() => void submitOrder()} disabled={buySaving}>
                {buySaving ? "Sending…" : "Place order"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
