import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Does a table actually exist in this Supabase project?
 *
 * Several farmer features (marketplace, community, rental, transport, storage)
 * read their data from tables created by `database/supabase/features.sql`. In a
 * project where that file was never run, PostgREST answers 404 / PGRST205
 * instead of an empty list — so the page would otherwise look "just empty" and
 * the farmer would never learn that a one-minute SQL step fixes it.
 *
 * Connection problems (offline, CORS) report `known: false` so a page never
 * claims a table is missing when it simply could not ask.
 */
export type SchemaCheck = {
  /** Table exists → true, definitely missing → false. */
  exists: boolean | null;
  /** The SQL file that creates it. */
  file: string;
  loading: boolean;
};

const MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST202", "PGRST204"]);
const MISSING_MESSAGE = /could not find the table|relation .* does not exist|schema cache/i;

/** Classify a PostgREST error: is it "table missing" or something else? */
export function isMissingTable(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code;
  if (code && MISSING_CODES.has(code)) return true;
  const message = (error as { message?: string }).message ?? "";
  return MISSING_MESSAGE.test(message);
}

/** Run the existence probe for one table. */
export async function tableExists(
  table: string
): Promise<{ exists: boolean | null; error: unknown }> {
  if (!supabase) return { exists: null, error: null };
  const { error } = await supabase.from(table).select("*", { head: true, count: "exact" }).limit(1);
  if (!error) return { exists: true, error: null };
  if (isMissingTable(error)) return { exists: false, error };
  // Permission / network / other: we simply do not know.
  return { exists: null, error };
}

export function useTableExists(table: string, file = "database/supabase/features.sql"): SchemaCheck {
  const [state, setState] = useState<{ exists: boolean | null; loading: boolean }>({
    exists: null,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    void tableExists(table).then(({ exists }) => {
      if (alive) setState({ exists, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [table]);

  return { exists: state.exists, file, loading: state.loading };
}
