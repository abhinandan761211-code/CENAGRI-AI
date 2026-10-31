import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, LogOut, Sparkles } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import RoleSelector from "@/components/auth/RoleSelector";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";

/**
 * Shown right after a Google sign-up (and any email account without a role).
 * Supabase creates the account as soon as Google returns, so this is where the
 * user actually tells us what they do.
 */
export default function CompleteProfile() {
  const { user, needsRole, completeRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<UserRole | "">("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);

  const next = params.get("next") || "/dashboard";

  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(next)}`} replace />;
  if (!needsRole) return <Navigate to={next} replace />;

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there";

  async function handleSubmit() {
    if (!role) {
      setFieldError("Please pick the option that fits you best.");
      return;
    }
    setFieldError("");
    setError("");
    setLoading(true);
    try {
      await completeRole(role);
      navigate(next, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save your role. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout badge="One last step">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">
        <Sparkles className="h-3.5 w-3.5" />
        Almost done
      </span>

      <h1 className="mt-4 font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
        Welcome, {name.split(" ")[0]}!
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Your Google account is connected. Tell us who you are so we can tailor advisories,
        prices and alerts for you.
      </p>

      <div className="mt-7 space-y-5">
        <RoleSelector value={role} onChange={setRole} error={fieldError} />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="btn-primary h-11 w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="h-4 w-4" />
            </>
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

        <button
          type="button"
          onClick={() => signOut().then(() => navigate("/", { replace: true }))}
          className="mx-auto flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          <LogOut className="h-3.5 w-3.5" />
          Use a different account
        </button>
      </div>
    </AuthLayout>
  );
}
