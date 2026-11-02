import { AlertTriangle } from "lucide-react";

/**
 * Shown when a feature page learns that its tables are missing from the
 * Supabase project. Without this the page looks simply "empty", and the farmer
 * has no way to know that a one-time SQL step is what makes it work.
 */
export function SchemaBanner({
  file,
  tables,
}: {
  /** SQL file that creates the tables, e.g. database/supabase/features.sql */
  file: string;
  /** Human readable table names, e.g. ["listings", "orders"] */
  tables: string[];
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3"
    >
      <p className="flex items-center gap-2 text-xs font-bold text-rose-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        This feature is not set up in your database yet
      </p>
      <p className="mt-1 text-xs leading-relaxed text-rose-800">
        The {tables.map((t) => `\`${t}\``).join(" and ")} table
        {tables.length > 1 ? "s are" : " is"} missing from your Supabase project,
        so nothing can be saved or shown here. Open the Supabase dashboard →
        <span className="font-semibold"> SQL Editor</span>, paste the contents of{" "}
        <code className="rounded bg-white/70 px-1 py-0.5 font-semibold">{file}</code>{" "}
        and run it, then reload this page.
      </p>
    </div>
  );
}
