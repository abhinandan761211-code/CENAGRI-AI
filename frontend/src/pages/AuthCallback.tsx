import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { USER_ROLES } from "@/types";

/**
 * Lands here after Google OAuth (and email confirmation links).
 * The Supabase client detects the session in the URL; we just wait for it
 * and then forward the user to the page they originally wanted.
 */
/** New Google users have no `role` yet — send them to the onboarding step. */
function destination(session: { user: { user_metadata?: Record<string, unknown> } }, fallback: string) {
  const role = session.user.user_metadata?.role;
  const hasRole = typeof role === "string" && (USER_ROLES as readonly string[]).includes(role);
  return hasRole ? fallback : "/complete-profile";
}

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const next = params.get("next") || params.get("redirect") || "/dashboard";
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    // Google / Supabase can return errors in the query string or the fragment.
    const errorDescription =
      params.get("error_description") ?? hashParams.get("error_description");
    if (errorDescription) {
      setError(errorDescription);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase is not configured for this build.");
      return;
    }

    let done = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !done) {
        done = true;
        navigate(destination(session, next), { replace: true });
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !done) {
        done = true;
        navigate(destination(data.session, next), { replace: true });
      }
    });

    const timeout = window.setTimeout(() => {
      if (!done) setError("Sign-in did not complete. Please try again.");
    }, 8000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate, params]);

  return (
    <div className="grid min-h-screen place-items-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-xl2 border border-slate-200 bg-white p-8 text-center shadow-card">
        {error ? (
          <>
            <h1 className="font-display text-lg font-bold text-forest">Sign-in failed</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Link to="/login" className="btn-primary mt-6 w-full">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-700" />
            <h1 className="mt-4 font-display text-lg font-bold text-forest">
              Finishing sign-in…
            </h1>
            <p className="mt-2 text-sm text-slate-500">This will only take a moment.</p>
          </>
        )}
      </div>
    </div>
  );
}
