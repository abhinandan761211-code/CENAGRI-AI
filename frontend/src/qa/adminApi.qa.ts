/**
 * QA-only admin API stub (temporary).
 *
 * Swapped in by `vite.qa.config.ts` for `@/lib/admin/api` so the admin screens
 * can be rendered and inspected without a Supabase project or the Python API.
 * It returns fixtures shaped exactly like the backend responses. It is NOT
 * part of the production build.
 */

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

const me = {
  user_id: "qa-admin-1",
  email: "admin@kalika.test",
  role_key: "super_admin",
  role_label: "Super Admin",
  permissions: [
    "dashboard.view",
    "users.view",
    "users.moderate",
    "users.export",
    "kyc.view",
    "kyc.review",
    "roles.view",
    "roles.manage",
    "content.view",
    "content.moderate",
    "content.feature",
    "hubs.view",
    "marketplace.view",
    "orders.view",
    "orders.manage",
    "cenfriend.view",
    "agri_data.view",
    "ai.view",
    "analytics.view",
    "analytics.export",
    "support.view",
    "notifications.view",
    "cms.view",
    "settings.view",
    "security.audit",
    "system.health",
  ],
  mfa: "aal1",
};

const users = Array.from({ length: 12 }).map((_, i) => ({
  id: `user-${i}`,
  full_name: ["Ramesh Yadav", "Sunita Devi", "Ajay Patel", "Meera Sahu", "Kunal Rout", "Fatima Khan"][i % 6] + ` ${i}`,
  email: `user${i}@kalika.test`,
  phone: `98${String(700000000 + i).slice(0, 8)}`,
  role: ["Farmer", "Buyer", "Retailer", "Worker", "Transporter", "Content Creator"][i % 6],
  account_status: (["active", "active", "pending", "active", "suspended", "active"] as const)[i % 6],
  status_reason: i % 6 === 4 ? "Spam in marketplace listings" : null,
  created_at: new Date(Date.now() - i * 86_400_000 * 4).toISOString(),
  last_active_at: i % 3 === 0 ? new Date().toISOString() : null,
  avatar_url: null,
  location: { state: "Chhattisgarh", district: "Raipur", village: null },
}));

const growth = Array.from({ length: 30 }).map((_, i) => ({
  day: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
  count: Math.round(8 + 14 * Math.sin(i / 3) + i),
}));

