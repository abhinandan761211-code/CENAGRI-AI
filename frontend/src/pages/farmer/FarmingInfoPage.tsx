import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { LandPlot, MapPin, Sprout, Tractor, UserCog } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  ErrorNote,
  GhostButton,
  Input,
  num,
  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  Stat,
  SuccessNote,
  Table,
  TableWrap,
  Td,
  Th,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { listFarms, haToAcres } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { farmerError, listSoilTests } from "@/lib/farmer";
import type { SoilTest } from "@/lib/farmer";

/**
 * Farming Information — the answers other features rely on: land size, crops,
 * irrigation source, years of experience and holdings, plus the farm and soil
 * records it all comes from.
 *
 * The profil answers are edited here and saved to `profiles.details`; the
 * per-field figures are read live from `farms` and `soil_tests`, so nothing is
 * typed twice.
 */

const EXPERIENCE_OPTIONS = ["Less than 1 year", "1–3 years", "3–5 years", "5–10 years", "10+ years"];
const IRRIGATION_OPTIONS = ["Rain-fed only", "Canal", "Deep tubewell", "Shallow tubewell", "River pump", "Drip", "Other"];
const CROP_PREFERENCES = ["Paddy", "Wheat", "Potato", "Mustard", "Jute", "Maize", "Onion", "Vegetables", "Pulses", "Oilseeds"];

