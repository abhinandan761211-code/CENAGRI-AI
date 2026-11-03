import type { LanguageCode } from "@/i18n/languages";

/**
 * Maps the app's language code to the language name the advisory API expects.
 * Hindi, Bengali and Odia are the farmer account's required three; the rest
 * fall back to English so the model never receives an unknown label.
 */
export function advisoryLanguage(code: LanguageCode | string): string {
  const map: Record<string, string> = {
    en: "English",
    hi: "Hindi",
    bn: "Bengali",
    or: "Odia",
    as: "Assamese",
    ta: "Tamil",
    te: "Telugu",
    mr: "Marathi",
    gu: "Gujarati",
    kn: "Kannada",
    ml: "Malayalam",
    pa: "Punjabi",
  };
  return map[code] ?? "English";
}
