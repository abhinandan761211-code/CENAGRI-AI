/**
 * One answer to "where is the backend?" for every API client.
 *
 * The bug this exists to prevent: `VITE_API_BASE_URL` is inlined at BUILD time.
 * A `.env` that points at `http://localhost:8000` therefore ships that literal
 * URL to production, and every request from the deployed site tries to reach
 * the visitor's own machine — the admin panel then reports "unreachable" even
 * though the visitor is signed in and the backend is healthy.
 *
 * Rules:
 *  • In a dev build, a configured URL is used (the Vite proxy also works).
 *  • In a production build, a loopback/private-host URL is ignored and the
 *    same-origin `/api/v1` is used instead, so a bad `.env` degrades to a
 *    working path behind the CDN rewrite rather than a dead link.
 *  • A valid absolute https URL is honoured, so a separately hosted API still
 *    works without a proxy.
 */

const DEFAULT_API_ROOT = "/api/v1";

/** Hosts that only ever exist on the developer's own machine. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

function isLocalUrl(value: string): boolean {
  try {
    // Relative paths ("/api/v1") are not URLs — they are already local.
    const url = new URL(value, "http://placeholder.invalid");
    return LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith(".local");
  } catch {
    return false;
  }
}

function resolveApiRoot(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

  // A relative path is always safe: it follows whatever origin served the app.
  const isRelative = !!configured && configured.startsWith("/");

  if (configured && (import.meta.env.DEV || isRelative || !isLocalUrl(configured))) {
    return configured.replace(/\/+$/, "");
  }

  return DEFAULT_API_ROOT;
}

/**
 * The API root, without a trailing slash. e.g. "/api/v1" or
 * "https://api.example.com/api/v1".
 */
export const API_BASE_URL = resolveApiRoot();

/** Absolute URL for a path under the API root. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
