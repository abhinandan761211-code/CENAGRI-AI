import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import SigningInOverlay from "@/components/auth/SigningInOverlay";
import SocialButtons from "@/components/auth/SocialButtons";
import TextField from "@/components/auth/TextField";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";

type Errors = Partial<Record<"email" | "password", string>>;

/** Only an in-app absolute path is a valid post-login destination. */
function isSafePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export default function Login() {
  const [errors, setErrors] = useState<Errors>({});
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, user, profile, loading: authLoading } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /*
   * Where to go after signing in.
   *
   * An explicit deep link is passed through, but the default is `/home`.
   * It used to be `/dashboard`, which meant `/dashboard?redirect=/my-farm`:
   * the dashboard then redirected straight back to /my-farm, and the two rules
   * (dashboard redirects by role, login redirects by `?redirect=`) kept
   * undoing each other — an account bounced between two screens, or opened a
   * screen that was not its own. `/home` is the one role-aware landing
   * (`RoleHome`), and nothing here knows the role, so nothing here guesses.
   */
  const asked = params.get("redirect") || params.get("next");
  const next = asked && isSafePath(asked) ? asked : "/home";

  /**
   * Signed in AND the current account's profile has landed. Without the
   * `profile` condition we would route to the dashboard while it still holds
   * the previous account's data, which is exactly how account B used to open
   * showing account A's details.
   */
  const ready = Boolean(user) && !authLoading && profile?.id === user?.id;

  /**
   * "Connecting to your account" state.
   *
   * Set when the form is submitted and kept on screen until the real account
   * has actually connected (a session with this user's profile). The request
   * resolving is not enough: the profile still has to load, and if the network
   * drops the screen stays up with a slow-connection note instead of dropping
   * the user back on a form that looks like nothing happened.
   */
  const [connecting, setConnecting] = useState(false);
  const [slow, setSlow] = useState(false);
  // Why the account did not connect (wrong password, server unreachable…).
  const [signInError, setSignInError] = useState("");
  /**
   * Once a sign-in attempt has failed, this page must STOP auto-forwarding.
   * Without this guard the effect below fires again as soon as auth state
   * settles, so the user was thrown into the account even though the attempt
   * failed (and never saw the error).
   */
  const [attemptFailed, setAttemptFailed] = useState(false);
  // When the request was accepted. The overlay is held for a short minimum so
  // a fast sign-in does not flash it on and off in one frame.
  const submittedAt = useRef(0);
  const MIN_VISIBLE_MS = 700;

  useEffect(() => {
    if (!ready || attemptFailed) return;
    // The account is connected: leave. Keep the overlay up until the page
    // actually changes, so it never shows the half-loaded account underneath.
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - submittedAt.current));
    const timer = window.setTimeout(() => {
      navigate(next, { replace: true });
      setConnecting(false);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [ready, attemptFailed, next, navigate]);

  // A spinner must never look like a frozen tab: after a few seconds say
  // plainly that the server is slow.
  useEffect(() => {
    if (!connecting) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(timer);
  }, [connecting]);

  useEffect(() => {
    if (params.get("error") === "auth") {
      setFormError(t("login.errLink"));
    }
  }, [params, t]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();

    const nextErrors: Errors = {};
    if (!email) nextErrors.email = t("login.errEmailRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = t("login.errEmailInvalid");
    if (!password) nextErrors.password = t("login.errPasswordRequired");

    setErrors(nextErrors);
    setFormError("");
    setSignInError("");
    setAttemptFailed(false);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    // Shown until the real profile connects (or the catch below fails it).
    submittedAt.current = Date.now();
    setConnecting(true);
    try {
      await signInWithEmail(email, password);
      // Navigation happens in the effect above once the new profile is loaded;
      // the connecting screen stays up until then.
    } catch (err) {
      const message = err instanceof Error ? err.message : t("login.errFailed");
      // Supabase's own messages are English-only; the one a user can actually
      // act on is replaced with a readable sentence in their language.
      setSignInError(
        /invalid login credentials|invalid_credentials/i.test(message)
          ? t("login.errFailed")
          : message
      );
      // Also shown on the form itself, so the reason survives the overlay.
      setFormError(
        /invalid login credentials|invalid_credentials/i.test(message)
          ? t("login.errFailed")
          : message
      );
      setAttemptFailed(true);
      setConnecting(false);
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
        {t("login.title")}
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        {t("login.subtitle")}
      </p>

      <div className="mt-7">
        <SocialButtons action="Sign in" onError={setFormError} />

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {t("login.orEmail")}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextField
            label={t("login.email")}
            name="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder={t("login.emailPlaceholder")}
            error={errors.email}
          />

          <TextField
            label={t("login.password")}
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
              {t("login.remember")}
            </label>
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              {t("login.forgot")}
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
                {t("login.submitting")}
              </>
            ) : (
              <>
                {t("login.submit")}
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
          {t("login.newHere")}{" "}
          <Link to="/signup" className="font-semibold text-brand-700 hover:underline">
            {t("login.create")}
          </Link>
        </p>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
          {t("login.legal")}{" "}
          <a href="#terms" className="underline hover:text-slate-600">
            {t("login.terms")}
          </a>{" "}
          {t("login.and")}{" "}
          <a href="#privacy" className="underline hover:text-slate-600">
            {t("login.privacy")}
          </a>
          .
        </p>
      </div>

      {/* Stays up from submit until the real account is connected. */}
      {connecting && (
        <SigningInOverlay
          message={signInError || (slow ? t("auth.connectingSlow") : t("auth.connectingProfile"))}
        />
      )}
    </AuthLayout>
  );
}
