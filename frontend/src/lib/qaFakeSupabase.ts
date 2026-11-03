/**
 * QA preload: replace `@supabase/supabase-js` with an in-memory fake.
 *
 * Dev-preview hook, off unless the build is explicitly started for QA:
 *
 *   VITE_QA_FAKE_SUPABASE=1 npx vite --port 5179
 *
 * It lets the whole farmer account be rendered end-to-end (auth, profiles,
 * farms, crops, orders, groups, documents) with no project credentials and no
 * network. Everything lives in memory and resets on reload, so it can never
 * touch real data.
 */
import type { User } from "@supabase/supabase-js";

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const QA_USER: User = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "rafiq.mondal@example.com",
  app_metadata: {},
  aud: "authenticated",
  created_at: "2024-05-02T10:00:00Z",
  user_metadata: { full_name: "Rafiq Mondal", role: "Farmer" },
};

type Row = Record<string, unknown>;
const seed = (): Record<string, Row[]> => ({
  profiles: [
    {
      id: QA_USER.id,
      full_name: "Rafiq Mondal",
      email: QA_USER.email,
      phone: "9876543210",
      role: "Farmer",
      avatar_url: null,
      details: {
        state: "West Bengal",
        district: "Nadia",
        village: "Ketugram",
        land_size: "2.5",
        main_crops: "Paddy, Potato",
        irrigation: "Shallow tubewell",
      },
      created_at: "2024-05-02T10:00:00Z",
      updated_at: "2025-01-01T10:00:00Z",
    },
    { id: "b1", full_name: "Sharma Fresh Produce", email: "buyer1@example.com", role: "Buyer", details: {} },
    { id: "b2", full_name: "Anil Traders", email: "buyer2@example.com", role: "Buyer", details: {} },
    { id: "u9", full_name: "Harun Sheikh", email: "harun@example.com", role: "Farmer", details: { district: "Nadia" } },
  ],
  farms: [
    {
      id: "f1",
      owner_id: QA_USER.id,
      name: "North field",
      location: "Ketugram, Nadia",
      area_ha: 1,
      soil_type: "Alluvial",
      irrigation: "Shallow tubewell",
      crops: ["Paddy"],
      is_active: true,
      created_at: "2024-06-01T00:00:00Z",
      updated_at: "2024-06-01T00:00:00Z",
    },
    {
      id: "f2",
      owner_id: QA_USER.id,
      name: "Boro land",
      location: "Katwa, Purba Bardhaman",
      area_ha: 0.6,
      soil_type: "Clay loam",
      irrigation: "Canal",
      crops: ["Potato"],
      is_active: true,
      created_at: "2024-06-02T00:00:00Z",
      updated_at: "2024-06-02T00:00:00Z",
    },
  ],
  crops: [
    {
      id: "c1",
      owner_id: QA_USER.id,
      farm_id: "f1",
      name: "Paddy",
      variety: "Swarna",
      area_ha: 1,
      planted_on: iso(now - 55 * 864e5),
      growth_days: 120,
      health: 88,
      status: "healthy",
      next_action: "Apply urea (2nd dose)",
      next_action_on: iso(now + 3 * 864e5),
      image_url: null,
      created_at: "2024-06-10T00:00:00Z",
      updated_at: "2024-06-10T00:00:00Z",
    },
    {
      id: "c2",
      owner_id: QA_USER.id,
      farm_id: "f2",
      name: "Potato",
      variety: "Pusa Ruby",
      area_ha: 0.6,
      planted_on: iso(now - 30 * 864e5),
      growth_days: 90,
      health: 72,
      status: "monitor",
      next_action: "Irrigate 2nd time",
      next_action_on: iso(now + 1 * 864e5),
      image_url: null,
      created_at: "2024-11-10T00:00:00Z",
      updated_at: "2024-11-10T00:00:00Z",
    },
  ],
  farmer_tasks: [
    { id: "t1", owner_id: QA_USER.id, crop_id: "c1", farm_id: "f1", title: "Irrigate north field", kind: "irrigation", due_on: iso(now), done: false, done_on: null, created_at: "2024-06-01T00:00:00Z" },
    { id: "t2", owner_id: QA_USER.id, crop_id: "c2", farm_id: "f2", title: "Spray for blight", kind: "pest", due_on: iso(now + 4 * 864e5), done: false, done_on: null, created_at: "2024-06-01T00:00:00Z" },
  ],
  farm_activities: [
    { id: "a1", owner_id: QA_USER.id, farm_id: "f1", crop_id: "c1", kind: "fertiliser", title: "Urea top dressing", notes: null, activity_on: iso(now - 4 * 864e5), cost_inr: 1250, quantity: "25 kg/acre", created_at: "2024-06-01T00:00:00Z" },
  ],
  farmer_expenses: [
    { id: "e1", owner_id: QA_USER.id, farm_id: "f1", crop_id: "c1", category: "seeds", amount_inr: 2400, spent_on: iso(now - 40 * 864e5), note: null, vendor: "Mondal Bhandar", created_at: "2024-06-01T00:00:00Z" },
    { id: "e2", owner_id: QA_USER.id, farm_id: "f1", crop_id: "c1", category: "labour", amount_inr: 3600, spent_on: iso(now - 20 * 864e5), note: null, vendor: null, created_at: "2024-06-01T00:00:00Z" },
  ],
  soil_tests: [
    { id: "s1", owner_id: QA_USER.id, farm_id: "f1", tested_on: iso(now - 60 * 864e5), lab_name: "Block soil lab", ph: 6.4, ec_ds_m: 0.31, organic_carbon: 0.48, nitrogen_kg_ha: 265, phosphorus_kg_ha: 22, potassium_kg_ha: 175, soil_category: "Alluvial", recommendation: null, report_url: null, source: "lab report", created_at: "2024-06-01T00:00:00Z" },
  ],
  irrigation_logs: [
    { id: "i1", owner_id: QA_USER.id, farm_id: "f1", crop_id: "c1", irrigated_on: iso(now - 3 * 864e5), method: "pump", hours: 3, volume_m3: null, cost_inr: 220, notes: null, created_at: "2024-06-01T00:00:00Z" },
  ],
  disease_analyses: [],
  farmer_documents: [],
  farmer_groups: [
    { id: "g1", name: "Nadia paddy growers", description: "Share sowing dates, prices and pest news.", district: "Nadia", state: "West Bengal", crop: "Paddy", owner_id: "u9", created_at: "2024-06-01T00:00:00Z" },
    { id: "g2", name: "Potato traders & growers", description: "Cold storage and market talk.", district: "Hooghly", state: "West Bengal", crop: "Potato", owner_id: "b1", created_at: "2024-07-01T00:00:00Z" },
  ],
  farmer_group_members: [
    { group_id: "g1", user_id: QA_USER.id, role: "member", created_at: "2024-06-02T00:00:00Z" },
    { group_id: "g1", user_id: "u9", role: "owner", created_at: "2024-06-01T00:00:00Z" },
  ],
  farmer_group_posts: [
    { id: "p1", group_id: "g1", author_id: "u9", body: "Sowed Swarna on Sunday. Anyone else started?", created_at: "2024-07-02T00:00:00Z" },
  ],
  farmer_messages: [
    { id: "m1", thread_id: "th1", sender_id: "b1", recipient_id: QA_USER.id, body: "Is the paddy ready for pickup?", context_type: "order", context_id: "o1abcdef", read_at: null, created_at: "2024-11-02T09:00:00Z" },
  ],
  farmer_alert_prefs: [],
  listings: [
    { id: "l1", seller_id: QA_USER.id, title: "Paddy (Swarna)", category: "Grains", status: "active", created_at: "2024-11-01T00:00:00Z" },
  ],
  orders: [
    { id: "o1abcdef", listing_id: "l1", buyer_id: "b1", quantity_kg: 900, amount_inr: 21000, status: "delivered", created_at: iso(now - 6 * 864e5) },
    { id: "o2abcdef", listing_id: "l1", buyer_id: "b2", quantity_kg: 400, amount_inr: 9800, status: "pending", created_at: iso(now - 1 * 864e5) },
  ],
});