const fixtures: Record<string, unknown> = {
  "/roles/me": me,
  "/dashboard": {
    generated_at: new Date().toISOString(),
    users: { total: 12480, active: 11890, suspended: 42, blocked: 11, new_30d: 964, dau: 1180, mau: 6420 },
    accounts: {
      farmers: 6120,
      buyers: 2410,
      retailers: 1380,
      workers: 820,
      transporters: 610,
      equipment_owners: 420,
      warehouse_owners: 180,
      content_creators: 540,
    },
    content: { posts: 3120, videos: 860, shorts: 1240, published_videos: 742, views_30d: 184320 },
    marketplace: { products: 2860, orders: 4120 },
    queues: { pending_kyc: 37, pending_reports: 12, open_tickets: 24, pending_deletions: 3 },
    growth,
    activity: [
      { kind: "admin", title: "admin@kalika.test · users.status.suspended", detail: "users profile", at: new Date().toISOString() },
      { kind: "signup", title: "New Farmer · Ramesh Yadav", detail: "ramesh@kalika.test", at: new Date(Date.now() - 3_600_000).toISOString() },
      { kind: "admin", title: "admin@kalika.test · content.video.hide", detail: "video_hub video", at: new Date(Date.now() - 7_200_000).toISOString() },
    ],
    services: { mandi: { configured: true, source: "data.gov.in" }, ai: { configured: false, model: null } },
  },
  "/users": { rows: users, total: 12480, page: 1, page_size: 25 },
  "/roles": {
    roles: [
      { key: "super_admin", label: "Super Admin", description: null, is_system: true, sort_order: 1 },
      { key: "admin", label: "Admin", description: null, is_system: true, sort_order: 2 },
      { key: "moderator", label: "Moderator", description: null, is_system: true, sort_order: 3 },
      { key: "support_manager", label: "Support Manager", description: null, is_system: true, sort_order: 4 },
      { key: "content_moderator", label: "Content Moderator", description: null, is_system: true, sort_order: 5 },
      { key: "finance_manager", label: "Finance Manager", description: null, is_system: true, sort_order: 6 },
      { key: "data_manager", label: "Data Manager", description: null, is_system: true, sort_order: 7 },
    ],
    permissions: [
      { key: "dashboard.view", module: "dashboard", label: "View dashboard", description: null, sensitive: false },
      { key: "users.view", module: "users", label: "View users", description: null, sensitive: false },
      { key: "users.moderate", module: "users", label: "Suspend / block users", description: null, sensitive: true },
      { key: "kyc.review", module: "kyc", label: "Approve / reject KYC", description: null, sensitive: true },
      { key: "content.moderate", module: "content", label: "Moderate content", description: null, sensitive: true },
      { key: "finance.refund", module: "finance", label: "Adjust transactions", description: null, sensitive: true },
      { key: "settings.manage", module: "settings", label: "Manage platform settings", description: null, sensitive: true },
    ],
    grants: {
      super_admin: ["dashboard.view", "users.view", "users.moderate", "kyc.review", "content.moderate", "finance.refund", "settings.manage"],
      admin: ["dashboard.view", "users.view", "users.moderate", "content.moderate", "settings.manage"],
      moderator: ["dashboard.view", "users.view", "content.moderate"],
      support_manager: ["dashboard.view", "users.view", "kyc.review"],
      content_moderator: ["dashboard.view", "content.moderate"],
      finance_manager: ["dashboard.view", "finance.refund"],
      data_manager: ["dashboard.view"],
    },
  },
  "/roles/admins": { rows: [] },
  "/kyc": {
    rows: [
      {
        id: "kyc-1",
        user_id: "user-0",
        account_type: "Farmer",
        document_type: "aadhaar",
        status: "pending",
        reason: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        applicant: { id: "user-0", full_name: "Ramesh Yadav", email: "ramesh@kalika.test", role: "Farmer" },
      },
    ],
    total: 37,
    page: 1,
    page_size: 25,
  },
  "/content/videos": {
    rows: [
      {
        id: "v-1",
        title: "Drip irrigation setup for tomato",
        status: "published",
        kind: "video",
        creator_id: "c-1",
        view_count: 14200,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_featured: true,
        is_hidden: false,
        creator: { channel_name: "Kheti Gyan", handle: "khetigyan" },
      },
      {
        id: "v-2",
        title: "Wheat sowing in 60 seconds",
        status: "review",
        kind: "short",
        creator_id: "c-2",
        view_count: 900,
        published_at: null,
        created_at: new Date().toISOString(),
        is_featured: false,
        is_hidden: true,
        creator: { channel_name: "Krishi Shorts", handle: "krishishorts" },
      },
    ],
    total: 860,
    page: 1,
    page_size: 25,
  },
  "/content/reports": {
    rows: [
      { id: "r-1", reason: "Misleading advisory", note: "Claims unverified pesticide dose", status: "open", video_id: "v-1", reporter_id: "user-2", created_at: new Date().toISOString() },
    ],
    total: 12,
    page: 1,
    page_size: 25,
  },
  "/content/comments": { rows: [], total: 0, page: 1, page_size: 25 },
  "/content/creators": {
    rows: [
      { id: "c-1", channel_name: "Kheti Gyan", handle: "khetigyan", subscriber_count: 18200, video_count: 64, total_views: 940000, is_verified: true, district: "Raipur", state: "Chhattisgarh" },
      { id: "c-2", channel_name: "Krishi Shorts", handle: "krishishorts", subscriber_count: 4200, video_count: 18, total_views: 96000, is_verified: false, district: "Bilaspur", state: "Chhattisgarh" },
    ],
    total: 540,
    page: 1,
    page_size: 25,
  },
  "/business/listings": {
    rows: [
      { id: "l-1", title: "Organic wheat — 500 kg", category: "grains", quantity_kg: 500, price_inr: 2450, unit: "quintal", district: "Raipur", state: "Chhattisgarh", status: "active", seller: { full_name: "Ramesh Yadav", email: "ramesh@kalika.test" } },
    ],
    total: 2860,
    page: 1,
    page_size: 25,
  },
  "/business/retailer-products": { rows: [], total: 0, page: 1, page_size: 25 },
  "/business/service-listings": {
    rows: [
      { id: "user-3", full_name: "Ajay Patel", email: "ajay@kalika.test", phone: "9876543210", role: "Worker", account_status: "active", availability: { state: "Chhattisgarh", district: "Raipur", vehicle_type: null } },
    ],
    total: 820,
    page: 1,
    page_size: 25,
  },
  "/business/connections": { rows: [], total: 0, page: 1, page_size: 25 },
  "/business/orders": {
    rows: [
      { id: "ord-1a2b3c4d", customer_name: "Ramesh Yadav", amount_inr: 2450, status: "delivered", created_at: new Date().toISOString() },
      { id: "ord-2b3c4d5e", customer_name: "Sunita Devi", amount_inr: 890, status: "pending", created_at: new Date().toISOString() },
    ],
    total: 4120,
    page: 1,
    page_size: 25,
  },
  "/agri/mandi/status": {
    configured: true,
    source: "data.gov.in",
    base_url: "https://api.data.gov.in",
    storage: { table: "mandi_prices", available: false, rows: null, last_at: null },
    note: "Prices are fetched live and cached in memory; no historical copy is stored.",
    generated_at: new Date().toISOString(),
  },
  "/agri/weather/status": {
    configured: false,
    provider: null,
    capability: "not_integrated",
    note: "Weather alerts are not yet backed by a provider integration on the API.",
  },
  "/ops/ai/status": {
    configured: false,
    provider: "openai-compatible",
    model: null,
    latency_ms: null,
    healthy: null,
    http_status: null,
    requests_recorded: null,
    last_request_at: null,
    checked_at: new Date().toISOString(),
  },
  "/system/analytics": {
    range: { start: growth[0].day, end: growth[growth.length - 1].day },
    users: { in_range: 964, by_role: { Farmer: 520, Buyer: 210, Retailer: 130, "Content Creator": 104 }, growth },
    content: { videos: 860, shorts: 1240, comments: 4210, views_total: 184320 },
    marketplace: { orders: 4120, sales_inr: 1240000 },
    note: "All figures are row counts from platform tables; there are no estimated values here.",
  },
  "/ops/support/tickets": {
    rows: [
      { id: "t-1", subject: "Order not delivered", category: "order", priority: "high", status: "open", contact_email: "sunita@kalika.test", assigned_to: null, created_at: new Date().toISOString() },
    ],
    total: 24,
    page: 1,
    page_size: 25,
  },
  "/ops/campaigns": {
    rows: [
      { id: "camp-1", title: "Kharif advisory is live", body: "Open the advisory tab for your district.", channel: "in_app", audience_roles: ["Farmer"], audience_states: ["Chhattisgarh"], status: "sent", scheduled_at: null, sent_at: new Date().toISOString(), recipient_count: 6120, created_at: new Date().toISOString() },
    ],
    total: 1,
    page: 1,
    page_size: 25,
  },
  "/ops/cms": { rows: [], total: 0, page: 1, page_size: 25 },
  "/ops/settings": {
    rows: [
      { key: "platform.name", value: "Kalika", category: "general", label: "Platform name", kind: "text", updated_at: new Date().toISOString() },
      { key: "platform.timezone", value: "Asia/Kolkata", category: "general", label: "Default timezone", kind: "text", updated_at: new Date().toISOString() },
      { key: "registration.approval", value: false, category: "registration", label: "Require admin approval", kind: "boolean", updated_at: new Date().toISOString() },
      { key: "integrations.weather_key", value: "••••••••", category: "integrations", label: "Weather API key", kind: "secret", updated_at: new Date().toISOString() },
    ],
  },
  "/ops/flags": {
    rows: [
      { key: "video_hub.live", description: "Show the live streaming row", enabled: false, updated_at: new Date().toISOString() },
      { key: "marketplace.new_ui", description: "Marketplace redesign", enabled: true, updated_at: new Date().toISOString() },
    ],
  },
  "/system/audit": {
    rows: [
      { id: 1, admin_email: "admin@kalika.test", admin_role: "super_admin", action: "users.status.suspended", module: "users", target_type: "profile", target_id: "user-4", reason: "Spam in marketplace listings", before_state: { account_status: "active" }, after_state: { account_status: "suspended" }, ip_address: "127.0.0.1", created_at: new Date().toISOString() },
    ],
    total: 1,
    page: 1,
    page_size: 25,
  },
  "/system/health": {
    checked_at: new Date().toISOString(),
    checks: { database: { ok: true, latency_ms: 12 }, admin_tables: { ok: true } },
    integrations: { mandi: { configured: true }, ai: { configured: false }, storage: { configured: true } },
    settings: { mfa_required: false, session_max_minutes: 480, rate_limit_per_minute: 240, environment: "qa" },
    backup: { status: "unknown", note: "Backups are managed by the database provider." },
  },
};

export async function adminFetch<T>(path: string, _init?: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  if (path in fixtures) return structuredClone(fixtures[path]) as T;
  return { rows: [], total: 0, page: 1, page_size: 25, ok: true } as T;
}

export async function adminDownload(): Promise<void> {
  /* no-op in the QA harness */
}