export default function FarmingInfoPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast, showToast } = useToast();
  const details = profile?.details ?? {};

  const [farms, setFarms] = useState<Farm[]>([]);
  const [soil, setSoil] = useState<SoilTest[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    land_size: details.land_size ?? "",
    main_crops: details.main_crops ?? "",
    irrigation: details.irrigation ?? "",
    experience: details.experience ?? "",
    organic: details.organic === "true",
    tenants: details.tenants ?? "",
  });

  useEffect(() => {
    if (!user) return;
    void listFarms().then(setFarms).catch(() => setFarms([]));
    void listSoilTests().then(setSoil).catch(() => setSoil([]));
  }, [user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const nextDetails = {
        ...details,
        land_size: form.land_size,
        main_crops: form.main_crops,
        irrigation: form.irrigation,
        experience: form.experience,
        organic: form.organic ? "true" : "false",
        tenants: form.tenants,
      };
      const { error: err } = await supabase.from("profiles").update({ details: nextDetails }).eq("id", user.id);
      if (err) throw err;
      await supabase.auth.updateUser({ data: { details: nextDetails } });
      await refreshProfile();
      setSaved(true);
      showToast("Farming information saved");
    } catch (err) {
      setError(farmerError(err, "Could not save your farming information."));
    } finally {
      setSaving(false);
    }
  }

  const totalAcres = farms.reduce((sum, f) => sum + (f.area_ha != null ? haToAcres(f.area_ha) : 0), 0);
  const farmName = new Map(farms.map((f) => [f.id, f.name]));

  return (
    <FarmerShell>
      <PageHeader
        icon={Tractor}
        title="Farming Information"
        description="What you grow, how you water it and how long you have farmed — this is the context crop advice, alerts and mandi selection use."
        actions={
          <Link to="/my-farm" className="creator-btn-ghost inline-flex h-9 items-center gap-1.5 px-3.5 text-xs">
            <MapPin className="h-3.5 w-3.5" /> Manage farms
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Farms" value={farms.length} icon={LandPlot} hint="Land records" />
        <Stat label="Total area" value={farms.length ? `${num(totalAcres)} ac` : "—"} icon={LandPlot} tone="teal" hint="From My Farm" />
        <Stat label="Crops grown" value={farms.flatMap((f) => f.crops ?? []).length || "—"} icon={Sprout} tone="green" hint="Across farms" />
        <Stat label="Soil tests" value={soil.length} icon={Sprout} tone="blue" hint="Records on file" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Your farming answers" icon={UserCog}>
          <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Total land (acres)
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.land_size}
                onChange={(e) => setForm({ ...form, land_size: e.target.value })}
                placeholder="e.g. 2.5"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Years of farming
              </span>
              <Select value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
                <option value="">Not set</option>
                {EXPERIENCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Main irrigation source
              </span>
              <Select value={form.irrigation} onChange={(e) => setForm({ ...form, irrigation: e.target.value })}>
                <option value="">Not set</option>
                {IRRIGATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Land type
              </span>
              <Input
                value={form.tenants}
                onChange={(e) => setForm({ ...form, tenants: e.target.value })}
                placeholder="Owned, leased, sharecropped…"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Crops you grow
              </span>
              <Input
                value={form.main_crops}
                onChange={(e) => setForm({ ...form, main_crops: e.target.value })}
                placeholder="Paddy, Potato, Mustard"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {CROP_PREFERENCES.map((crop) => {
                  const active = form.main_crops.toLowerCase().includes(crop.toLowerCase());
                  return (
                    <button
                      key={crop}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        const list = form.main_crops
                          .split(",")
                          .map((c) => c.trim())
                          .filter(Boolean);
                        const next = active ? list.filter((c) => c.toLowerCase() !== crop.toLowerCase()) : [...list, crop];
                        setForm({ ...form, main_crops: next.join(", ") });
                      }}
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                        active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 text-slate-600 hover:border-brand-300"
                      }`}
                    >
                      {crop}
                    </button>
                  );
                })}
              </div>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.organic}
                onChange={(e) => setForm({ ...form, organic: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
              />
              I farm organically (no synthetic fertiliser)
            </label>

            {error && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
            {saved && <div className="sm:col-span-2"><SuccessNote message="Saved. Advice and alerts now use these answers." /></div>}

            <div className="flex justify-end gap-2 sm:col-span-2">
              <GhostButton
                type="button"
                onClick={() =>
                  setForm({
                    land_size: details.land_size ?? "",
                    main_crops: details.main_crops ?? "",
                    irrigation: details.irrigation ?? "",
                    experience: details.experience ?? "",
                    organic: details.organic === "true",
                    tenants: details.tenants ?? "",
                  })
                }
                disabled={saving}
              >
                Reset
              </GhostButton>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save information"}
              </PrimaryButton>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Farm holdings" icon={LandPlot}>
            {farms.length === 0 ? (
              <p className="px-4 py-6 text-[11px] text-slate-500">
                No farms yet.{" "}
                <Link to="/my-farm" className="font-semibold text-brand-700 hover:underline">
                  Add one
                </Link>
                .
              </p>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Farm</Th>
                      <Th className="text-right">Area</Th>
                      <Th>Soil</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {farms.map((farm) => (
                      <tr key={farm.id}>
                        <Td>
                          <span className="font-semibold text-forest">{farm.name}</span>
                          <span className="block text-[10px] text-slate-500">{farm.location ?? "Location not set"}</span>
                        </Td>
                        <Td className="text-right tabular-nums">
                          {farm.area_ha != null ? `${num(haToAcres(farm.area_ha))} ac` : "—"}
                        </Td>
                        <Td>{farm.soil_type ?? "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Panel>

          <Panel title="Latest soil reading per field" icon={Sprout}>
            {soil.length === 0 ? (
              <p className="px-4 py-6 text-[11px] text-slate-500">
                No soil tests recorded.{" "}
                <Link to="/soil-health" className="font-semibold text-brand-700 hover:underline">
                  Add a soil test
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {farms.map((farm) => {
                  const latest = soil.find((t) => t.farm_id === farm.id);
                  return (
                    <li key={farm.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="truncate text-[11px] font-semibold text-forest">{farmName.get(farm.id)}</span>
                      {latest ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Chip tone="slate">pH {latest.ph != null ? num(latest.ph, 2) : "—"}</Chip>
                          <Chip tone="green">{latest.soil_category ?? "Tested"}</Chip>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Not tested</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Toast message={toast} />
    </FarmerShell>
  );
}
