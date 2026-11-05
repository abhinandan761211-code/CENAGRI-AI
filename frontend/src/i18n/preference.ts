import { supabase } from "@/lib/supabase";
import { isMissingPreferredLanguage } from "@/lib/profile";
import { LANGUAGE_STORAGE_KEY, normalizeLanguage } from "./languages";
import type { LanguageCode } from "./languages";

/**
 * Where the chosen language lives.
 *
 * Three layers, in priority order:
 *
 *   1. `profiles.preferred_language` — the account's own choice. Wins on any
 *      device, and survives clearing the browser.
 *   2. `localStorage` — so a guest, or the split second before the profile
 *      loads, still shows the last language instead of flashing English.
 *   3. Browser detection — ONLY the initial default, when neither of the above
 *      exists. It must never overwrite a saved choice on login.
 *
 * This module is the single place that writes the preference. The Language
 * selector, the account settings and the AI screens all go through it, so no
 * dashboard needs its own copy of the logic.
 */

/** Languages a user may save. Extend here when a new dictionary ships. */
export const SUPPORTED_LANGUAGES: LanguageCode[] = ["en", "hi", "bn", "or"];

export function isSupportedLanguage(code: unknown): code is LanguageCode {
  return typeof code === "string" && SUPPORTED_LANGUAGES.includes(normalizeLanguage(code));
}

/** Read the locally remembered choice (may be absent for a first visit). */
export function readLocalLanguage(): LanguageCode | null {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved ? normalizeLanguage(saved) : null;
  } catch {
    return null;
  }
}

/** Remember locally so the next page load does not flash English. */
export function writeLocalLanguage(code: LanguageCode): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* private mode — the choice simply will not persist on this device */
  }
}

/**
 * The account's saved language, if it has one.
 *
 * Returns null when the column does not exist yet (the migration has not been
 * run in this project), so the app falls back to the device choice rather than
 * failing. Never throws.
 */
export async function loadPreferredLanguage(userId: string | null | undefined): Promise<LanguageCode | null> {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingPreferredLanguage(error)) return null;
      return null;
    }
    const value = (data as { preferred_language?: string | null } | null)?.preferred_language;
    if (!value) return null;
    const code = normalizeLanguage(value);
    return SUPPORTED_LANGUAGES.includes(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Save the account's language.
 *
 * Silent on failure by design: the UI has already switched, and language is a
 * preference, not a transaction — a network blip must not show an error over a
 * button the user just pressed. Returns true when it reached the database.
 */
export async function savePreferredLanguage(userId: string | null | undefined, code: LanguageCode): Promise<boolean> {
  // The device copy is always written; it is what a reload reads first.
  writeLocalLanguage(code);
  if (!supabase || !userId) return false;
  try {
    const { error } = await supabase.from("profiles").update({ preferred_language: code }).eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * The signed-in user's id, or null.
 *
 * Read straight from the Supabase client instead of `hooks/useAuth`: the
 * language provider wraps `<AuthProvider>` in the tree, so importing the auth
 * hook here would create a cycle — and a cycle between those two modules
 * leaves one of them undefined at import time, which unmounts the whole app
 * (the blank page that followed this change).
 */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * What language to START with, before the profile has loaded.
 *
 * A saved profile value is not known yet, so the device copy comes first and
 * browser detection is used only when nothing has ever been chosen.
 */
export function initialLanguage(browserDetected: LanguageCode): LanguageCode {
  return readLocalLanguage() ?? browserDetected;
}
