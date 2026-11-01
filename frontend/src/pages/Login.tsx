import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import SocialButtons from "@/components/auth/SocialButtons";
import TextField from "@/components/auth/TextField";
import { useAuth } from "@/hooks/useAuth";

type Errors = Partial<Record<"email" | "password", string>>;

export default function Login() {
  const [errors, setErrors] = useState<Errors>({});
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("redirect") || params.get("next") || "/dashboard";

  /**
   * Signed in AND the current account's profile has landed. Without the
   * `profile` condition we would route to the dashboard while it still holds
   * the previous account's data, which is exactly how account B used to open
   * showing account A's details.
   */
  const ready = Boolean(user) && !authLoading && profile?.id === user?.id;

  useEffect(() => {
    if (ready) navigate(next, { replace: true });
  }, [ready, next, navigate]);

  useEffect(() => {
    if (params.get("error") === "auth") {
      setFormError("That sign-in link is invalid or has expired. Please try again.");
    }
  }, [params]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();

    const nextErrors: Errors = {};
    if (!email) nextErrors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = "That doesn't look like a valid email.";
    if (!password) nextErrors.password = "Enter your password.";

    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      await signInWithEmail(email, password);
      // Navigation happens in the effect above once the new profile is loaded.
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Sign-in failed. Please check your details."
      );
      setLoading(false);
      return;
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
        Welcome back
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Sign in to see today&apos;s advisory and market rates for your fields.
      </p>

      <div className="mt-7">
        <SocialButtons action="Sign in" onError={setFormError} />

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            or continue with email
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextField
            label="Email address"
            name="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="name@farm.com"
            error={errors.email}
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            icon={Lock}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />

          <div className="flex items-center justify-between gap-3 pt-1">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="remember"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
              />
              Remember me
            </label>
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-2 h-11 w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>



          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{formError}</p>
            </div>
          )}
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">
          New to CenAGRI-AI?{" "}
          <Link to="/signup" className="font-semibold text-brand-700 hover:underline">
            Create a free account
          </Link>
        </p>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
          Protected by encrypted transmission. By signing in you agree to our{" "}
          <a href="#terms" className="underline hover:text-slate-600">
            Terms
          </a>{" "}
          and{" "}
          <a href="#privacy" className="underline hover:text-slate-600">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </AuthLayout>
  );
}
