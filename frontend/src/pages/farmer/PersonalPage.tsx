import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Phone, User, UserCog } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  ErrorNote,
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
import { supabase } from "@/lib/supabase";
import { STATES } from "@/lib/locations";
import { LOCATION_FIELDS } from "@/lib/roleFields";
import { farmerError } from "@/lib/farmer";

/**
 * Personal Information — name, phone, email and address.
 *
 * Name, phone and location are saved to `profiles` / `profiles.details`, which
 * every other screen already reads. Email is the sign-in identity, so it is
 * changed through Supabase's own email-confirmation flow rather than typed in
 * here; the field is shown read-only with a link to support.
 */

export default function PersonalPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast, showToast } = useToast();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    if (!form.full_name.trim()) {
      setError("Your name is needed — buyers and services see it.");
      return;
    }
    if (form.phone && !/^[0-9+\s-]{7,15}$/.test(form.phone.trim())) {
      setError("Enter a valid mobile number, digits only.");
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
      showToast("Details saved");
    } catch (err) {
      setError(farmerError(err, "Could not save your details."));
    } finally {
      setSaving(false);
    }
  }

  const districtOptions = (() => {
    const state = STATES.find((s) => s.name === form.state);
    return state?.districts ?? [];
  })();

  return (
    <FarmerShell>
      <PageHeader
        icon={UserCog}
        title="Personal Information"
        description="These details appear on your listings and are shared with a worker or transporter only when you contact them."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Your details" icon={User}>
          <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Full name <span className="text-rose-500">*</span>
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
                <Phone className="h-3 w-3" /> Mobile number
              </span>
              <Input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="10-digit mobile"
                autoComplete="tel"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <Mail className="h-3 w-3" /> Email (sign-in)
              </span>
              <Input value={profile?.email ?? user?.email ?? ""} readOnly disabled />
              <span className="mt-1 block text-[10px] text-slate-400">
                To change your sign-in email, use{" "}
                <Link to="/account/help" className="font-semibold text-brand-700 hover:underline">
                  Help &amp; Support
                </Link>
                .
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">State</span>
              <Select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value, district: "" })}
              >
                <option value="">Select state</option>
                {STATES.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">District</span>
              {districtOptions.length > 0 ? (
                <Select
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                >
                  <option value="">Select district</option>
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
                  placeholder="Type your district"
                />
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Village / Block
              </span>
              <Input
                value={form.village}
                onChange={(e) => setForm({ ...form, village: e.target.value })}
                placeholder="e.g. Ketugram"
                list="village-suggestions"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Gram panchayat / Block
              </span>
              <Input
                value={form.block}
                onChange={(e) => setForm({ ...form, block: e.target.value })}
                placeholder="Optional"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">PIN code</span>
              <Input
                inputMode="numeric"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                placeholder="6-digit PIN"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Address (for delivery or pickup)
              </span>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="House / field address as you would tell a driver"
                maxLength={200}
              />
            </label>

            {error && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
            {saved && <div className="sm:col-span-2"><SuccessNote message="Your details are saved." /></div>}

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
                Reset
              </GhostButton>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save details"}
              </PrimaryButton>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Why we ask" icon={MapPin}>
            <ul className="space-y-2 p-4 text-[11px] leading-relaxed text-slate-600">
              {LOCATION_FIELDS.map((field) => (
                <li key={field.name}>
                  <strong className="text-forest">{field.label}:</strong> {field.hint ?? "Used across the app."}
                </li>
              ))}
              <li>
                <strong className="text-forest">District</strong> pins the live weather, mandi prices and nearby
                services.
              </li>
            </ul>
          </Panel>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              <Chip tone="slate">Privacy</Chip>
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Your phone number is only shown to people you message. Buyers see your name and district on a
              listing.{" "}
              <Link to="/account/privacy" className="font-semibold text-brand-700 hover:underline">
                Privacy settings
              </Link>
            </p>
          </div>
        </div>
      </div>

      <Toast message={toast} />
    </FarmerShell>
  );
}
