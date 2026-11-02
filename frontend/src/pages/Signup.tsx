import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import SocialButtons from "@/components/auth/SocialButtons";
import TextField from "@/components/auth/TextField";
import PasswordStrength from "@/components/auth/PasswordStrength";
import RoleSelector from "@/components/auth/RoleSelector";
import LocationFields, { EMPTY_LOCATION } from "@/components/auth/LocationFields";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import type { UserRole } from "@/types";

type Errors = Partial<
  Record<"name" | "email" | "phone" | "password" | "role" | "state" | "district" | "village" | "terms", string>
>;

export default function Signup() {
  const [errors, setErrors] = useState<Errors>({});
  const [role, setRole] = useState<UserRole | "">("");
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signUpWithEmail, user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("redirect") || params.get("next") || "/dashboard";

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  /** Drop a field's error as soon as the user edits that field. */
  function clearError(field: keyof Errors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").replace(/[\s-]/g, "");

    const nextErrors: Errors = {};
    if (name.length < 2) nextErrors.name = t("signup.errName");
    if (!email) nextErrors.email = t("signup.errEmailRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = t("signup.errEmailInvalid");
    if (phone && !/^[6-9]\d{9}$/.test(phone))
      nextErrors.phone = t("signup.errPhone");
    if (!password) nextErrors.password = t("signup.errPasswordRequired");
    else if (password.length < 8) nextErrors.password = t("signup.errPasswordShort");
    if (!role) nextErrors.role = t("signup.errRole");
    if (!location.state) nextErrors.state = t("signup.errState");
    if (!location.district) nextErrors.district = t("signup.errDistrict");
    if (!location.village.trim()) nextErrors.village = t("signup.errVillage");
    if (!accepted) nextErrors.terms = t("signup.errTerms");

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
        location: {
          state: location.state,
          district: location.district,
          village: location.village.trim(),
        },
      });
      if (needsEmailConfirmation) {
        setSentTo(email);
      } else {
        // Role is known, but the role-specific questions still need answers.
        navigate("/complete-profile?next=/dashboard", { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("signup.errGeneric");
      setFormError(
        /already registered|already exists|user_already_exists/i.test(message)
          ? t("signup.errExists")
          : message
      );
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout badge={t("signup.sentBadge")}>
        <div className="flex flex-col items-start">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-brand-700">
            <Mail className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
            {t("signup.sentTitle")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {t("signup.sentBody1")} <strong className="text-forest">{sentTo}</strong>.{" "}
            {t("signup.sentBody2")}
          </p>
          <Link to="/login" className="btn-primary mt-6 h-11 w-full text-[15px]">
            {t("signup.sentCta")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout badge={t("signup.badge")} wide>
      <h1 className="font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
        {t("signup.title")}
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        {t("signup.subtitle")}
      </p>

      <div className="mt-7">
        <SocialButtons action="Sign up" onError={setFormError} />

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {t("signup.orEmail")}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t("signup.fullName")}
              name="name"
              icon={User}
              autoComplete="name"
              placeholder={t("signup.fullNamePlaceholder")}
              error={errors.name}
              onChange={() => clearError("name")}
            />
            <TextField
              label={t("signup.mobile")}
              name="phone"
              type="tel"
              icon={Phone}
              autoComplete="tel"
              placeholder="98765 43210"
              hint={t("signup.mobileHint")}
              error={errors.phone}
            />
          </div>

          <TextField
            label={t("signup.email")}
            name="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="name@farm.com"
            error={errors.email}
            onChange={() => clearError("email")}
          />

          <div>
            <TextField
              label={t("signup.password")}
              name="password"
              type="password"
              icon={Lock}
              autoComplete="new-password"
              placeholder={t("signup.passwordPlaceholder")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError("password");
              }}
              error={errors.password}
            />
            <PasswordStrength value={password} />
          </div>

          <RoleSelector
            value={role}
            onChange={(nextRole) => {
              setRole(nextRole);
              clearError("role");
            }}
            error={errors.role}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h2 className="mb-3 text-sm font-semibold text-forest">{t("signup.whereTitle")}</h2>
            <LocationFields
              value={location}
              onChange={(next) => {
                setLocation(next);
                setErrors(({ state, district, village, ...rest }) => rest);
              }}
              errors={{ state: errors.state, district: errors.district, village: errors.village }}
            />
          </div>

          <div>
            <label className="flex cursor-pointer select-none items-start gap-2.5 text-[13px] leading-relaxed text-slate-600">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => {
                  setAccepted(e.target.checked);
                  clearError("terms");
                }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
              />
              <span>
                {t("signup.termsText1")}{" "}
                <a href="#terms" className="font-semibold text-brand-700 hover:underline">
                  {t("signup.termsLink")}
                </a>{" "}
                {t("signup.termsText2")}
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
                {t("signup.submitting")}
              </>
            ) : (
              <>
                {t("signup.submit")}
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
              <p>{t("signup.errFix")}</p>
            </div>
          )}
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">
          {t("signup.haveAccount")}{" "}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            {t("signup.signIn")}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
