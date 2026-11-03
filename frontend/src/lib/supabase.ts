import { createClient } from "@supabase/supabase-js";

import { createClient as createFakeClient } from "@/lib/qaFakeSupabase";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Points the app at an in-memory fake instead of a real project.
 *
 * Two ways in, both off in a normal build:
 *   • `VITE_QA_FAKE_SUPABASE=1` — QA runs of the whole farmer account
 *   • `?qa=1` in the URL        — opt a single browser session into the fixture
 *
 * The fake never reaches the network and holds no real data.
 */
function useFakeClient(): boolean {
  if (import.meta.env.VITE_QA_FAKE_SUPABASE === "1") return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("qa") === "1";
}

/**
 * `null` when the project is built without Supabase credentials (e.g. a plain
 * preview deploy). Screens then show a friendly "not configured" notice instead
 * of crashing the whole app.
 */
export const supabase =
  useFakeClient()
    ? (
      createFakeClient("http://qa.local", "qa-anon-key", {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
      }) as unknown as ReturnType<typeof createClient>
    )
    : url && anonKey
      ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
      : null;

export const isSupabaseConfigured = supabase !== null;
