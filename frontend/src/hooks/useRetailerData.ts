import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { describeRetailerError } from "@/lib/retailer";

export type LoadState = "loading" | "ready" | "error";

/**
 * Loads one retailer query and exposes loading / ready / error explicitly, so
 * no screen has to silently show fake numbers when a table is missing.
 *
 * `reload` re-runs the loader (after an insert/update), `setData` lets a screen
 * patch its list optimistically once the server confirms the write.
 */
export function useRetailerData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    setState((prev) => (prev === "ready" ? prev : "loading"));
    setError("");
    try {
      setData(await run());
      setState("ready");
    } catch (err) {
      setState("error");
      setError(describeRetailerError(err));
    }
  }, [run]);

  useEffect(() => {
    if (user) void reload();
  }, [user, reload]);

  return { data, setData, state, error, reload };
}
