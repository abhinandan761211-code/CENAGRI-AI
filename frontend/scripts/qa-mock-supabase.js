/**
 * QA harness: mock Supabase so the farmer account can be rendered without a
 * real project. Injected into the page before the app scripts run.
 */
(function () {
  const plantsEnabled = true;
  const now = new Date();
  const iso = (d) => new Date(d).toISOString().slice(0, 10);

  const user = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "rafiq.mondal@example.com",
    user_metadata: { full_name: "Rafiq Mondal", role: "Farmer" },
  };
  const profileRow = {
    id: user.id,
    full_name: "Rafiq Mondal",
    email: user.email,
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
  };

  const farms = [
    { id: "f1", owner_id: user.id, name: "North field", location: "Ketugram, Nadia", area_ha: 1.0, soil_type: "Alluvial", irrigation: "Shallow tubewell", crops: ["Paddy"], is_active: true, created_at: "2024-06-01T00:00:00Z", updated_at: "2024-06-01T00:00:00Z" },
    { id: "f2", owner_id: user.id, name: "Boro land", location: "Katwa, Purba Bardhaman", area_ha: 0.6, soil_type: "Clay loam", irrigation: "Canal", crops: ["Potato"], is_active: true, created_at: "2024-06-02T00:00:00Z", updated_at: "2024-06-02T00:00:00Z" },
  ];

  const crops = [
    { id: "c1", owner_id: user.id, farm_id: "f1", name: "Paddy", variety: "Swarna", area_ha: 1.0, planted_on: iso(new Date(now - 55 * 864e5)), growth_days: 120, health: 88, status: "healthy", next_action: "Apply urea (2nd dose)", next_action_on: iso(new Date(now + 3 * 864e5)), image_url: null, created_at: "2024-06-10T00:00:00Z", updated_at: "2024-06-10T00:00:00Z" },
    { id: "c2", owner_id: user.id, farm_id: "f2", name: "Potato", variety: "Pusa Ruby", area_ha: 0.6, planted_on: iso(new Date(now - 30 * 864e5)), growth_days: 90, health: 72, status: "monitor", next_action: "Check for late blight", next_action_on: iso(new Date(now + 1 * 864e5)), image_url: null, created_at: "2024-11-10T00:00:00Z", updated_at: "2024-11-10T00:00:00Z" },
  ];

  const tasks = [
    { id: "t1", owner_id: user.id, crop_id: "c1", farm_id: "f1", title: "Irrigate north field", kind: "irrigation", due_on: iso(now), done: false, done_on: null, created_at: "2024-06-01T00:00:00Z" },
    { id: "t2", owner_id: user.id, crop_id: "c2", farm_id: "f2", title: "Spray for blight", kind: "pest", due_on: iso(new Date(now + 4 * 864e5)), done: false, done_on: null, created_at: "2024-06-01T00:00:00Z" },
  ];

  const activities = [
    { id: "a1", owner_id: user.id, farm_id: "f1", crop_id: "c1", kind: "fertiliser", title: "Urea top dressing", notes: null, activity_on: iso(new Date(now - 4 * 864e5)), cost_inr: 1250, quantity: "25 kg/acre", created_at: "2024-06-01T00:00:00Z" },
  ];

  const expenses = [
    { id: "e1", owner_id: user.id, farm_id: "f1", crop_id: "c1", category: "seeds", amount_inr: 2400, spent_on: iso(new Date(now - 40 * 864e5)), note: null, vendor: "Mondal Bhandar", created_at: "2024-06-01T00:00:00Z" },
    { id: "e2", owner_id: user.id, farm_id: "f1", crop_id: "c1", category: "labour", amount_inr: 3600, spent_on: iso(new Date(now - 20 * 864e5)), note: null, vendor: null, created_at: "2024-06-01T00:00:00Z" },
  ];

  const soil = [
    { id: "s1", owner_id: user.id, farm_id: "f1", tested_on: iso(new Date(now - 60 * 864e5)), lab_name: "Block soil lab", ph: 6.4, ec_ds_m: 0.31, organic_carbon: 0.48, nitrogen_kg_ha: 265, phosphorus_kg_ha: 22, potassium_kg_ha: 175, soil_category: "Alluvial", recommendation: null, report_url: null, source: "lab report", created_at: "2024-06-01T00:00:00Z" },
  ];

  const groups = [
    { id: "g1", name: "Nadia paddy growers", description: "Share sowing dates, prices and pest news.", district: "Nadia", state: "West Bengal", crop: "Paddy", owner_id: "u9", created_at: "2024-06-01T00:00:00Z", farmer_group_members: [{ user_id: user.id }] },
    { id: "g2", name: "Potato traders & growers", description: "Cold storage and market talk.", district: "Hooghly", state: "West Bengal", crop: "Potato", owner_id: "u8", created_at: "2024-07-01T00:00:00Z", farmer_group_members: [] },
  ];

  const workers = [
    { id: "w1", full_name: "Sabita Das", details: { village: "Ketugram", district: "Nadia", state: "West Bengal", skills: "Transplanting, Weeding", daily_wage: "400", availability: "Seasonal", rating: "4.6", jobs_completed: "23", verified: "true" } },
    { id: "w2", full_name: "Bimal Ghosh", details: { village: "Katwa", district: "Purba Bardhaman", state: "West Bengal", skills: "Harvesting, Spraying", daily_wage: "450", availability: "Full time" } },
  ];

  const listings = [{ id: "l1", seller_id: user.id, title: "Paddy (Swarna)", category: "Grains", status: "active", created_at: "2024-11-01T00:00:00Z" }];
  const orders = [
    { id: "o1abcdef", quantity_kg: 900, amount_inr: 21000, status: "delivered", created_at: iso(new Date(now - 6 * 864e5)), buyer_id: "b1", listings: { id: "l1", title: "Paddy (Swarna)", seller_id: user.id } },
    { id: "o2abcdef", quantity_kg: 400, amount_inr: 9800, status: "pending", created_at: iso(new Date(now - 1 * 864e5)), buyer_id: "b2", listings: { id: "l1", title: "Paddy (Swarna)", seller_id: user.id } },
  ];

  const tables = {
    profiles: [profileRow, { id: "b1", full_name: "Sharma Fresh Produce" }, { id: "b2", full_name: "Anil Traders" }],
    farms,
    crops,
    farmer_tasks: tasks,
    farm_activities: activities,
    farmer_expenses: expenses,
    soil_tests: soil,
    irrigation_logs: [],
    disease_analyses: [],
    farmer_documents: [],
    farmer_groups: groups,
    farmer_group_members: [{ group_id: "g1", user_id: user.id, role: "owner" }],
    farmer_group_posts: [{ id: "p1", group_id: "g1", author_id: "u9", body: "Sowed Swarna on Sunday. Anyone else started?", created_at: "2024-07-02T00:00:00Z", profiles: { full_name: "Harun Sheikh" } }],
    farmer_messages: [
      { id: "m1", thread_id: "th1", sender_id: "b1", recipient_id: user.id, body: "Is the paddy ready for pickup?", context_type: "order", context_id: "o1abcdef", read_at: null, created_at: "2024-11-02T09:00:00Z" },
    ],
    farmer_alert_prefs: [],
    listings,
    orders,
  };

  const photoUsers = workers;
  void photoUsers;

  function matchRows(table, filters) {
    let rows = (tables[table] ?? []).slice();
    for (const [key, value] of Object.entries(filters || {})) {
      const v = String(value);
      if (key === "limit" || key === "order") continue;
      const [op, ...rest] = v.split(".");
      const target = rest.join(".");
      if (key === "owner_id" || key === "seller_id" || key === "buyer_id" || key === "id") {
        const col = key === "seller_id" ? "seller_id" : key === "buyer_id" ? "buyer_id" : "owner_id";
        rows = rows.filter((r) => (r[col] ?? r.id) === target);
        continue;
      }
    }
    return rows;
  }

  function makeQuery(table, state) {
    const s = state || { filters: {}, single: null, maybeSingle: false, order: null, limit: null, head: false, count: false, mode: "select" };
    const chain = {
      select(_cols, opts) {
        if (opts && (opts.head || opts.count)) { s.head = true; s.count = true; }
        return chain;
      },
      eq(col, val) { s.filters[col] = `eq.${val}`; return chain; },
      in(col, vals) { s.filters[col] = `in.${vals.join(",")}`; return chain; },
      is(col, val) { s.filters[col] = `is.${val}`; return chain; },
      lte(col, val) { s.filters[col] = `lte.${val}`; return chain; },
      gte(col, val) { s.filters[col] = `gte.${val}`; return chain; },
      or(expr) { s.filters.__or = expr; return chain; },
      order(col, opts) { s.order = { col, ascending: opts && opts.ascending !== false }; return chain; },
      limit(n) { s.limit = n; return chain; },
      single() { s.single = true; return chain; },
      maybeSingle() { s.maybeSingle = true; return chain; },
      insert(payload) {
        s.mode = "insert";
        const rows = Array.isArray(payload) ? payload : [payload];
        const stored = rows.map((r, i) => ({ id: `${table}-new-${i}`, created_at: new Date().toISOString(), ...r }));
        tables[table] = [...(tables[table] ?? []), ...stored];
        s.inserted = stored;
        return chain;
      },
      update(payload) {
        s.mode = "update";
        const rows = matchRows(table, s.filters);
        for (const r of rows) Object.assign(r, payload);
        s.updated = rows;
        return chain;
      },
      upsert(payload) {
        s.mode = "upsert";
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const r of rows) {
          const existing = (tables[table] ?? []).find((x) => Object.keys(s.filters).every((k) => true) && x.id === r.id);
          if (existing) Object.assign(existing, r);
          else tables[table] = [...(tables[table] ?? []), { id: `${table}-new`, created_at: new Date().toISOString(), ...r }];
        }
        return chain;
      },
      delete() { s.mode = "delete"; return chain; },
      then(resolve) {
        let data;
        if (s.mode === "insert") data = s.inserted;
        else if (s.mode === "update") data = s.updated;
        else if (s.mode === "upsert") data = tables[table];
        else if (s.mode === "delete") data = [];
        else if (s.head) data = null;
        else {
          data = matchRows(table, s.filters);
          if (s.filters.__or) {
            const parts = String(s.filters.__or).split(",").map((p) => p.split("."));
            data = data.filter((r) => parts.some(([col, , val]) => r[col] === val));
          }
          if (s.order) data = [...data].sort((a, b) => (a[s.order.col] > b[s.order.col] ? 1 : -1) * (s.order.ascending ? 1 : -1));
          if (s.limit) data = data.slice(0, s.limit);
        }
        if (s.single) data = Array.isArray(data) ? data[0] ?? null : data;
        resolve({ data, error: null, count: (tables[table] ?? []).length });
        return Promise.resolve();
      },
    };
    return chain;
  }

  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "mock-token", user } }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user }, error: null }),
    },
    from(table) {
      return makeQuery(table);
    },
    storage: {
      from() {
        return {
          upload: async () => ({ error: null }),
          remove: async () => ({ error: null }),
          getPublicUrl: (p) => ({ data: { publicUrl: `https://example.invalid/${p}` } }),
          createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid/doc" } }),
        };
      },
    },
    channel() {
      return { on() { return this; }, subscribe() { return this; } };
    },
    removeChannel() { },
  };

  window.__CENAGRI_QA__ = { client, user, tables, enabled: plantsEnabled };
})();
