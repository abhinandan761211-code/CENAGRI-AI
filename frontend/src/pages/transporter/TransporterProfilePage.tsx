import { useEffect, useState } from "react";
import {
  Globe,
  MapPin,
  Phone,
  Save,
  ShieldQuestion,
  Star,
  Truck,
  UserRound,
} from "lucide-react";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { VerificationBadge } from "@/components/transporter/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { CompletionRing, StarRating } from "@/components/worker/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  CARGO_TYPES,
  describeTransporterError,
  ensureTransporterProfile,
  listFleet,
  profileCompletion,
  saveTransporterProfile,
} from "@/lib/transporter";
import type { FleetVehicle, TransporterProfile } from "@/lib/transporter";
import { Link } from "react-router-dom";

/**
 * Transporter profile.
 *
 * The business identity requesters judge you by. Verification is read-only: it
 * is decided by the Kalika review workflow, not by the transporter, and the
 * documents that back it stay private.
 */
export default function TransporterProfilePage() {
  const D = describeTransporterError;
  const { profile: account } = useAuth();

  const profile = useWorkerData<TransporterProfile>(
    () =>
      ensureTransporterProfile({
        business_name: account?.details?.business_name ?? account?.full_name,
        contact_phone: account?.phone,
        service_districts: [account?.details?.district].filter(Boolean) as string[],
      }),
    [],
    D
  );
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);

  const [form, setForm] = useState<{
    business_name: string;
    about: string;
    contact_phone: string;
    service_districts: string;
    service_categories: string[];
    experience_years: string;
    operating_since: string;
    is_accepting: boolean;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = profile.data;
    if (!p || form) return;
    setForm({
      business_name: p.business_name ?? "",
      about: p.about ?? "",
      contact_phone: p.contact_phone ?? "",
      service_districts: (p.service_districts ?? []).join(", "),
      service_categories: p.service_categories ?? [],
      experience_years: String(p.experience_years ?? 0),
      operating_since: p.operating_since != null ? String(p.operating_since) : "",
      is_accepting: p.is_accepting,
    });
  }, [profile.data, form]);

  const vehicles = fleet.data ?? [];
  const completion = profileCompletion(profile.data, vehicles.length);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await saveTransporterProfile({
        business_name: form.business_name.trim() || null,
        about: form.about.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        service_districts: form.service_districts
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
        service_categories: form.service_categories,
        experience_years: Number(form.experience_years) || 0,
        operating_since: form.operating_since === "" ? null : Number(form.operating_since),
        is_accepting: form.is_accepting,
      });
      setSaved(true);
      profile.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(type: string) {
    if (!form) return;
    setForm({
      ...form,
      service_categories: form.service_categories.includes(type)
        ? form.service_categories.filter((c) => c !== type)
        : [...form.service_categories, type],
    });
  }

  if (profile.state === "loading" || !form) {
    return (
      <TransporterLayout title="My Profile">
        <Loading label="Loading your profile…" />
      </TransporterLayout>
    );
  }

  if (profile.state === "error" || !profile.data) {
    return (
      <TransporterLayout title="My Profile">
        <ErrorNotice message={profile.error || "Profile not found."} onRetry={profile.reload} />
      </TransporterLayout>
    );
  }

  const me = profile.data;

  return (
    <TransporterLayout
      title="My Profile"
      subtitle="Your business details — what requesters see"
      action={
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-forest text-lg font-bold text-white">
            {account?.avatar_url ? (
              <img src={account.avatar_url} alt="" className="h-16 w-16 object-cover" referrerPolicy="no-referrer" />
            ) : (
              (form.business_name || account?.email || "T").slice(0, 2).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-extrabold text-forest">
                {form.business_name || "Add your business name"}
              </h2>
              <VerificationBadge verification={me.verification} />
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${me.is_accepting ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${me.is_accepting ? "bg-emerald-500" : "bg-slate-400"}`} />
                {me.is_accepting ? "Accepting bookings" : "Not accepting bookings"}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {form.service_districts || "Service area not set"}
              </span>
              <span className="flex items-center gap-1">
                <StarRating value={me.rating_avg} /> {Number(me.rating_avg).toFixed(1)} ({me.rating_count})
              </span>
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3" /> {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
            <CompletionRing value={completion} />
            <p className="text-[10.5px] font-semibold text-slate-500 sm:text-right">
              {completion >= 100 ? "Profile complete" : `${100 - completion}% to go`}
            </p>
          </div>
        </div>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-800">
          Profile saved.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Business details" description="Shown to requesters on your quotes">
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Business / transporter name">
                <input
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Yadav Transport"
                />
              </Field>
              <Field label="Contact phone">
                <input
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  className={inputClass}
                  inputMode="tel"
                  placeholder="e.g. 9876543210"
                />
              </Field>
              <Field label="Experience (years)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.experience_years}
                  onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Operating since (year)">
                <input
                  type="number"
                  min={1960}
                  max={new Date().getFullYear()}
                  value={form.operating_since}
                  onChange={(e) => setForm({ ...form, operating_since: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. 2018"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Service area (districts)" hint="Comma separated.">
                  <input
                    value={form.service_districts}
                    onChange={(e) => setForm({ ...form, service_districts: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Supaul, Madhepura, Saharsa"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="About your business" hint="Routes you know well, cargo you handle, your USP.">
                  <textarea
                    value={form.about}
                    onChange={(e) => setForm({ ...form, about: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    className={`${inputClass} resize-none`}
                    placeholder="e.g. 8 years of moving paddy and vegetables across the Kosi belt with a 3-truck fleet."
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Transport categories" description="The kinds of cargo you take">
            <div className="flex flex-wrap gap-1.5 p-4 sm:p-5">
              {CARGO_TYPES.map((cat) => {
                const active = form.service_categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCategory(cat)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${active
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                      }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Available vehicle types"
            description="Based on the vehicles you added"
            action={
              <Link to={TRANSPORTER_ROUTES.vehicles} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                Manage fleet
              </Link>
            }
          >
            <div className="p-4 sm:p-5">
              {vehicles.length === 0 ? (
                <EmptyState
                  icon={Truck}
                  title="No vehicles yet"
                  description="Add a vehicle to your fleet and its type shows up here."
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(vehicles.map((v) => v.vehicle_type ?? v.kind))).map((type) => (
                    <span
                      key={type}
                      className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Availability">
            <label className="flex cursor-pointer items-center justify-between gap-2 p-4">
              <span className="text-[11.5px] font-semibold text-slate-700">Accepting new bookings</span>
              <input
                type="checkbox"
                checked={form.is_accepting}
                onChange={(e) => setForm({ ...form, is_accepting: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-brand-700"
              />
            </label>
          </Panel>

          <Panel title="Verification" description="Decided by the Kalika team">
            <div className="space-y-2.5 p-4 text-[11.5px]">
              <Row icon={Phone} label="Phone" value={me.contact_phone ? "On file" : "Not added"} ok={Boolean(me.contact_phone)} />
              <Row
                icon={Globe}
                label="Business"
                value={
                  me.verification === "verified"
                    ? "Verified"
                    : me.verification === "pending"
                      ? "Under review"
                      : me.verification === "rejected"
                        ? "Rejected"
                        : "Not submitted"
                }
                ok={me.verification === "verified"}
              />
              <Row icon={Truck} label="Fleet" value={`${vehicles.length} vehicle(s)`} ok={vehicles.length > 0} />
              {me.verification === "not_submitted" && (
                <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
                  <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Upload your business registration, RC, insurance and permit to{" "}
                  <Link to={TRANSPORTER_ROUTES.invoices} className="font-bold text-brand-700 hover:underline">
                    Invoices &amp; Documents
                  </Link>
                  . Verified transporters win more bookings.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Ratings" description="From completed trips">
            <div className="space-y-1 p-4">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                <span className="font-display text-xl font-extrabold text-forest">
                  {Number(me.rating_avg).toFixed(1)}
                </span>
                <span className="text-[11px] text-slate-500">({me.rating_count} reviews)</span>
              </div>
              <p className="text-[11px] text-slate-500">{me.trips_completed} trips completed</p>
              <Link to={TRANSPORTER_ROUTES.reviews} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                View reviews
              </Link>
            </div>
          </Panel>

          <Panel title="Account">
            <div className="p-4 text-[11.5px] text-slate-600">
              <p className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5 text-slate-400" /> {account?.email ?? "—"}
              </p>
            </div>
          </Panel>
        </aside>
      </div>
    </TransporterLayout>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-slate-600">
        <Icon className="h-3.5 w-3.5 text-slate-400" /> {label}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
          }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Re-export unused-but-intentional helpers for the profile form's vehicle types. */
