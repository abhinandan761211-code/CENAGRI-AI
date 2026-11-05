import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Phone, User, UserCog } from "lucide-react";

import {
  Chip,
  GhostButton,
  Input,
  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  SuccessNote,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import { supabase } from "@/lib/supabase";
import { STATES } from "@/lib/locations";
import { LOCATION_FIELDS } from "@/lib/roleFields";
import { farmerError } from "@/lib/farmer";

/**
 * Personal Information — name, phone, email and address.
 *
 * Extracted from the farmer's `/account/personal` page so every account type
 * can edit the same fields. Name, phone and location live in `profiles` /
 * `profiles.details`, the shape `useAuth` and every dashboard already read.
 * Email is the sign-in identity, so it is changed through Supabase's own
 * confirmation flow and shown read-only here.
 *
 * `frame` wraps the finished page in the caller's shell: the farmer passes
 * `<FarmerShell>`, the other accounts pass their own module layout. Without a
 * frame the page renders bare, which is only useful in tests.
 */
export default function PersonalDetailsForm({
  frame = (page) => <>{page}</>,
  hideHeader = false,
  title,
  description,
}: {
  /** Wraps the rendered page — usually `(page) => <SomeLayout>{page}</SomeLayout>`. */
  frame?: (page: ReactNode) => ReactNode;
  /**
   * Suppress the page heading. Set when the surrounding layout already prints
   * the same title, so the screen does not show it twice.
   */
  hideHeader?: boolean;
  title?: string;
  description?: string;
}) {
  const { user, profile, refreshProfile } = useAuth();
  const { toast, showToast } = useToast();
  // Every label on this page follows the language picked in the account shell.
  const { t } = useLang();

  const details = profile?.details ?? {};
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
    state: details.state ?? "",
    district: details.district ?? "",
    village: details.village ?? "",
    block: details.block ?? "",
    pin: details.pin ?? "",
    address: details.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // A late profile load (e.g. after refreshProfile) should fill the form once.
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      full_name: prev.full_name || profile?.full_name || "",
      phone: prev.phone || profile?.phone || "",
      state: prev.state || details.state || "",
      district: prev.district || details.district || "",
      village: prev.village || details.village || "",
      block: prev.block || details.block || "",
      pin: prev.pin || details.pin || "",
      address: prev.address || details.address || "",
    }));
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    if (!form.full_name.trim()) {
      setError(t("acc.personal.errName"));
      return;
    }
    if (form.phone && !/^[0-9+\s-]{7,15}$/.test(form.phone.trim())) {
      setError(t("acc.personal.errPhone"));
      return;
    }

    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const nextDetails = {
        ...details,
        state: form.state,
        district: form.district,
        village: form.village,
        block: form.block,
        pin: form.pin,
        address: form.address,
      };

      const { error: err } = await supabase
        .from("profiles")
        .update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null, details: nextDetails })
        .eq("id", user.id);
      if (err) throw err;

      // Keep auth metadata in step so a re-login shows the same values.
      await supabase.auth.updateUser({
        data: { full_name: form.full_name.trim(), phone: form.phone.trim(), details: nextDetails },
      });

      await refreshProfile();
      setSaved(true);
      showToast(t("acc.personal.savedToast"));
    } catch (err) {
      setError(farmerError(err, t("acc.personal.errSave")));
    } finally {
      setSaving(false);
    }
  }

  const districtOptions = STATES.find((s) => s.name === form.state)?.districts ?? [];

  return frame(
    <>
      {!hideHeader && (
        <PageHeader
          icon={UserCog}
          title={title ?? t("acc.personal.title")}
          description={description ?? t("acc.personal.desc")}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={t("acc.personal.yourDetails")} icon={User}>
          <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.name")} <span className="text-rose-500">*</span>
              </span>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                maxLength={120}
                autoComplete="name"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <Phone className="h-3 w-3" /> {t("acc.mobile")}
              </span>
              <Input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t("acc.mobilePlaceholder")}
                autoComplete="tel"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <Mail className="h-3 w-3" /> {t("acc.email")}
              </span>
              <Input value={profile?.email ?? user?.email ?? ""} readOnly disabled />
              <span className="mt-1 block text-[10px] text-slate-400">
                {t("acc.emailHelp")}{" "}
                <Link to="/account/help" className="font-semibold text-brand-700 hover:underline">
                  {t("acc.help.title")}
                </Link>
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("acc.state")}</span>
              <Select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value, district: "" })}
              >
                <option value="">{t("acc.selectState")}</option>
                {STATES.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("acc.district")}</span>
              {districtOptions.length > 0 ? (
                <Select
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                >
                  <option value="">{t("acc.selectDistrict")}</option>
                  {districtOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  placeholder={t("acc.typeDistrict")}
                />
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.village")}
              </span>
              <Input
                value={form.village}
                onChange={(e) => setForm({ ...form, village: e.target.value })}
                placeholder={t("acc.villagePlaceholder")}
                list="village-suggestions"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.block")}
              </span>
              <Input
                value={form.block}
                onChange={(e) => setForm({ ...form, block: e.target.value })}
                placeholder={t("acc.optional")}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("acc.pin")}</span>
              <Input
                inputMode="numeric"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                placeholder={t("acc.pinPlaceholder")}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.address")}
              </span>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={t("acc.addressPlaceholder")}
                maxLength={200}
              />
            </label>

            {error && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
            {saved && <div className="sm:col-span-2"><SuccessNote message={t("acc.personal.saved")} /></div>}

            <div className="flex justify-end gap-2 sm:col-span-2">
              <GhostButton
                type="button"
                onClick={() =>
                  setForm({
                    full_name: profile?.full_name ?? "",
                    phone: profile?.phone ?? "",
                    state: details.state ?? "",
                    district: details.district ?? "",
                    village: details.village ?? "",
                    block: details.block ?? "",
                    pin: details.pin ?? "",
                    address: details.address ?? "",
                  })
                }
                disabled={saving}
              >
                {t("acc.personal.reset")}
              </GhostButton>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? t("acc.personal.saving") : t("acc.personal.save")}
              </PrimaryButton>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title={t("acc.personal.why")} icon={MapPin}>
            <ul className="space-y-2 p-4 text-[11px] leading-relaxed text-slate-600">
              {LOCATION_FIELDS.map((field) => (
                <li key={field.name}>
                  <strong className="text-forest">{field.label}:</strong> {field.hint ?? t("acc.personal.whyDefault")}
                </li>
              ))}
              <li>
                <strong className="text-forest">{t("acc.district")}</strong> {t("acc.personal.whyDistrict")}
              </li>
            </ul>
          </Panel>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              <Chip tone="slate">{t("acc.personal.privacy")}</Chip>
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              {t("acc.personal.privacyBody")}{" "}
              <Link to="/account/privacy" className="font-semibold text-brand-700 hover:underline">
                {t("acc.personal.privacyLink")}
              </Link>
            </p>
          </div>
        </div>
      </div>

      <Toast message={toast} />
    </>
  );
}
