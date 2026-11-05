import { useState } from "react";
import {
  BadgeCheck,
  Clock,
  Loader2,
  MapPin,
  Receipt,
  Save,
  ShieldCheck,
  Store,
} from "lucide-react";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useRetailerData } from "@/hooks/useRetailerData";
import { WB_DISTRICTS } from "@/lib/roleFields";
import { STATES } from "@/lib/locations";
import {
  VERIFICATION_LABEL,
  formatDate,
  formatTime,
  getShop,
  saveShop,
  submitForVerification,
} from "@/lib/retailer";
import type { RetailerShop, ShopInput } from "@/lib/retailer";
import { useLang } from "@/i18n/LanguageContext";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const VERIFICATION_STYLE: Record<RetailerShop["verification"], string> = {
  pending: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

/** Form state — nullable columns are strings here so inputs stay controlled. */
type ShopFormState = Omit<ShopInput, "district" | "state" | "pincode" | "gstin" | "weekly_off"> & {
  district: string;
  state: string;
  pincode: string;
  gstin: string;
  weekly_off: string;
};

const EMPTY: ShopFormState = {
  shop_name: "",
  shop_type: "Agri-input (seed & fertiliser)",
  address_line: "",
  district: "",
  state: "West Bengal",
  pincode: "",
  phone: "",
  gstin: "",
  license_no: "",
  opening_time: "09:00",
  closing_time: "18:00",
  weekly_off: "",
};

/** GSTIN: 2-digit state code + PAN + entity + Z + checksum. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PIN_RE = /^[1-9][0-9]{5}$/;

/**
 * My Shop — the shop profile a retailer is registered under: name, address,
 * GST details, opening hours and verification status.
 *
 * Verification is never self-granted: submitting moves it to "Under review",
 * only Kalika staff can set it to Verified.
 */
export default function RetailerShopPage() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLang();
  const { data, state, error, reload } = useRetailerData<RetailerShop | null>(() => getShop(), []);

  return (
    <RetailerLayout title={t("r.s.title")} subtitle={t("r.s.subtitle")}>
      {state === "loading" && <Loading label={t("r.c.loading")} />}
      {state === "error" && <ErrorNotice message={error} onRetry={() => void reload()} />}
      {state === "ready" && data === null && (
        <div className="card">
          <EmptyState
            icon={Store}
            title={t("r.s.notRegistered")}
            description={t("r.s.notRegisteredDesc")}
          />
        </div>
      )}

      {state === "ready" && (
        <ShopForm
          shop={data ?? null}
          onSaved={async () => {
            await reload();
            // Keep profiles.details.shop_name in sync with the shop row.
            try {
              await refreshProfile();
            } catch {
              /* non-fatal */
            }
          }}
          fallbackName={profile?.details?.shop_name ?? ""}
        />
      )}
    </RetailerLayout>
  );
}

