/**
 * Live mandi prices for the farmer dashboard.
 *
 * Data comes from the CenAGRI backend (`GET /mandi`), which proxies the
 * data.gov.in "Current Daily Price of Various Commodities from Various Markets
 * (Mandi)" dataset and caches it for 15 minutes. The data.gov.in API key lives
 * on the server — nothing here needs a browser-side key.
 */
import { ApiError, apiFetch } from "@/lib/api";

/** One mandi trade as published by Agmarknet via data.gov.in. */
export type MandiPrice = {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  /** DD/MM/YYYY, as published. */
  arrival_date: string;
  min_price: number | null;
  max_price: number | null;
  modal_price: number | null;
};

export type MandiResponse = {
  source: string;
  total: number;
  count: number;
  limit: number;
  offset: number;
  cached: boolean;
  records: MandiPrice[];
};

export type MandiQuery = {
  state?: string | null;
  district?: string | null;
  market?: string | null;
  commodity?: string | null;
  limit?: number;
  offset?: number;
};

/** Tabs shown above the price table, in display order. */
export const MANDI_TABS = ["Top Commodities", "Vegetables", "Grains", "Fruits"] as const;
export type MandiTab = (typeof MANDI_TABS)[number];

/**
 * Keywords used to bucket Agmarknet commodity names into the tabs.
 * Matching is on the lower-cased commodity name; first hit wins, so
 * "Tomato" lands in Vegetables and "Basmati Rice" in Grains.
 */
const TAB_KEYWORDS: Record<MandiTab, readonly string[]> = {
  "Top Commodities": [],
  Vegetables: [
    "tomato", "onion", "potato", "brinjal", "cauliflower", "cabbage", "bhindi",
    "lady finger", "okra", "carrot", "pea", "beans", "capsicum", "chilli",
    "cucumber", "bottle gourd", "bitter gourd", "pumpkin", "radish", "spinach",
    "ginger", "garlic", "corriander", "coriander", "drumstick", "beetroot",
  ],
  Grains: [
    "paddy", "rice", "wheat", "maize", "jowar", "bajra", "ragi", "barley",
    "gram", "moong", "urad", "arhar", "tur", "lentil", "masoor", "mustard",
    "groundnut", "soyabean", "soybean", "sesamum", "sunflower", "copra",
    "cotton", "jute", "sugarcane", "gur", "sugar",
  ],
  Fruits: [
    "mango", "banana", "apple", "orange", "grapes", "papaya", "guava",
    "pineapple", "watermelon", "muskmelon", "pomegranate", "lemon", "lime",
    "coconut", "sapota", "chikoo", "custard apple", "jack fruit", "jackfruit",
    "litchi", "strawberry", "ber", "amla",
  ],
};

/** Bucket a commodity name into a tab, or `null` if it fits none. */
export function tabForCommodity(commodity: string): MandiTab | null {
  const name = commodity.toLowerCase();
  for (const tab of MANDI_TABS) {
    if (tab === "Top Commodities") continue;
    if (TAB_KEYWORDS[tab].some((word) => name.includes(word))) return tab;
  }
  return null;
}

/** Sort highest modal price first — the most valuable trades lead. */
const byPrice = (a: MandiPrice, b: MandiPrice) =>
  (b.modal_price ?? 0) - (a.modal_price ?? 0);

/**
 * Build the display rows for one tab.
 *
 * "Top Commodities" is the highest-priced trades across the whole result set;
 * the other tabs keep only their own crops. Each commodity appears once (its
 * best-paying mandi), so the table reads as "where to sell", not a raw dump.
 */
export function rowsForTab(records: MandiPrice[], tab: MandiTab): MandiPrice[] {
  const pool =
    tab === "Top Commodities"
      ? [...records]
      : records.filter((r) => tabForCommodity(r.commodity) === tab);

  const seen = new Set<string>();
  const rows: MandiPrice[] = [];
  for (const record of pool.sort(byPrice)) {
    const key = record.commodity.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(record);
  }
  return rows;
}

/** Fetch one page of live prices, filtered by the farmer's location. */
export async function getMandiPrices(query: MandiQuery = {}): Promise<MandiResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return apiFetch<MandiResponse>(`/mandi${qs ? `?${qs}` : ""}`);
}

/** Friendlier copy for the errors the mandi feed actually produces. */
export function mandiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) return "Live mandi feed is not configured on the server.";
    if (err.status === 502) {
      if (/not authorised/i.test(err.message)) {
        return "The data.gov.in API key was rejected. Check DATA_GOV_API_KEY in the backend .env.";
      }
      return "The mandi price service is not responding right now.";
    }
  }
  if (err instanceof TypeError) {
    return "Could not reach the CenAGRI API. Is the backend running on :8000?";
  }
  return err instanceof Error ? err.message : "Could not load mandi prices.";
}

/** Local, human date label from `DD/MM/YYYY` ("Arrival 31 Oct"). */
export function arrivalLabel(date: string): string {
  const [d, m, y] = date.split("/").map(Number);
  if (!d || !m || !y) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
