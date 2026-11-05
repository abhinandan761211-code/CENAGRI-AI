import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, LogOut, ShieldX } from "lucide-react";
import { AdminProvider, useAdmin } from "@/components/admin/AdminProvider";
import { useAuth } from "@/hooks/useAuth";
import { FOREST } from "@/components/admin/ui";

/**
 * Gate for `/admin/*`.
 *
 * Two checks, in this order:
 *   1. signed in through the normal Supabase session (reuses ProtectedRoute's
 *      rules — no second login system);
 *   2. holds an active admin role, as decided by the backend, not by the page.
 *
 * This is convenience: every admin API call is independently authorised. If a
 * normal user edited this file out of the bundle, the API would still answer
 * 403 to everything.
 */
export default function AdminGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading, configured, signOut } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F8FAFC]">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!configured || !user || profile?.id !== user.id) {
    return <SignedOut />;
  }

  return (
    <AdminProvider>
      <AdminShellGate onSignOut={() => void signOut()}>{children}</AdminShellGate>
    </AdminProvider>
  );
}

function AdminShellGate({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { me, loading, error, reload } = useAdmin();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F8FAFC]">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !me) {
    const forbidden = error?.toLowerCase().includes("admin access");
    return (
      <div className="grid min-h-screen place-items-center bg-[#F8FAFC] px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
            <ShieldX className="h-6 w-6" />
          </span>
          <h1 className="mt-3 font-display text-lg font-bold" style={{ color: FOREST }}>
            {forbidden ? "Admin access required" : "Could not open the admin panel"}
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {error ?? "This account does not have admin access."}
            {forbidden && (
              <>
                {" "}
                Ask a Super Admin to add your account in <code>admin_users</code> with the role you need.
              </>
            )}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Try again
            </button>
            <Link
              to="/"
              className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Back to Kalika
            </Link>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function SignedOut() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="font-display text-lg font-bold" style={{ color: FOREST }}>
          Sign in to the admin panel
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          The admin panel uses your normal Kalika account. Sign in, then reopen this page.
        </p>
        <Link
          to={`/login?redirect=${encodeURIComponent("/admin")}`}
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
