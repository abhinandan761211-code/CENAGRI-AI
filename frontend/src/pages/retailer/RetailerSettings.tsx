import { useState } from "react";
import { KeyRound, Mail, MapPin, Phone, Save, ShieldCheck, Store, User } from "lucide-react";
import { Link } from "react-router-dom";
import RetailerLayout, { RETAILER_ROUTES } from "@/components/retailer/RetailerLayout";
import { Panel, inputClass } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { formatLocation } from "@/lib/locations";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Profile & Settings — account management for the retailer: contact details,
 * location, password and where to find the shop/GST record.
 *
 * Name + location are saved into the same `profiles.details` shape every role
 * uses, so the retailer does not get its own parallel settings model.
 */
export default function RetailerSettings() {
  const { t } = useLang();
  const { user, profile, saveDetails, updatePassword } = useAuth();

  const details = profile?.details ?? {};
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [district, setDistrict] = useState(details.district ?? "");
  const [village, setVillage] = useState(details.village ?? "");
  const [profileState, setProfileState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [profileError, setProfileError] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwState, setPwState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [pwError, setPwError] = useState("");

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileState("saving");
    setProfileError("");
    try {
      // `phone` is a real column on `profiles`, not a `details` key, so the
      // details write below would silently drop it.
      if (!supabase) throw new Error("The database is not configured on this deployment.");
      const { error: phoneError } = await supabase
        .from("profiles")
        .update({ phone: phone.trim() || null })
        .eq("id", user!.id);
      if (phoneError) throw phoneError;

      await saveDetails({ ...details, full_name: fullName, district, village });
      setProfileState("ok");
    } catch (err) {
      setProfileState("err");
      setProfileError(err instanceof Error ? err.message : "Could not save your profile.");
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setPwState("err");
      setPwError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setPwState("err");
      setPwError("The two passwords do not match.");
      return;
    }
    setPwState("saving");
    setPwError("");
    try {
      await updatePassword(password);
      setPwState("ok");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setPwState("err");
      setPwError(err instanceof Error ? err.message : "Could not update the password.");
    }
  }

  return (
    <RetailerLayout title={t("s.profileSettings")} subtitle={t("r.g.accountManagement")}>
      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={handleProfile} className="space-y-4 lg:col-span-2">
          <Panel title={t("r.g.accountDetails")} description={t("r.g.contactHint")}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Full name
                </span>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={`${inputClass} pl-9`}
                    placeholder={t("r.g.name")}
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Phone
                </span>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={`${inputClass} pl-9`}
                    placeholder={t("r.g.mobile")}
                  />
                </div>
              </label>
              <div className="sm:col-span-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Email
                  </span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={profile?.email ?? user?.email ?? ""}
                      readOnly
                      disabled
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Email is managed by your sign-in provider.
                  </span>
                </label>
              </div>
            </div>
          </Panel>

          <Panel title={t("r.g.location")} description={t("r.g.locationHint")}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  District
                </span>
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Purba Bardhaman"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Village / Block
                </span>
                <input
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Katwa"
                />
              </label>
            </div>
          </Panel>

          {profileState === "ok" && (
            <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              Profile saved.
            </p>
          )}
          {profileState === "err" && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {profileError}
            </p>
          )}

          <button
            type="submit"
            disabled={profileState === "saving"}
            className="btn-primary h-10 px-5 text-xs disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {profileState === "saving" ? "Saving…" : "Save profile"}
          </button>
        </form>

        <div className="space-y-4">
          <Panel title={t("r.g.shopGst")}>
            <div className="space-y-3 p-4 sm:p-5">
              <p className="text-[11px] leading-relaxed text-slate-600">
                {details.shop_name ? (
                  <>
                    <strong className="text-forest">{details.shop_name}</strong>
                    {details.district ? ` · ${formatLocation(details)}` : ""}
                  </>
                ) : (
                  "Your shop profile has not been set up yet."
                )}
              </p>
              <Link to={RETAILER_ROUTES.shop} className="btn-outline h-9 w-full text-xs">
                <Store className="h-3.5 w-3.5" />
                {t("r.g.manageShop")}
              </Link>
              <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {t("r.g.gstNote")}
              </p>
            </div>
          </Panel>

          <Panel title={t("r.g.password")} description={t("r.g.passwordHint")}>
            <form onSubmit={handlePassword} className="space-y-3 p-4 sm:p-5">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("r.g.newPassword")}
                autoComplete="new-password"
                className={inputClass}
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("r.g.confirmPassword")}
                autoComplete="new-password"
                className={inputClass}
              />
              {pwState === "ok" && <p className="text-[11px] text-emerald-700">Password updated.</p>}
              {pwState === "err" && <p className="text-[11px] text-red-600">{pwError}</p>}
              <button
                type="submit"
                disabled={pwState === "saving" || !password}
                className="btn-outline h-9 w-full text-xs disabled:opacity-50"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {pwState === "saving" ? "Updating…" : "Update password"}
              </button>
            </form>
          </Panel>

          <Panel title={t("r.g.accountType")}>
            <p className="p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
              You are signed in as a{" "}
              <strong className="text-forest">Retailer</strong> — you sell agricultural inputs and
              manage stock. Sourcing produce from farmers is a buyer account. Both can use direct
              farmer procurement, but the dashboards stay separate.
              <span className="mt-2 flex items-center gap-1 text-slate-400">
                <MapPin className="h-3 w-3" /> Alipore · Kalika
              </span>
            </p>
          </Panel>
        </div>
      </div>
    </RetailerLayout>
  );
}
