import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, Lock } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import TextField from "@/components/auth/TextField";
import PasswordStrength from "@/components/auth/PasswordStrength";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

/**
 * Supabase sends the user here with a recovery token. The client exchanges it
 * for a temporary session automatically (detectSessionInUrl), after which the
 * user can set a new password.
 */
export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const type = hash.get("type");
    // Older links put `type=recovery` in the hash; newer PKCE links send `?code=`.
    const query = new URLSearchParams(window.location.search);
    if (type === "recovery" || query.has("code")) {
      setReady(true);
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => setReady(Boolean(data.session)))
      .catch(() => setReady(false));

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setFieldError("Use at least 8 characters.");
    setFieldError("");

    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      window.setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update your password. Request a new reset link."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
        Choose a new password
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Pick something strong — you&apos;ll use it to sign in from now on.
      </p>

      {done ? (
        <div
          role="status"
          className="mt-7 flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Password updated. Taking you to sign in…</p>
        </div>
      ) : !ready ? (
        <div
          role="alert"
          className="mt-7 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This reset link is invalid or expired.{" "}
            <a href="/forgot-password" className="font-semibold underline">
              Request a new one
            </a>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
          <div>
            <TextField
              label="New password"
              name="password"
              type="password"
              icon={Lock}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldError}
            />
            <PasswordStrength value={password} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary h-11 w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              "Update password"
            )}
          </button>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
