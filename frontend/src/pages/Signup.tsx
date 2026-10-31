import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import SocialButtons from "@/components/auth/SocialButtons";
import TextField from "@/components/auth/TextField";
import PasswordStrength from "@/components/auth/PasswordStrength";
import RoleSelector from "@/components/auth/RoleSelector";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";

type Errors = Partial<
  Record<"name" | "email" | "phone" | "password" | "role" | "terms", string>
>;

export default function Signup() {
  const [errors, setErrors] = useState<Errors>({});
  const [role, setRole] = useState<UserRole | "">("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signUpWithEmail, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("redirect") || params.get("next") || "/dashboard";

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").replace(/[\s-]/g, "");

    const nextErrors: Errors = {};
    if (name.length < 2) nextErrors.name = "Enter your full name.";
    if (!email) nextErrors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = "That doesn't look like a valid email.";
    if (phone && !/^[6-9]\d{9}$/.test(phone))
      nextErrors.phone = "Enter a 10-digit Indian mobile number.";
    if (!password) nextErrors.password = "Create a password.";
    else if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (!role) nextErrors.role = "Select the role that fits you best.";
    if (!accepted) nextErrors.terms = "Please accept the terms to continue.";

    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length > 0 || !role) return;

    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUpWithEmail({
        email,
        password,
        fullName: name,
        phone: phone || undefined,
        role,
      });
      if (needsEmailConfirmation) {
        setSentTo(email);
      } else {
        // Role is known, but the role-specific questions still need answers.
        navigate("/complete-profile?next=/dashboard", { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create your account.";
      setFormError(
        /already registered|already exists/i.test(message)
          ? "An account with this email already exists. Try signing in instead."
          : message
      );
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout badge="Almost there">
        <div className="flex flex-col items-start">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-brand-700">
            <Mail className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
            Check your email
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            We sent a confirmation link to <strong className="text-forest">{sentTo}</strong>.
            Click it to activate your account, then sign in.
          </p>
          <Link to="/login" className="btn-primary mt-6 h-11 w-full text-[15px]">
            Go to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout badge="Free to start · No card needed" wide>
      <h1 className="font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Set up your profile in two minutes and get your first field brief tomorrow morning.
      </p>

      <div className="mt-7">
        <SocialButtons action="Sign up" onError={setFormError} />

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            or sign up with email
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              name="name"
              icon={User}
              autoComplete="name"
              placeholder="Anil Mondal"
              error={errors.name}
            />
            <TextField
              label="Mobile"
              name="phone"
              type="tel"
              icon={Phone}
              autoComplete="tel"
              placeholder="98765 43210"
              hint="Optional"
              error={errors.phone}
            />
          </div>

          <TextField
            label="Email address"
            name="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="name@farm.com"
            error={errors.email}
          />

          <div>
            <TextField
              label="Password"
              name="password"
              type="password"
              icon={Lock}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <PasswordStrength value={password} />
          </div>

          <RoleSelector value={role} onChange={setRole} error={errors.role} />

          <div>
            <label className="flex cursor-pointer select-none items-start gap-2.5 text-[13px] leading-relaxed text-slate-600">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
              />
              <span>
                I agree to the{" "}
                <a href="#terms" className="font-semibold text-brand-700 hover:underline">
                  Terms of Use
                </a>{" "}
                and consent to my data being used to personalise agricultural advice.
              </span>
            </label>
            {errors.terms && (
              <p className="mt-1.5 text-xs font-medium text-red-600">{errors.terms}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary h-11 w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                Create free account
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

          {Object.keys(errors).length > 0 && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Please fix the highlighted fields and try again.</p>
            </div>
          )}
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
