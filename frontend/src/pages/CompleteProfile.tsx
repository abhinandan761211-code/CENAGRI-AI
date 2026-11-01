import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, LogOut, Sparkles } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import RoleSelector from "@/components/auth/RoleSelector";
import LocationFields from "@/components/auth/LocationFields";
import { useAuth } from "@/hooks/useAuth";
import { LOCATION_FIELD_NAMES, ROLE_FIELDS } from "@/lib/roleFields";
import type { RoleField } from "@/lib/roleFields";

import type { UserRole } from "@/types";

type Step = "role" | "details";

const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100";

function DetailsField({
  field,
  value,
  onChange,
  error,
}: {
  field: RoleField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = `detail-${field.name}`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-forest">
        {field.label}
        {!field.required && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
      </label>

      {field.type === "select" ? (
        <select
          id={id}
          name={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className={`${inputClass} ${error ? "border-red-300" : ""}`}
        >
          <option value="">Select…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={field.name}
          type={field.type}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          aria-invalid={!!error}
          className={`${inputClass} ${error ? "border-red-300" : ""}`}
        />
      )}

      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : field.hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{field.hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Pre-fill the form with whatever the account already knows: saved profile
 * details first, then the `details` blob in auth metadata, then the flat
 * `state` / `district` / `village` keys written by the signup form.
 */
function seedLocation(
  userMetadata: Record<string, unknown> | undefined,
  profileDetails: Record<string, string> | null | undefined
): Record<string, string> {
  const metaDetails = (userMetadata?.details ?? {}) as Record<string, string>;
  const details: Record<string, string> = { ...(profileDetails ?? {}) };

  for (const key of LOCATION_FIELD_NAMES) {
    const fallback = metaDetails[key] ?? userMetadata?.[key];
    if (!details[key] && typeof fallback === "string" && fallback.trim()) {
      details[key] = fallback.trim();
    }
  }

  // Accounts that only ever stored a district default to the launch state.
  if (!details.state && details.district) details.state = "West Bengal";
  return details;
}

/**
 * Shown right after a Google sign-up (and any account missing a role / details).
 * Step 1 picks the role, step 2 asks the questions relevant to that role.
 */
export default function CompleteProfile() {
  const { user, profile, needsRole, needsDetails, completeRole, saveDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const next = params.get("next") || "/dashboard";
  const existingRole = (profile?.role ?? "") as UserRole | "";
  const [step, setStep] = useState<Step>(needsRole ? "role" : "details");
  const [role, setRole] = useState<UserRole | "">(existingRole);
  const [values, setValues] = useState<Record<string, string>>(() =>
    seedLocation(user?.user_metadata, profile?.details)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(next)}`} replace />;
  if (!needsRole && !needsDetails) return <Navigate to={next} replace />;

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there";

  const fields = role ? ROLE_FIELDS[role] : [];
  // The three location fields are rendered together by <LocationFields>.
  const otherFields = fields.filter((field) => !LOCATION_FIELD_NAMES.includes(field.name));
  const showsLocation = LOCATION_FIELD_NAMES.every((name) =>
    fields.some((field) => field.name === name)
  );

  function setLocation(next: { state: string; district: string; village: string }) {
    setValues((prev) => ({ ...prev, ...next }));
    setErrors(({ state, district, village, ...rest }) => rest);
  }

  function goToDetails() {
    if (!role) {
      setErrors({ role: "Please pick the option that fits you best." });
      return;
    }
    setErrors({});
    setStep("details");
  }

  function validateDetails() {
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const raw = (values[field.name] ?? "").trim();
      if (field.required && !raw) {
        nextErrors[field.name] = `${field.label} is required.`;
      } else if (field.type === "number" && raw && Number.isNaN(Number(raw))) {
        nextErrors[field.name] = "Enter a number.";
      }
    }
    return nextErrors;
  }

  async function handleSave() {
    if (!role) return;

    const nextErrors = validateDetails();
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    // Keep only the fields that belong to the chosen role.
    const clean: Record<string, string> = {};
    for (const field of fields) {
      const raw = (values[field.name] ?? "").trim();
      if (raw) clean[field.name] = raw;
    }
    // A district picked on the signup form stays consistent even if a single
    // location answer was left blank here.
    if (!clean.state && clean.district) clean.state = "West Bengal";

    setLoading(true);
    try {
      if (needsRole) await completeRole(role, clean);
      else await saveDetails(clean);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout badge={step === "role" ? "One last step" : role ? `About you as a ${role}` : "About you"}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">
        <Sparkles className="h-3.5 w-3.5" />
        {step === "role" ? "Step 1 of 2" : "Step 2 of 2"}
      </span>

      {step === "role" ? (
        <>
          <h1 className="mt-4 font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
            Welcome, {name.split(" ")[0]}!
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account is connected. Tell us who you are so we can tailor advisories, prices
            and alerts for you.
          </p>

          <div className="mt-7 space-y-5">
            <RoleSelector value={role} onChange={setRole} error={errors.role} />

            <button
              type="button"
              onClick={goToDetails}
              className="btn-primary h-11 w-full text-[15px]"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-4 font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
            A few quick details
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            These help us show the right weather, prices and alerts for your area.
          </p>

          <div className="mt-7 space-y-4">
            {showsLocation && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <LocationFields
                  value={{
                    state: values.state ?? "",
                    district: values.district ?? "",
                    village: values.village ?? "",
                  }}
                  onChange={setLocation}
                  errors={{
                    state: errors.state,
                    district: errors.district,
                    village: errors.village,
                  }}
                />
              </div>
            )}

            {otherFields.map((field) => (
              <DetailsField
                key={field.name}
                field={field}
                value={values[field.name] ?? ""}
                onChange={(value) => setValues((prev) => ({ ...prev, [field.name]: value }))}
                error={errors[field.name]}
              />
            ))}

            <button
              type="button"
              onClick={handleSave}
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
                  Finish setup
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {needsRole && (
              <button
                type="button"
                onClick={() => {
                  setErrors({});
                  setStep("role");
                }}
                className="mx-auto flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Change role
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => signOut().then(() => navigate("/", { replace: true }))}
        className="mx-auto mt-6 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        <LogOut className="h-3.5 w-3.5" />
        Use a different account
      </button>
    </AuthLayout>
  );
}
