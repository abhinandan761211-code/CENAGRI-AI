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
import { useLang } from "@/i18n/LanguageContext";
import type { TranslationKey } from "@/i18n/locales/en";
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

/*
 * Values are the English strings already saved in `profiles.details`, so an
 * account created before this page was translated keeps its saved answer. Only
 * the visible label is translated.
 */
const EXPERIENCE_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "Less than 1 year", key: "acc.exp.less1" },
  { value: "1–3 years", key: "acc.exp.1to3" },
  { value: "3–5 years", key: "acc.exp.3to5" },
  { value: "5–10 years", key: "acc.exp.5to10" },
  { value: "10+ years", key: "acc.exp.10plus" },
];
const IRRIGATION_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "Rain-fed only", key: "acc.irr.rainfed" },
  { value: "Canal", key: "acc.irr.canal" },
  { value: "Deep tubewell", key: "acc.irr.deepTubewell" },
  { value: "Shallow tubewell", key: "acc.irr.shallowTubewell" },
  { value: "River pump", key: "acc.irr.riverPump" },
  { value: "Drip", key: "acc.irr.drip" },
  { value: "Other", key: "acc.irr.other" },
];
/* Crop names are matched against government data, so they stay as written. */
const CROP_PREFERENCES = ["Paddy", "Wheat", "Potato", "Mustard", "Jute", "Maize", "Onion", "Vegetables", "Pulses", "Oilseeds"];

export default function FarmingInfoPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast, showToast } = useToast();
  const { t } = useLang();
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
      showToast(t("acc.farming.savedToast"));
    } catch (err) {
      setError(farmerError(err, t("acc.farming.errSave")));
    } finally {
      setSaving(false);
    }
  }

  const totalAcres = farms.reduce((sum, f) => sum + (f.area_ha != null ? haToAcres(f.area_ha) : 0), 0);
  const farmName = new Map(farms.map((f) => [f.id, f.name]));

  return (
    <FarmerShell title={t("acc.farming.title")}>
      <PageHeader
        icon={Tractor}
        title={t("acc.farming.title")}
        description={t("acc.farming.desc")}
        actions={
          <Link to="/my-farm" className="creator-btn-ghost inline-flex h-9 items-center gap-1.5 px-3.5 text-xs">
            <MapPin className="h-3.5 w-3.5" /> {t("acc.farming.manageFarms")}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("acc.farming.statFarms")} value={farms.length} icon={LandPlot} hint={t("acc.farming.hintLandRecords")} />
        <Stat label={t("acc.farming.statArea")} value={farms.length ? `${num(totalAcres)} ac` : "—"} icon={LandPlot} tone="teal" hint={t("acc.farming.hintFromFarm")} />
        <Stat label={t("acc.farming.statCrops")} value={farms.flatMap((f) => f.crops ?? []).length || "—"} icon={Sprout} tone="green" hint={t("acc.farming.hintAcross")} />
        <Stat label={t("acc.farming.statSoil")} value={soil.length} icon={Sprout} tone="blue" hint={t("acc.farming.hintOnFile")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={t("acc.farming.answers")} icon={UserCog}>
          <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.farming.landSize")}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.land_size}
                onChange={(e) => setForm({ ...form, land_size: e.target.value })}
                placeholder={t("acc.farming.landPlaceholder")}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.farming.experience")}
              </span>
              <Select value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
                <option value="">{t("acc.farming.notSet")}</option>
                {EXPERIENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.key)}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.farming.irrigation")}
              </span>
              <Select value={form.irrigation} onChange={(e) => setForm({ ...form, irrigation: e.target.value })}>
                <option value="">{t("acc.farming.notSet")}</option>
                {IRRIGATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.key)}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.farming.landType")}
              </span>
              <Input
                value={form.tenants}
                onChange={(e) => setForm({ ...form, tenants: e.target.value })}
                placeholder={t("acc.farming.landTypePlaceholder")}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.farming.crops")}
              </span>
              <Input
                value={form.main_crops}
                onChange={(e) => setForm({ ...form, main_crops: e.target.value })}
                placeholder={t("acc.farming.cropsPlaceholder")}
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
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 text-slate-600 hover:border-brand-300"
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
              {t("acc.farming.organic")}
            </label>

            {error && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
            {saved && <div className="sm:col-span-2"><SuccessNote message={t("acc.farming.saved")} /></div>}

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
                {t("acc.personal.reset")}
              </GhostButton>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? t("acc.personal.saving") : t("acc.farming.save")}
              </PrimaryButton>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title={t("acc.farming.holdings")} icon={LandPlot}>
            {farms.length === 0 ? (
              <p className="px-4 py-6 text-[11px] text-slate-500">
                {t("acc.farming.noFarms")}{" "}
                <Link to="/my-farm" className="font-semibold text-brand-700 hover:underline">
                  {t("acc.farming.addOne")}
                </Link>
              </p>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t("acc.farming.colFarm")}</Th>
                      <Th className="text-right">{t("acc.farming.colArea")}</Th>
                      <Th>{t("acc.farming.colSoil")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {farms.map((farm) => (
                      <tr key={farm.id}>
                        <Td>
                          <span className="font-semibold text-forest">{farm.name}</span>
                          <span className="block text-[10px] text-slate-500">{farm.location ?? t("acc.profile.locationNotSet")}</span>
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

          <Panel title={t("acc.farming.soilTitle")} icon={Sprout}>
            {soil.length === 0 ? (
              <p className="px-4 py-6 text-[11px] text-slate-500">
                {t("acc.farming.noSoil")}{" "}
                <Link to="/soil-health" className="font-semibold text-brand-700 hover:underline">
                  {t("acc.farming.addSoil")}
                </Link>
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
                          <Chip tone="green">{latest.soil_category ?? t("acc.farming.tested")}</Chip>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">{t("acc.farming.notTested")}</span>
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
