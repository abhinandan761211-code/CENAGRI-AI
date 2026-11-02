import { useEffect, useState } from "react";
import {
  BellRing,
  Check,
  MapPin,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { ErrorNotice, Field, Loading, Panel, inputClass } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeTransporterError,
  ensureTransporterProfile,
  listFleet,
  saveTransporterProfile,
} from "@/lib/transporter";
import type { FleetVehicle, TransporterProfile } from "@/lib/transporter";

/**
 * Settings.
 *
 * Operating preferences only — the things that decide whether you are offered
 * work. Messaging, notifications and security belong to the shared CenAGRI
 * account, so this screen points at them instead of duplicating them.
 */
export default function TransporterSettings() {
  const D = describeTransporterError;

  const profile = useWorkerData<TransporterProfile>(() => ensureTransporterProfile(), [], D);
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);

  const [accepting, setAccepting] = useState(true);
  const [districts, setDistricts] = useState("");
  const [experience, setExperience] = useState("0");
  const [loaded, setLoaded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = profile.data;
    if (!p || loaded) return;
    setAccepting(p.is_accepting);
    setDistricts((p.service_districts ?? []).join(", "));
    setExperience(String(p.experience_years ?? 0));
    setLoaded(true);
  }, [profile.data, loaded]);

  async function handleSave() {
    const p = profile.data;
    if (!p) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await saveTransporterProfile({
        business_name: p.business_name,
        about: p.about,
        contact_phone: p.contact_phone,
        service_districts: districts
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
        service_categories: p.service_categories,
        experience_years: Number(experience) || 0,
        operating_since: p.operating_since,
        is_accepting: accepting,
      });
      setSaved(true);
      profile.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setSaving(false);
    }
  }

  if (profile.state === "loading" || !loaded) {
    return (
      <TransporterLayout title="Settings">
        <Loading label="Loading settings…" />
      </TransporterLayout>
    );
  }

  if (profile.state === "error") {
    return (
      <TransporterLayout title="Settings">
        <ErrorNotice message={profile.error} onRetry={profile.reload} />
      </TransporterLayout>
    );
  }

  const vehicles = fleet.data ?? [];

  return (
    <TransporterLayout
      title="Settings"
      subtitle="How you want to receive work"
      action={
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-800">
          Settings saved.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Receiving work" description="Controls whether you appear available for bookings">
          <div className="space-y-3 p-4 sm:p-5">
            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
              <span>
                <span className="block text-[12px] font-semibold text-forest">Accepting new bookings</span>
                <span className="mt-0.5 block text-[10.5px] text-slate-500">
                  Turn this off when your fleet is fully committed or you are away.
                </span>
              </span>
              <input
                type="checkbox"
                checked={accepting}
                onChange={(e) => setAccepting(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-700"
              />
            </label>

            <Field label="Service districts" hint="Comma separated. Used to match requests near you.">
              <input
                value={districts}
                onChange={(e) => setDistricts(e.target.value)}
                className={inputClass}
                placeholder="e.g. Supaul, Madhepura, Saharsa"
              />
            </Field>

            <Field label="Years of experience">
              <input
                type="number"
                min={0}
                max={60}
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Fleet" description="Vehicles currently listed">
          <div className="space-y-2 p-4 sm:p-5">
            {vehicles.length === 0 ? (
              <p className="text-[11.5px] text-slate-500">No vehicles added yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {vehicles.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate font-semibold text-slate-700">
                        {v.registration_no ?? v.vehicle_type}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${
                        v.available ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {v.available ? "Available" : "Busy"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to={TRANSPORTER_ROUTES.vehicles}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-3 w-3" /> Manage fleet
            </Link>
          </div>
        </Panel>

        <Panel title="Related pages" description="Shared with your CenAGRI account">
          <ul className="divide-y divide-slate-100">
            <li>
              <Link
                to={TRANSPORTER_ROUTES.messages}
                className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <BellRing className="h-3.5 w-3.5 text-slate-400" /> Messages with requesters
              </Link>
            </li>
            <li>
              <Link
                to={TRANSPORTER_ROUTES.invoices}
                className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Check className="h-3.5 w-3.5 text-slate-400" /> Invoices &amp; documents
              </Link>
            </li>
            <li>
              <Link
                to={TRANSPORTER_ROUTES.profile}
                className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Business profile &amp; verification
              </Link>
            </li>
            <li>
              <Link
                to={TRANSPORTER_ROUTES.availability}
                className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <MapPin className="h-3.5 w-3.5 text-slate-400" /> Availability &amp; schedule
              </Link>
            </li>
          </ul>
        </Panel>

        <Panel title="Privacy" description="What other users can see">
          <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600">
            <li className="flex gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              Requesters you have a booking with see your business name, rating and contact phone.
            </li>
            <li className="flex gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              Your uploaded documents are private to you and authorised reviewers.
            </li>
            <li className="flex gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              Trip position is shared only while a trip is active and only when you press share.
            </li>
          </ul>
        </Panel>
      </div>
    </TransporterLayout>
  );
}
