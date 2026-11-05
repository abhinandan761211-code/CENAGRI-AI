import type { LanguageCode } from "./languages";

/**
 * Language capability matrix.
 *
 * A language is NOT "supported" just because it appears in the picker. Each
 * capability below is tracked separately and is only marked `true` once that
 * specific path has been tested for that language:
 *
 *   ui          — prebuilt, human-reviewed interface strings
 *   chat        — the AI pipeline can understand the question and answer in it
 *   translation — free text can be translated to/from it on request
 *   stt         — speech-to-text produces a usable transcript
 *   tts         — text-to-speech reads an answer aloud
 *   ocr         — documents / labels / crop photos can be read from it
 *   retrieval   — the agriculture knowledge base returns sources in it
 *
 * Adding a language means adding a row here AND its locale file; the UI, the
 * API and the docs all read from this one table instead of each keeping a list.
 */
export type LanguageCapability = {
  ui: boolean;
  chat: boolean;
  translation: boolean;
  stt: boolean;
  tts: boolean;
  ocr: boolean;
  retrieval: boolean;
};

/** Capabilities that must all hold before a language is called "fully supported". */
export const CORE_CAPABILITIES: (keyof LanguageCapability)[] = ["ui", "chat", "translation", "retrieval"];

export const CAPABILITY_LABELS: Record<keyof LanguageCapability, string> = {
  ui: "Interface",
  chat: "AI chat",
  translation: "Translation",
  stt: "Speech to text",
  tts: "Read aloud",
  ocr: "Document OCR",
  retrieval: "Source retrieval",
};

/**
 * Status is deliberately conservative. English is the reference implementation;
 * Hindi, Odia and Bengali have complete interface strings and go through the
 * multilingual AI pipeline. Voice and OCR are marked off until the provider has
 * been tested per language — they are not inferred from chat support.
 */
export const LANGUAGE_CAPABILITIES: Record<LanguageCode, LanguageCapability> = {
  en: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: true, retrieval: true },
  hi: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: true, retrieval: true },
  bn: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: true, retrieval: true },
  or: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: true, retrieval: true },
  // Listed in the picker, but the interface falls back to English until a
  // reviewed dictionary exists for them.
  // The account pages (`/account/*`) are translated for these languages, so the
  // interface capability is on. OCR and retrieval stay off until those paths are
  // tested per language — they are not inferred from chat support.
  ta: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  te: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  mr: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  gu: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  kn: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  ml: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  pa: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  as: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  ur: { ui: true, chat: true, translation: true, stt: false, tts: false, ocr: false, retrieval: false },
  // Listed in the picker; the AI coverage for these is decided by the assistant
  // service, not assumed here, so they start with everything off.
  doi: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  ks: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  kok: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  mai: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  mni: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  ne: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  sa: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  sat: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
  sd: { ui: false, chat: false, translation: false, stt: false, tts: false, ocr: false, retrieval: false },
};

/** Languages with a reviewed interface dictionary. */
export function hasUi(lang: LanguageCode): boolean {
  return LANGUAGE_CAPABILITIES[lang]?.ui ?? false;
}

/**
 * Languages the product ships with tested support: interface + AI + retrieval.
 * This is the list the selector highlights; everything else is honest about
 * being AI-only or a fallback.
 */
export const SUPPORTED_LANGUAGE_CODES: LanguageCode[] = (["en", "hi", "bn", "or"] as LanguageCode[]).filter((code) =>
  CORE_CAPABILITIES.every((capability) => LANGUAGE_CAPABILITIES[code]?.[capability])
);

/** True when the AI can answer in this language (chat capability). */
export function supportsAi(lang: LanguageCode): boolean {
  return hasCapability(lang, "chat");
}

export function hasCapability(lang: LanguageCode, capability: keyof LanguageCapability): boolean {
  return LANGUAGE_CAPABILITIES[lang]?.[capability] ?? false;
}

/** True only when every core capability is available for that language. */
export function isFullySupported(lang: LanguageCode): boolean {
  return CORE_CAPABILITIES.every((capability) => hasCapability(lang, capability));
}

export function missingCapabilities(lang: LanguageCode): (keyof LanguageCapability)[] {
  return CORE_CAPABILITIES.filter((capability) => !hasCapability(lang, capability));
}

/**
 * Provider language codes.
 *
 * Internal codes are always the app's own (`or` for Odia, never `od-IN`). Some
 * providers expect a different tag, so the mapping lives here and nowhere else.
 * A provider adapter asks this module; it never hard-codes a tag.
 */
export type ProviderId = "internal" | "sarvam" | "bhashini" | "azure" | "google";

const PROVIDER_CODES: Record<ProviderId, Partial<Record<LanguageCode, string>>> = {
  // Same tag as the app.
  internal: {},
  // Sarvam uses `od-IN` for Odia (its older value), not the BCP-47 `or-IN`.
  sarvam: { or: "od-IN", hi: "hi-IN", bn: "bn-IN", en: "en-IN", ta: "ta-IN", te: "te-IN", kn: "kn-IN", ml: "ml-IN", mr: "mr-IN", gu: "gu-IN", pa: "pa-IN" },
  bhashini: { or: "or", hi: "hi", bn: "bn", en: "en" },
  azure: { or: "or-IN", hi: "hi-IN", bn: "bn-IN", en: "en-IN", ta: "ta-IN", te: "te-IN", kn: "kn-IN", ml: "ml-IN", mr: "mr-IN", gu: "gu-IN", pa: "pa-IN", ur: "ur-IN" },
  google: { or: "or", hi: "hi", bn: "bn", en: "en", ta: "ta", te: "te", kn: "kn", ml: "ml", mr: "mr", gu: "gu", pa: "pa", ur: "ur" },
};

const ALL_CODES = new Set<string>(Object.keys(LANGUAGE_CAPABILITIES));

/** Map an app language code to the tag a provider expects. */
export function toProviderCode(lang: LanguageCode, provider: ProviderId = "internal"): string {
  if (provider === "internal") return lang;
  return PROVIDER_CODES[provider][lang] ?? `${lang}-IN`;
}

/** Map a provider tag back to the app's own code (e.g. `od-IN` → `or`). */
export function fromProviderCode(code: string, provider: ProviderId = "internal"): LanguageCode | null {
  const base = code.trim().toLowerCase();
  if (ALL_CODES.has(base)) return base as LanguageCode;
  const primary = base.split(/[-_]/)[0];
  if (ALL_CODES.has(primary)) return primary as LanguageCode;
  if (provider === "sarvam" && base === "od-in") return "or";
  return null;
}

/** How a language is presented anywhere in the product. */
export function nativeName(lang: LanguageCode, languages: { code: string; native: string }[]): string {
  return languages.find((l) => l.code === lang)?.native ?? lang;
}