const db = seed();

type Filter = { op: string; value: unknown };
type State = {
  table: string;
  filters: Record<string, Filter>;
  or?: string;
  order?: { col: string; ascending: boolean };
  limit?: number;
  head: boolean;
  mode: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: Row | Row[];
  single: null | "single" | "maybe";
};

function value(row: Row, col: string): unknown {
  if (col in row) return row[col];
  // Embedded relations are resolved by the caller before this runs.
  return undefined;
}

function applyFilters(rows: Row[], s: State): Row[] {
  let out = rows;
  for (const [col, f] of Object.entries(s.filters)) {
    if (col.startsWith("__")) continue;
    out = out.filter((row) => {
      const v = value(row, col);
      if (f.op === "eq") return v === f.value;
      if (f.op === "in") return (f.value as unknown[]).includes(v);
      if (f.op === "is") return f.value === null ? v == null : v === f.value;
      if (f.op === "lte") return String(v ?? "") <= String(f.value);
      if (f.op === "gte") return String(v ?? "") >= String(f.value);
      if (f.op === "neq") return v !== f.value;
      return true;
    });
  }
  if (s.or) {
    const clauses = s.or.split(",").map((c) => c.split("."));
    out = out.filter((row) => clauses.some(([col, op, val]) => (op === "eq" ? row[col] === val : true)));
  }
  return out;
}

/** Resolve `listings(...)` / `profiles:author_id(...)` embeds the pages use. */
function embed(table: string, rows: Row[]): Row[] {
  return rows.map((row) => {
    const next: Row = { ...row };
    if (table === "orders") {
      next.listings = (db.listings ?? []).find((l) => l.id === row.listing_id) ?? null;
    }
    if (table === "farmer_group_posts") {
      next.profiles = (db.profiles ?? []).find((p) => p.id === row.author_id) ?? null;
    }
    if (table === "farmer_groups") {
      next.farmer_group_members = (db.farmer_group_members ?? []).filter((m) => m.group_id === row.id);
    }
    return next;
  });
}

