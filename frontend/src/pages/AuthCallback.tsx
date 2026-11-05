import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useLang } from "@/i18n/LanguageContext";
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
  const { t } = useLang();
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
    // Never leave sooner than this: a fast redirect would otherwise flash the
    // screen for a few milliseconds and look like a glitch.
    const MIN_VISIBLE_MS = 700;
    const openedAt = Date.now();

    /** Hold this screen until the account is really connected, then leave. */
    function leave(session: { user: { user_metadata?: Record<string, unknown> } }) {
      if (done) return;
      done = true;
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - openedAt));
      window.setTimeout(() => navigate(destination(session, next), { replace: true }), wait);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) leave(session);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) leave(data.session);
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
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-700" aria-hidden="true" />
            <h1 className="mt-4 font-display text-lg font-bold text-forest">
              {t("auth.connecting")}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{t("auth.connectingBody")}</p>
            <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-600" />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">{t("auth.connectingHint")}</p>
          </>
        )}
      </div>
    </div>
  );
}
