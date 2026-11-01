import { useState } from "react";
import { IndianRupee, Package, Search, Store, Tag, UserPlus, Users } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";

const CATEGORIES = ["All", "Grains", "Vegetables", "Fruits", "Seeds", "Fertiliser", "Equipment"];

/**
 * Marketplace — demo preview.
 *
 * The UI is real; the listings are not. There is no `listings` table yet, so
 * instead of inventing produce and sellers we show a genuine empty state.
 * The search and category controls work against that empty set, so the
 * interaction is real and the data honestly reports "none yet".
 */
export default function Marketplace() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  return (
    <FeatureShell
      title="Marketplace"
      description="Buy and sell produce, seeds, fertiliser and equipment directly with other CenAGRI users."
      demo
      demoNote="Listings, seller profiles and orders need a database table that does not exist yet — no invented produce is shown. The interface below is complete and ready to connect once `listings` and `orders` are created (schema in database/supabase/features.sql)."
    >
      <FarmerStats
        items={[
          { label: "Live listings", value: "0", icon: Store, hint: "Nothing posted in your district" },
          { label: "Active sellers", value: "0", icon: Users, hint: "Farmers selling here" },
          { label: "Your listings", value: "0", icon: Package, hint: "You have not posted yet" },
          { label: "Your orders", value: "0", icon: IndianRupee, hint: "Nothing bought yet" },
        ]}
      />

      <FarmerSection
        title="Browse the marketplace"
        description="Produce, seeds, fertiliser and equipment from other CenAGRI users"
        icon={Search}
        action={
          <button
            type="button"
            className="btn-primary h-9 px-3.5 text-xs"
            disabled
            title="Available once listings are enabled"
          >
            <Tag className="h-4 w-4" /> Post a listing
          </button>
        }
      >
        <div className="space-y-3 border-b border-slate-100 p-4 sm:px-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search produce, seeds, equipment…"
              className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              aria-label="Search marketplace"
            />
          </label>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  category === c
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

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
              : "When sellers post produce in your district, their listings appear here with price, quantity and mandi distance."}
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <UserPlus className="h-3.5 w-3.5" /> Listings will be live once the marketplace is enabled
          </p>
        </div>
      </FarmerSection>
    </FeatureShell>
  );
}
