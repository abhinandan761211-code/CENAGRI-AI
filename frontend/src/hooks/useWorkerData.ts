import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { describeWorkerError } from "@/lib/worker";

export type WorkerLoadState = "loading" | "ready" | "error";

/**
 * Loads one query and exposes loading / ready / error explicitly, so no screen
 * silently shows invented numbers when a table is missing.
 *
 * Shared by the worker and employer sides of the module — pass `describe` when
 * the setup advice differs (e.g. “run employer.sql” vs “run worker.sql”).
 */
export function useWorkerData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  describe: (err: unknown) => string = describeWorkerError
) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<WorkerLoadState>("loading");
  const [error, setError] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    // Keep showing the old list while refreshing, so a write does not blink
    // the whole page back to a spinner.
    setState((prev) => (prev === "ready" ? prev : "loading"));
    setError("");
    try {
      setData(await run());
      setState("ready");
    } catch (err) {
      setState("error");
      setError(describe(err));
    }
  }, [run, describe]);

  useEffect(() => {
    if (user) void reload();
  }, [user, reload]);

  return { data, setData, state, error, reload };
}
