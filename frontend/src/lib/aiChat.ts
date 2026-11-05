import { supabase } from "@/lib/supabase";
import type { LanguageCode } from "@/i18n/languages";
import { toProviderCode } from "@/i18n/capabilities";

/**
 * Multilingual AI client.
 *
 * Talks to CenAGRI's own FastAPI backend (`/api/v1/ai/*`), which forwards the
 * question to the Multi Model AI Assistant. The browser never calls the
 * assistant directly: that would mean shipping its key to the client and
 * letting anybody bypass rate limits.
 *
 * The original question is sent exactly as typed. Nothing here translates it
 * before sending — the pipeline needs the local crop names, numbers and units
 * intact to retrieve the right agriculture evidence.
 *
 * Provider tags (e.g. `od-IN`) never appear here; the backend maps them.
 */

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1").replace(/\/$/, "");

export class AiUnavailable extends Error {
  constructor(message = "The AI assistant is not available right now.") {
    super(message);
    this.name = "AiUnavailable";
  }
}

export type ChatContext = {
  /** Verified server-side; sending it here is only a hint for the prompt. */
  account_type?: string;
  crop?: string;
  state?: string;
  district?: string;
  extra?: Record<string, string>;
};

export type ChatReply = {
  requestId: string;
  answer: string;
  detectedLanguage: LanguageCode;
  responseLanguage: LanguageCode;
  /** False when the answer came back in a different language than requested. */
  languageHonoured: boolean;
  conversationId: string | null;
  intent: string | null;
  model: string | null;
  sources: { title?: string; url?: string; snippet?: string }[];
  lowConfidence: boolean;
  translationUsed: boolean;
};

export type TranslateReply = {
  requestId: string;
  original: string;
  translated: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  /** False when no provider could translate — show the original, not this text. */
  ok: boolean;
  cached: boolean;
  provider: string | null;
};

export type AiLanguageRow = {
  code: LanguageCode;
  name: string;
  ui: boolean;
  chat: boolean;
  translation: boolean;
  stt: boolean;
  tts: boolean;
  ocr: boolean;
  retrieval: boolean;
};

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) throw new AiUnavailable("Sign in to use the AI assistant.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiUnavailable("Your session has expired. Sign in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  let res: Response;
  try {
    res = await fetch(`${BASE}/ai${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  } catch {
    throw new AiUnavailable("Could not reach the Kalika server. Check your connection.");
  }
  if (!res.ok) {
    let detail = res.status === 503 ? "The AI assistant is temporarily unavailable. Please try again." : `The server returned ${res.status}.`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* keep the generic message */
    }
    throw new AiUnavailable(detail);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

type RawChat = {
  request_id: string;
  answer: string;
  detected_language: LanguageCode;
  response_language: LanguageCode;
  language_honoured: boolean;
  conversation_id: string | null;
  intent: string | null;
  model: string | null;
  sources: { title?: string; url?: string; snippet?: string }[];
  low_confidence: boolean;
  translation_used: boolean;
};

/** Ask a question in any supported language and get the answer in `responseLanguage`. */
export async function askAssistant(params: {
  message: string;
  responseLanguage: LanguageCode;
  detectedLanguage?: LanguageCode;
  conversationId?: string | null;
  context?: ChatContext;
}): Promise<ChatReply> {
  const body = await request<RawChat>("/chat", {
    method: "POST",
    body: JSON.stringify({
      message: params.message,
      response_language: params.responseLanguage,
      detected_language: params.detectedLanguage ?? null,
      conversation_id: params.conversationId ?? null,
      context: params.context ?? {},
    }),
  });
  return {
    requestId: body.request_id,
    answer: body.answer,
    detectedLanguage: body.detected_language,
    responseLanguage: body.response_language,
    languageHonoured: body.language_honoured,
    conversationId: body.conversation_id,
    intent: body.intent,
    model: body.model,
    sources: body.sources ?? [],
    lowConfidence: body.low_confidence,
    translationUsed: body.translation_used,
  };
}

type RawTranslate = {
  request_id: string;
  original: string;
  translated: string;
  source_language: LanguageCode;
  target_language: LanguageCode;
  ok: boolean;
  cached: boolean;
  provider: string | null;
};

/**
 * Translate one piece of user-generated content on request.
 *
 * Only call this from a "Translate" action the user pressed — never on render
 * and never in a list loop. The backend caches repeats, but a page of posts
 * would still be a page of calls on first view.
 */
export async function translateContent(params: {
  text: string;
  target: LanguageCode;
  source?: LanguageCode;
  scope?: "post" | "comment" | "product" | "video" | "group" | "market" | "other";
}): Promise<TranslateReply> {
  const body = await request<RawTranslate>("/translate", {
    method: "POST",
    body: JSON.stringify({
      text: params.text,
      target: params.target,
      source: params.source ?? null,
      scope: params.scope ?? "other",
    }),
  });
  return {
    requestId: body.request_id,
    original: body.original,
    translated: body.translated,
    sourceLanguage: body.source_language,
    targetLanguage: body.target_language,
    ok: body.ok,
    cached: body.cached,
    provider: body.provider,
  };
}

/** What the backend can actually do per language. Cached for the session. */
let matrixCache: AiLanguageRow[] | null = null;

export async function languageMatrix(): Promise<AiLanguageRow[]> {
  if (matrixCache) return matrixCache;
  try {
    matrixCache = await request<AiLanguageRow[]>("/languages");
    return matrixCache;
  } catch {
    return [];
  }
}

/** Exposed for tests and for showing a provider tag in a debug panel only. */
export { toProviderCode };
