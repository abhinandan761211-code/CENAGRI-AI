import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AdminApiError, adminFetch } from "@/lib/admin/api";
import type { AdminMe } from "@/lib/admin/api";

/**
 * Admin session state for the whole panel.
 *
 * `me` is the backend's answer to "who am I and what may I do" — it is fetched
 * once on mount and is the *only* source the UI filters on. If the backend says
 * no, no admin screen renders. The context deliberately offers no way to set a
 * permission locally: a screen that needs one asks `can(key)`.
 */

type AdminContextValue = {
  me: AdminMe | null;
  loading: boolean;
  error: string | null;
  can: (permission: string | string[]) => boolean;
  reload: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<AdminMe>("/roles/me");
      if (alive.current) setMe(data);
    } catch (err) {
      if (!alive.current) return;
      setMe(null);
      setError(
        err instanceof AdminApiError
          ? err.status === 403
            ? "This account does not have admin access."
            : err.message
          : "The admin service is unreachable."
      );
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  const can = useCallback(
    (permission: string | string[]) => {
      const held = me?.permissions ?? [];
      const needed = Array.isArray(permission) ? permission : [permission];
      // The backend still enforces every call; this only decides what to show.
      return needed.some((p) => held.includes(p));
    },
    [me]
  );

  const value = useMemo(() => ({ me, loading, error, can, reload }), [me, loading, error, can, reload]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminProvider>.");
  return ctx;
}

// ── generic async data hook ───────────────────────────────────────────────

type AsyncState<T> = { data: T | null; loading: boolean; error: string | null };

/**
 * Fetch on mount and whenever `deps` change. Kept in one place so every admin
 * screen shows loading / error / empty the same way.
 */
export function useAdminData<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> & {
  reload: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    alive.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loaderRef
      .current()
      .then((data) => {
        if (alive.current) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!alive.current) return;
        setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Failed to load." });
      });
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
