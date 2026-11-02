/**
 * The languages the public pages (landing, sign-in, sign-up) can be read in.
 *
 * All 22 scheduled languages of India are listed so nobody is left out of the
 * picker. Translation files exist for the languages below; a language without a
 * file falls back to English at runtime instead of showing blanks. Adding a
 * language is two steps: add its code here and add `src/i18n/locales/<code>.ts`.
 */
export const LANGUAGES = [
  { code: "en", native: "English", english: "English", dir: "ltr" },
  { code: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "bn", native: "বাংলা", english: "Bengali", dir: "ltr" },
  { code: "as", native: "অসমীয়া", english: "Assamese", dir: "ltr" },
  { code: "doi", native: "डोगरी", english: "Dogri", dir: "ltr" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati", dir: "ltr" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada", dir: "ltr" },
  { code: "ks", native: "کٲشُر", english: "Kashmiri", dir: "rtl" },
  { code: "kok", native: "कोंकणी", english: "Konkani", dir: "ltr" },
  { code: "mai", native: "मैथिली", english: "Maithili", dir: "ltr" },
  { code: "ml", native: "മലയാളം", english: "Malayalam", dir: "ltr" },
  { code: "mni", native: "মৈতৈলোন্", english: "Manipuri", dir: "ltr" },
  { code: "mr", native: "मराठी", english: "Marathi", dir: "ltr" },
  { code: "ne", native: "नेपाली", english: "Nepali", dir: "ltr" },
  { code: "or", native: "ଓଡ଼ିଆ", english: "Odia", dir: "ltr" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi", dir: "ltr" },
  { code: "sa", native: "संस्कृतम्", english: "Sanskrit", dir: "ltr" },
  { code: "sat", native: "ᱥᱟᱱᱛᱟᱲᱤ", english: "Santali", dir: "ltr" },
  { code: "sd", native: "سنڌي", english: "Sindhi", dir: "rtl" },
  { code: "ta", native: "தமிழ்", english: "Tamil", dir: "ltr" },
  { code: "te", native: "తెలుగు", english: "Telugu", dir: "ltr" },
  { code: "ur", native: "اردو", english: "Urdu", dir: "rtl" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** Codes that have a real translation file today. */
export const TRANSLATED: ReadonlySet<string> = new Set([
  "en",
  "hi",
  "bn",
  "ta",
  "te",
  "mr",
  "gu",
  "kn",
  "ml",
  "pa",
  "or",
  "as",
  "ur",
]);

/** The few languages shown as quick chips in the picker, before "More". */
export const QUICK_LANGUAGES: LanguageCode[] = ["en", "hi", "bn", "ta", "te"];

export const LANGUAGE_STORAGE_KEY = "cenagri.lang";

export function normalizeLanguage(value: string | null | undefined): LanguageCode {
  if (!value) return "en";
  const lower = value.toLowerCase();
  const exact = LANGUAGES.find((l) => l.code === lower);
  if (exact) return exact.code;
  const base = lower.split("-")[0];
  const byBase = LANGUAGES.find((l) => l.code === base);
  return byBase ? byBase.code : "en";
}

/** The visitor's own language, when the browser knows one we carry. */
export function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === "undefined") return "en";
  const list = [...(navigator.languages ?? []), navigator.language];
  for (const entry of list) {
    const code = normalizeLanguage(entry);
    if (code !== "en" && TRANSLATED.has(code)) return code;
  }
  return "en";
}

/**
 * Font stack per script. The base Inter/Poppins faces have no Indic glyphs, and
 * a browser that falls back to a system font per glyph renders a whole sentence
 * at three different sizes. Naming one family first keeps the page even.
 */
export function scriptFontStack(code: string): string | null {
  switch (code) {
    case "hi":
    case "mr":
    case "doi":
    case "kok":
    case "mai":
    case "ne":
    case "sa":
      return '"Noto Sans Devanagari", "Nirmala UI", "Kohinoor Devanagari", sans-serif';
    case "bn":
    case "as":
      return '"Noto Sans Bengali", "Nirmala UI", "Kohinoor Bangla", sans-serif';
    case "ta":
      return '"Noto Sans Tamil", "Nirmala UI", sans-serif';
    case "te":
      return '"Noto Sans Telugu", "Nirmala UI", sans-serif';
    case "gu":
      return '"Noto Sans Gujarati", "Nirmala UI", sans-serif';
    case "kn":
      return '"Noto Sans Kannada", "Nirmala UI", sans-serif';
    case "ml":
      return '"Noto Sans Malayalam", "Nirmala UI", sans-serif';
    case "pa":
      return '"Noto Sans Gurmukhi", "Nirmala UI", sans-serif';
    case "or":
      return '"Noto Sans Oriya", "Nirmala UI", sans-serif';
    case "ur":
    case "ks":
    case "sd":
      return '"Noto Nastaliq Urdu", "Noto Naskh Arabic", "Geeza Pro", serif';
    case "sat":
    case "mni":
      return '"Noto Sans Ol Chiki", "Noto Sans Meetei Mayek", "Nirmala UI", sans-serif';
    default:
      return null;
  }
}
