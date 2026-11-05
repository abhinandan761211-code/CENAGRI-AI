import { API_BASE_URL as BASE_URL } from "@/lib/apiBase";

/** Error carrying the backend's HTTP status and human-readable `detail`. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Pull `{"detail": "..."}` out of a FastAPI error body, with a sane fallback. */
async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { detail?: unknown; message?: unknown };
    const detail = body.detail ?? body.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return text.trim() || `Request failed with status ${res.status}.`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
  return res.json() as Promise<T>;
}