class Query {
  private s: State;
  constructor(table: string) {
    this.s = { table, filters: {}, head: false, mode: "select", single: null };
  }
  select(_cols?: string, opts?: { head?: boolean; count?: string }) {
    if (opts?.head) this.s.head = true;
    return this;
  }
  eq(col: string, val: unknown) { this.s.filters[col] = { op: "eq", value: val }; return this; }
  in(col: string, vals: unknown[]) { this.s.filters[col] = { op: "in", value: vals }; return this; }
  is(col: string, val: unknown) { this.s.filters[col] = { op: "is", value: val }; return this; }
  neq(col: string, val: unknown) { this.s.filters[col] = { op: "neq", value: val }; return this; }
  lte(col: string, val: unknown) { this.s.filters[col] = { op: "lte", value: val }; return this; }
  gte(col: string, val: unknown) { this.s.filters[col] = { op: "gte", value: val }; return this; }
  or(expr: string) { this.s.or = expr; return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.s.order = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) { this.s.limit = n; return this; }
  single() { this.s.single = "single"; return this; }
  maybeSingle() { this.s.single = "maybe"; return this; }
  insert(payload: Row | Row[]) {
    this.s.mode = "insert";
    this.s.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.s.mode = "update";
    this.s.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[]) {
    this.s.mode = "upsert";
    this.s.payload = payload;
    return this;
  }
  delete() {
    this.s.mode = "delete";
    return this;
  }

  private run(): { data: unknown; error: null; count: number } {
    const table = this.s.table;
    db[table] = db[table] ?? [];
    const payloadRows = Array.isArray(this.s.payload) ? this.s.payload : this.s.payload ? [this.s.payload] : [];

    if (this.s.mode === "insert") {
      const stored = payloadRows.map((r, i) => ({
        id: `${table}-${Date.now()}-${i}`,
        created_at: new Date().toISOString(),
        ...r,
      }));
      db[table].push(...stored);
      return { data: this.s.single ? stored[0] ?? null : stored, error: null, count: db[table].length };
    }
    if (this.s.mode === "upsert") {
      for (const r of payloadRows) {
        const key = r.owner_id ?? r.id ?? r.thread_id;
        const existing = db[table].find((x) => (x.owner_id ?? x.id) === key);
        if (existing) Object.assign(existing, r);
        else db[table].push({ id: `${table}-${Date.now()}`, created_at: new Date().toISOString(), ...r });
      }
      return { data: payloadRows[0] ?? null, error: null, count: db[table].length };
    }
    if (this.s.mode === "update") {
      const rows = applyFilters(db[table], this.s);
      for (const row of rows) Object.assign(row, this.s.payload);
      return { data: rows, error: null, count: rows.length };
    }
    if (this.s.mode === "delete") {
      const rows = applyFilters(db[table], this.s);
      db[table] = db[table].filter((r) => !rows.includes(r));
      return { data: null, error: null, count: 0 };
    }

    if (this.s.head) return { data: null, error: null, count: db[table].length };

    let rows = applyFilters(db[table], this.s);
    rows = embed(table, rows);
    if (this.s.order) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[this.s.order!.col] ?? "");
        const bv = String(b[this.s.order!.col] ?? "");
        return (av > bv ? 1 : av < bv ? -1 : 0) * (this.s.order!.ascending ? 1 : -1);
      });
    }
    if (this.s.limit) rows = rows.slice(0, this.s.limit);

    const data = this.s.single ? rows[0] ?? null : rows;
    return { data, error: null, count: rows.length };
  }

  then(resolve: (v: unknown) => void) {
    resolve(this.run());
    return Promise.resolve();
  }
}

const session = { access_token: "qa-token", refresh_token: "qa-refresh", user: QA_USER };

const auth = {
  getSession: async () => ({ data: { session }, error: null }),
  getUser: async () => ({ data: { user: QA_USER }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }),
  signInWithPassword: async () => ({ data: { session, user: QA_USER }, error: null }),
  signUp: async () => ({ data: { session, user: QA_USER }, error: null }),
  signInWithOAuth: async () => ({ data: null, error: null }),
  signOut: async () => ({ error: null }),
  updateUser: async () => ({ data: { user: QA_USER }, error: null }),
  resetPasswordForEmail: async () => ({ data: null, error: null }),
};

const storage = {
  from: () => ({
    upload: async () => ({ data: { path: "qa" }, error: null }),
    remove: async () => ({ data: null, error: null }),
    getPublicUrl: (p: string) => ({ data: { publicUrl: `https://example.invalid/${p}` } }),
    createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid/doc" }, error: null }),
  }),
};

export function createClient(_url?: string, _key?: string, _opts?: unknown) {
  return {
    auth,
    from: (table: string) => new Query(table),
    storage,
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => undefined,
  };
}

export const qaDatabase = db;
