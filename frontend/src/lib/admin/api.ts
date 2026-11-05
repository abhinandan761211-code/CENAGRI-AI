import { API_BASE_URL } from "@/lib/apiBase";
import { supabase } from "@/lib/supabase";

/**
 * Typed client for `/api/v1/admin`.
 *
 * The only thing this layer sends is the caller's Supabase access token. It
 * never sends a role or a permission and never decides what is allowed — the
 * backend re-derives the admin's role from the database on every request. The
 * UI reads `permissions` from `/admin/roles/me` purely to hide impossible
 * actions; a forged POST is refused server-side regardless.
 */

const BASE_URL = `${API_BASE_URL}/admin`;

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function token(): Promise<string> {
  if (!supabase) throw new AdminApiError("This build has no authentication configured.", 401);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AdminApiError("Your session could not be read. Sign in again.", 401);
  const value = data.session?.access_token;
  if (!value) throw new AdminApiError("Sign in to use the admin panel.", 401);
  return value;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit & { query?: Query } = {}
): Promise<T> {
  const { query, headers, ...rest } = init;
  const accessToken = await token();
  const res = await fetch(`${BASE_URL}${path}${qs(query)}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  // A 200 that is HTML is not our API — it is a proxy/CDN error page or the SPA
  // fallback (`<index.html>`) served because /api/* was not forwarded. Returning
  // it as `T` handed the dashboard an HTML string, `data.accounts` became
  // undefined, and the render crashed into a blank page with no message.
  if (res.ok && looksLikeHtml(text)) {
    throw new AdminApiError(
      "The admin API is not reachable from this site: /api is returning the app shell instead " +
        "of JSON. Check that the deployment proxies /api to the backend.",
      res.status
    );
  }

  if (!res.ok) {
    const detail =
      payload?.detail ||
      (res.status === 401
        ? "Your admin session has expired. Sign in again."
        : res.status === 403
          ? "Your admin role does not allow this action."
          : "The request failed. Try again.");
    throw new AdminApiError(detail, res.status);
  }
  return payload as T;
}

type ErrorBody = { detail?: string };

/** True for an HTML document or a plain-text proxy error, never for JSON. */
function looksLikeHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 40).toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("not found");
}

function safeJson(text: string): ErrorBody | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as ErrorBody) : null;
  } catch {
    return { detail: text.slice(0, 200) };
  }
}

/** Download a CSV produced by the API (exports are authorised server-side). */
export async function adminDownload(path: string, filename: string, query?: Query): Promise<void> {
  const accessToken = await token();
  const res = await fetch(`${BASE_URL}${path}${qs(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AdminApiError(safeJson(body)?.detail ?? "The export failed.", res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── shared shapes ─────────────────────────────────────────────────────────

export type Page<T> = { rows: T[]; total: number | null; page: number; page_size: number };

export type AdminMe = {
  user_id: string;
  email: string;
  role_key: string;
  role_label: string;
  permissions: string[];
  mfa: string;
};

export type DashboardData = {
  generated_at: string;
  users: {
    total: number | null;
    active: number | null;
    suspended: number | null;
    blocked: number | null;
    new_30d: number | null;
    dau: number | null;
    mau: number | null;
  };
  accounts: Record<string, number | null>;
  content: {
    posts: number | null;
    videos: number | null;
    shorts: number | null;
    published_videos: number | null;
    views_30d: number | null;
  };
  marketplace: { products: number | null; orders: number | null };
  queues: {
    pending_kyc: number | null;
    pending_reports: number | null;
    open_tickets: number | null;
    pending_deletions: number | null;
  };
  growth: { day: string; count: number }[] | null;
  activity: { kind: string; title: string; detail: string | null; at: string }[];
  services: { mandi: { configured: boolean; source: string }; ai: { configured: boolean; model: string | null } };
};

export type AdminUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  account_status: "active" | "pending" | "suspended" | "blocked";
  status_reason: string | null;
  created_at: string;
  last_active_at: string | null;
  avatar_url: string | null;
  location: { state: string | null; district: string | null; village: string | null };
};

export type RoleMatrix = {
  roles: { key: string; label: string; description: string | null; is_system: boolean; sort_order: number }[];
  permissions: { key: string; module: string; label: string; description: string | null; sensitive: boolean }[];
  grants: Record<string, string[]>;
};