function ShopForm({
  shop,
  onSaved,
  fallbackName,
}: {
  shop: RetailerShop | null;
  onSaved: () => Promise<void>;
  fallbackName: string;
}) {
  const { t } = useLang();
  const [form, setForm] = useState<ShopFormState>(() =>
    shop
      ? {
        shop_name: shop.shop_name,
        shop_type: shop.shop_type ?? "",
        address_line: shop.address_line ?? "",
        district: shop.district ?? "",
        state: shop.state ?? "",
        pincode: shop.pincode ?? "",
        phone: shop.phone ?? "",
        gstin: shop.gstin ?? "",
        license_no: shop.license_no ?? "",
        opening_time: shop.opening_time?.slice(0, 5) ?? "",
        closing_time: shop.closing_time?.slice(0, 5) ?? "",
        weekly_off: shop.weekly_off ?? "",
      }
      : { ...EMPTY, shop_name: fallbackName }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function set<K extends keyof ShopFormState>(field: K, value: ShopFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.shop_name.trim()) next.shop_name = "Shop name is required.";
    if (form.gstin && !GSTIN_RE.test(form.gstin.trim().toUpperCase())) {
      next.gstin = "GSTIN must look like 19ABCDE1234F1Z5.";
    }
    if (form.pincode && !PIN_RE.test(form.pincode)) {
      next.pincode = "Enter a valid 6-digit PIN code.";
    }
    if (form.phone && !/^[0-9+\-\s]{10,15}$/.test(form.phone.trim())) {
      next.phone = "Enter a valid phone number.";
    }
    if (form.opening_time && form.closing_time && form.closing_time <= form.opening_time) {
      next.closing_time = "Closing time must be after opening time.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveShop({
        ...form,
        shop_name: form.shop_name.trim(),
        gstin: form.gstin ? form.gstin.trim().toUpperCase() : null,
        pincode: form.pincode ? form.pincode.trim() : null,
        district: form.district || null,
        state: form.state || null,
        weekly_off: form.weekly_off || null,
      });
      await onSaved();
      setNotice({ kind: "ok", text: "Shop details saved." });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not save the shop.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitVerification() {
    setSubmitting(true);
    setNotice(null);
    try {
      await submitForVerification();
      await onSaved();
      setNotice({
        kind: "ok",
        text: "Sent for verification. Our team reviews GSTIN and licence within 2 working days.",
      });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not submit for verification.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const verification = shop?.verification ?? "pending";
  const canSubmit = verification === "pending" || verification === "rejected";
  const completed = [
    form.shop_name,
    form.address_line,
    form.district,
    form.pincode,
    form.phone,
    form.gstin,
  ].filter(Boolean).length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={handleSave} className="space-y-4 lg:col-span-2">
        <Panel title={t("r.s.identity")} description={t("r.s.identityDesc")}>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <Field label={t("r.s.shopName")} required error={errors.shop_name}>
              <input
                value={form.shop_name}
                onChange={(e) => set("shop_name", e.target.value)}
                placeholder="e.g. Mondal Krishi Bhandar"
                className={inputClass}
              />
            </Field>
            <Field label={t("r.s.shopType")}>
              <select
                value={form.shop_type ?? ""}
                onChange={(e) => set("shop_type", e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                <option>Agri-input (seed & fertiliser)</option>
                <option>Pesticide dealer</option>
                <option>Irrigation & tools</option>
                <option>Mixed agri-input</option>
                <option>Grocery</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label={t("r.s.phone")} error={errors.phone}>
              <input
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="e.g. 98765 43210"
                className={inputClass}
              />
            </Field>
            <Field label={t("r.s.weeklyOff")} hint={t("r.s.openAllWeek")}>
              <select
                value={form.weekly_off ?? ""}
                onChange={(e) => set("weekly_off", e.target.value)}
                className={inputClass}
              >
                <option value="">Open all week</option>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title={t("r.s.address")} description={t("r.s.locationHint")}>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2">
              <Field label={t("r.s.addressLine")}>
                <input
                  value={form.address_line ?? ""}
                  onChange={(e) => set("address_line", e.target.value)}
                  placeholder="Shop no., street, landmark"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="State">
              <select
                value={form.state ?? ""}
                onChange={(e) => set("state", e.target.value)}
                className={inputClass}
              >
                <option value="">Select state…</option>
                {STATES.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="District">
              <select
                value={form.district ?? ""}
                onChange={(e) => set("district", e.target.value)}
                className={inputClass}
              >
                <option value="">Select district…</option>
                {WB_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PIN code" error={errors.pincode}>
              <input
                value={form.pincode ?? ""}
                onChange={(e) => set("pincode", e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="e.g. 713101"
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="GST & licence" description="Needed for B2B invoices and seed/pesticide compliance">
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="GSTIN" error={errors.gstin} hint="15 characters. Leave blank if unregistered.">
              <input
                value={form.gstin ?? ""}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                maxLength={15}
                placeholder="19ABCDE1234F1Z5"
                className={`${inputClass} uppercase`}
              />
            </Field>
            <Field label="Seed / pesticide licence no." hint="As printed on your licence certificate.">
              <input
                value={form.license_no ?? ""}
                onChange={(e) => set("license_no", e.target.value)}
                placeholder="e.g. WB/SEED/2025/1842"
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Opening hours" description="Shown on your shop card">
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Opens at">
              <input
                type="time"
                value={form.opening_time ?? ""}
                onChange={(e) => set("opening_time", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Closes at" error={errors.closing_time}>
              <input
                type="time"
                value={form.closing_time ?? ""}
                onChange={(e) => set("closing_time", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>

        {notice && (
          <p
            className={`rounded-lg px-3 py-2 text-[11px] ${notice.kind === "ok"
                ? "border border-emerald-100 bg-emerald-50 text-emerald-800"
                : "border border-red-100 bg-red-50 text-red-700"
              }`}
          >
            {notice.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="btn-primary h-10 px-5 text-xs disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save shop details"}
          </button>
          {shop && canSubmit && (
            <button
              type="button"
              onClick={() => void handleSubmitVerification()}
              disabled={submitting || completed < 5}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-4 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Submit for verification
            </button>
          )}
        </div>
        {shop && canSubmit && completed < 5 && (
          <p className="text-[11px] text-slate-500">
            Fill name, address, district, PIN and phone before submitting.
          </p>
        )}
      </form>

      {/* Summary column */}
      <div className="space-y-4">
        <Panel title="Verification">
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Badge className={VERIFICATION_STYLE[verification]}>
                {VERIFICATION_LABEL[verification]}
              </Badge>
              {verification === "verified" && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {verification === "verified"
                ? `Verified on ${formatDate(shop?.verified_at ?? null)}. Your shop appears in farmer search results.`
                : verification === "submitted"
                  ? "Our team is checking your GSTIN and licence. This usually takes 2 working days."
                  : verification === "rejected"
                    ? "The last submission was rejected. Correct the details and submit again."
                    : "Submit your GSTIN and licence to get a Verified badge and show up in farmer searches."}
            </p>
            <dl className="space-y-1.5 text-[11px]">
              {[
                ["Shop name", form.shop_name || "—"],
                ["GSTIN", form.gstin || "Not provided"],
                ["Licence", form.license_no || "Not provided"],
                ["Hours", `${formatTime(form.opening_time || null)} – ${formatTime(form.closing_time || null)}`],
                ["Weekly off", form.weekly_off || "Open all week"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="max-w-[60%] truncate text-right font-semibold text-forest">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>

        <Panel title="Profile completeness">
          <div className="p-4 sm:p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-2xl font-extrabold text-forest">
                {Math.round((completed / 6) * 100)}%
              </p>
              <p className="text-[11px] text-slate-500">{completed} of 6 key fields</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${(completed / 6) * 100}%` }}
              />
            </div>
            <ul className="mt-3 space-y-1.5 text-[11px] text-slate-600">
              <li className="flex items-center gap-1.5">
                <Store className="h-3 w-3 text-slate-400" /> Name, address & PIN
              </li>
              <li className="flex items-center gap-1.5">
                <Receipt className="h-3 w-3 text-slate-400" /> GST details for invoices
              </li>
              <li className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-slate-400" /> Opening hours
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-slate-400" /> District for local search
              </li>
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
