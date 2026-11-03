import { supabase } from "@/lib/supabase";
import { isMissingTable } from "@/lib/schemaCheck";

/**
 * Calls the signed-in farmer API on the CenAGRI FastAPI backend.
 *
 * Authentication: the Supabase access token is attached here, and the backend
 * verifies its signature before reading anything. The browser never sends a
 * user id — the server takes it from the verified token.
 *
 * Availability: some builds run the frontend without a backend. `isFarmerApiConfigured`
 * is always true (the path is proxied in dev and same-origin in production), so
 * a failure falls back to the same values computed from Supabase directly — and
 * the UI labels which source it used, so a number is never presented as
 * server-verified when it isn't.
 */

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1").replace(/\/$/, "");

export const isFarmerApiConfigured = Boolean(BASE);

export class ApiUnavailable extends Error {
  constructor(message = "The CenAGRI server is not configured for this build.") {
    super(message);
    this.name = "ApiUnavailable";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) throw new ApiUnavailable("Supabase is not configured for this build.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiUnavailable("Sign in again to use this feature.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) throw new ApiUnavailable();
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/farmer${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let detail = `The server returned ${res.status}.`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/* ── Overview ─────────────────────────────────────────────────────────── */

export type OverviewCrop = {
  id: string;
  name: string;
  variety: string | null;
  area_ha: number | null;
  planted_on: string;
  growth_days: number;
  health: number;
  status: string;
  next_action: string | null;
  next_action_on: string | null;
};

export type OverviewFarm = {
  id: string;
  name: string;
  location: string | null;
  area_ha: number | null;
  soil_type: string | null;
  irrigation: string | null;
  is_active: boolean;
};

export type OverviewTask = {
  id: string;
  title: string;
  kind: string;
  due_on: string;
  done: boolean;
  crop_id: string | null;
};

export type OverviewActivity = {
  id: string;
  kind: string;
  title: string;
  activity_on: string;
  cost_inr: number | null;
};

export type Overview = {
  counts: {
    farms: number;
    active_farms: number;
    active_crops: number;
    tasks_today: number;
    month_expenses_inr: number;
    month_expense_rows: number;
  };
  area_ha: number;
  crops: OverviewCrop[];
  farms: OverviewFarm[];
  tasks: OverviewTask[];
  recent_activities: OverviewActivity[];
  month_expenses: { crop_id: string; crop: string; spent_inr: number }[];
  latest_soil_test: { id: string; tested_on: string; ph: number | null; soil_category: string | null } | null;
  last_irrigation: { id: string; irrigated_on: string } | null;
  server_date: string;
};

/**
 * Overview straight from Supabase, for builds with no backend.
 *
 * Same shape and same rules as the server version: harvested crops are not
 * "active", and expenses are summed over the current calendar month. What it
 * cannot do is verify identity server-side — RLS does that instead.
 */
export async function overviewFromSupabase(): Promise<Overview> {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  async function rows<T>(table: string, columns: string, build?: (q: Query) => Query): Promise<T[]> {
    let q = supabase!.from(table).select(columns).eq("owner_id", user!.id) as unknown as Query;
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return [];
      throw error;
    }
    return (data ?? []) as T[];
  }

  type F = OverviewFarm & { created_at: string };
  type C = OverviewCrop & { planted_on: string };
  type E = { category: string; amount_inr: number | string; spent_on: string; crop_id: string | null };

  const [farms, crops, tasks, activities, expenses, soil, irrigation] = await Promise.all([
    rows<F>("farms", "*"),
    rows<C>("crops", "*"),
    rows<OverviewTask>("farmer_tasks", "*", (q) => q.eq("done", false).lte("due_on", todayIso).order("due_on", { ascending: true }).limit(20)),
    rows<OverviewActivity>("farm_activities", "id,kind,title,activity_on,cost_inr", (q) =>
      q.order("activity_on", { ascending: false }).limit(8)
    ),
    rows<E>("farmer_expenses", "category,amount_inr,spent_on,crop_id", (q) =>
      q.gte("spent_on", monthStart).order("spent_on", { ascending: false })
    ),
    rows<{ id: string; tested_on: string; ph: number | null; soil_category: string | null }>(
      "soil_tests",
      "id,tested_on,ph,soil_category",
      (q) => q.order("tested_on", { ascending: false }).limit(1)
    ),
    rows<{ id: string; irrigated_on: string }>("irrigation_logs", "id,irrigated_on", (q) =>
      q.order("irrigated_on", { ascending: false }).limit(1)
    ),
  ]);

  const activeCrops = crops.filter((c) => (c.status ?? "healthy") !== "harvested");
  const area = farms.reduce((sum, f) => sum + Number(f.area_ha ?? 0), 0);
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount_inr ?? 0), 0);
  const cropNames = new Map(crops.map((c) => [c.id, c.name]));
  const byCrop = new Map<string, number>();
  for (const e of expenses) {
    const key = e.crop_id ?? "unassigned";
    byCrop.set(key, (byCrop.get(key) ?? 0) + Number(e.amount_inr ?? 0));
  }

  return {
    counts: {
      farms: farms.length,
      active_farms: farms.filter((f) => f.is_active !== false).length,
      active_crops: activeCrops.length,
      tasks_today: tasks.length,
      month_expenses_inr: Math.round(spent * 100) / 100,
      month_expense_rows: expenses.length,
    },
    area_ha: Math.round(area * 100) / 100,
    crops: activeCrops.slice(0, 8),
    farms: farms.slice(0, 6),
    tasks: tasks.slice(0, 10),
    recent_activities: activities,
    month_expenses: [...byCrop.entries()]
      .map(([id, value]) => ({ crop_id: id, crop: cropNames.get(id) ?? "Unassigned", spent_inr: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.spent_inr - a.spent_inr),
    latest_soil_test: soil[0] ?? null,
    last_irrigation: irrigation[0] ?? null,
    server_date: todayIso,
  };
}

type Query = {
  eq: (column: string, value: unknown) => Query;
  lte: (column: string, value: string) => Query;
  gte: (column: string, value: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

export const getOverview = () => request<Overview>("/overview");

/* ── Finance ──────────────────────────────────────────────────────────── */

export type Finance = {
  range: { from: string; to: string };
  expenses: {
    rows: {
      id: string;
      category: string;
      amount_inr: number;
      spent_on: string;
      note: string | null;
      vendor: string | null;
      crop_id: string | null;
    }[];
    total_inr: number;
    by_category: { category: string; amount_inr: number }[];
    by_crop: { crop: string; amount_inr: number }[];
  };
  revenue: {
    confirmed_inr: number;
    pending_inr: number;
    confirmed_orders: number;
    pending_orders: number;
    note: string;
  };
  profit: { net_inr: number | null; basis: string };
};

export const getFinance = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set("date_from", from);
  if (to) params.set("date_to", to);
  const qs = params.toString();
  return request<Finance>(`/finance${qs ? `?${qs}` : ""}`);
};

/* ── AI advisory ──────────────────────────────────────────────────────── */

export type FarmerAdvice = {
  mode: "ai" | "demo";
  model: string | null;
  answer: string;
  steps: string[];
  notice: string | null;
  language: string;
  context: {
    crop: string | null;
    crop_stage: string | null;
    soil: string | null;
    district: string | null;
    state: string | null;
  };
};

export const askFarmerAdvisory = (payload: {
  question: string;
  crop?: string | null;
  crop_stage?: string | null;
  soil?: string | null;
  weather?: string | null;
  language: string;
  farm_id?: string | null;
}) => request<FarmerAdvice>("/advisory", { method: "POST", body: JSON.stringify(payload) });

export const getFarmerAiStatus = () => request<{ configured: boolean; model: string | null }>("/ai-status");
