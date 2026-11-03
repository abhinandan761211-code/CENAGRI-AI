import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Droplets,
  ImagePlus,
  LandPlot,
  Leaf,
  MapPin,
  Pencil,
  Plus,
  Sprout,
  Trash2,
  Wheat,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  inr,
  Input,
  LoadingRows,
  Modal,
  num,
  PageHeader,
  Panel,
  PrimaryButton,
  SearchBox,
  Select,
  Stat,
  Textarea,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { acresToHa, deleteFarm, haToAcres, listFarms, saveFarm } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import { listActivities, farmerError } from "@/lib/farmer";
import type { FarmActivity } from "@/lib/farmer";

/**
 * My Farm — several farms per account, each with location, area and unit,
 * soil type, irrigation source, a photograph and its own crop list.
 *
 * The farm row already existed (`farms` in schema.sql); this page finally lets
 * the farmer keep several of them and edit every detail, which every other
 * feature (crops, calendar, weather, expenses) attaches to.
 */

const SOIL_TYPES = [
  "Alluvial",
  "Clay",
  "Clay loam",
  "Sandy",
  "Sandy loam",
  "Loam",
  "Red soil",
  "Black soil",
  "Laterite",
  "Saline",
];

const IRRIGATION_SOURCES = [
  "Rain-fed only",
  "Canal",
  "Deep tubewell",
  "Shallow tubewell",
  "River pump",
  "Drip",
  "Sprinkler",
  "Other",
];

const AREA_UNITS = ["acres", "bigha", "hectares", "katha"] as const;
type AreaUnit = (typeof AREA_UNITS)[number];

/** One bigha / katha differs by state; these are the common West Bengal values. */
const TO_ACRES: Record<AreaUnit, number> = {
  acres: 1,
  hectares: 2.47105,
  bigha: 0.3306,
  katha: 0.01653,
};

type Draft = {
  id?: string;
  name: string;
  location: string;
  area: string;
  unit: AreaUnit;
  soil_type: string;
  irrigation: string;
  crops: string;
  photo_url: string;
  is_active: boolean;
  notes: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  location: "",
  area: "",
  unit: "acres",
  soil_type: "",
  irrigation: "",
  crops: "",
  photo_url: "",
  is_active: true,
  notes: "",
});

export default function FarmPage() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();

  const details = profile?.details ?? {};
  const defaultLocation = [details.village, details.block, details.district, details.state].filter(Boolean).join(", ");

  const [farms, setFarms] = useState<Farm[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [activities, setActivities] = useState<FarmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Farm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [farmRows, cropRows, activityRows] = await Promise.all([
        listFarms(),
        listCrops().catch(() => []),
        listActivities(50).catch(() => []),
      ]);
      setFarms(farmRows);
      setCrops(cropRows);
      setActivities(activityRows);
    } catch (err) {
      setError(farmerError(err, "Could not load your farms."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const totalAcres = useMemo(
    () => farms.reduce((sum, f) => sum + (f.area_ha != null ? haToAcres(f.area_ha) : 0), 0),
    [farms]
  );

  const cropsByFarm = useMemo(() => {
    const map = new Map<string, Crop[]>();
    for (const crop of crops) {
      if (!crop.farm_id) continue;
      const list = map.get(crop.farm_id) ?? [];
      list.push(crop);
      map.set(crop.farm_id, list);
    }
    return map;
  }, [crops]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return farms.filter((farm) => {
      if (statusFilter === "active" && farm.is_active === false) return false;
      if (statusFilter === "inactive" && farm.is_active !== false) return false;
      if (!q) return true;
      return [farm.name, farm.location, farm.soil_type, ...(farm.crops ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [farms, query, statusFilter]);

  function openNew() {
    setFormError("");
    setDraft({ ...emptyDraft(), location: defaultLocation });
  }

  function openEdit(farm: Farm) {
    setFormError("");
    setDraft({
      id: farm.id,
      name: farm.name,
      location: farm.location ?? "",
      area: farm.area_ha != null ? String(haToAcres(farm.area_ha)) : "",
      unit: "acres",
      soil_type: farm.soil_type ?? "",
      irrigation: farm.irrigation ?? "",
      crops: (farm.crops ?? []).join(", "),
      photo_url: (farm as Farm & { photo_url?: string | null }).photo_url ?? "",
      is_active: farm.is_active !== false,
      notes: (farm as Farm & { notes?: string | null }).notes ?? "",
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) {
      setFormError("Give the farm a name, e.g. “North field”.");
      return;
    }
    const area = draft.area.trim() ? Number(draft.area) : null;
    if (draft.area.trim() && (area === null || Number.isNaN(area) || area <= 0)) {
      setFormError("Enter the land area as a positive number.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const areaHa = area != null ? acresToHa(area * TO_ACRES[draft.unit]) : null;
      const cropList = draft.crops
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      await saveFarm(
        {
          name: draft.name,
          location: draft.location || null,
          area_ha: areaHa,
          soil_type: draft.soil_type || null,
          irrigation: draft.irrigation || null,
          crops: cropList,
          is_active: draft.is_active,
          // Optional photo + notes columns; sent only when the project has
          // them (see `farms` in farmer.sql) so older databases are unaffected.
          ...({ photo_url: draft.photo_url || null, notes: draft.notes || null } as Record<string, unknown>),
        },
        draft.id
      );
      setDraft(null);
      showToast(draft.id ? "Farm updated" : "Farm added");
      await load();
    } catch (err) {
      setFormError(farmerError(err, "Could not save the farm."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteFarm(confirmDelete.id);
      setConfirmDelete(null);
      showToast("Farm deleted");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not delete the farm."));
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={LandPlot}
        title="My Farm"
        description="Every field you farm, with its land area, soil, water source and crops. Everything else in the account is attached to one of these farms."
        actions={
          <PrimaryButton onClick={openNew}>
            <Plus className="h-4 w-4" /> Add farm
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Farms" value={farms.length} icon={LandPlot} hint="Land records saved" />
        <Stat label="Total area" value={`${num(totalAcres)} acres`} icon={Sprout} hint="Across all farms" />
        <Stat
          label="Active farms"
          value={farms.filter((f) => f.is_active !== false).length}
          icon={Leaf}
          tone="teal"
          hint="Currently in use"
        />
        <Stat
          label="Crops on the land"
          value={crops.filter((c) => c.status !== "harvested").length}
          icon={Wheat}
          tone="blue"
          hint="Active crop records"
        />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <Panel flush>
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search farm, location or crop…" label="Search farms" />
          <div className="flex items-center gap-1.5">
            {(["all", "active", "inactive"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                aria-pressed={statusFilter === option}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold capitalize transition ${statusFilter === option ? "bg-forest text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={LandPlot}
            title={farms.length === 0 ? "No farms added yet" : "No farms match this search"}
            body={
              farms.length === 0
                ? "Add your first farm with its location, land area and soil. Crop advice, weather alerts and mandi prices then work for that place."
                : "Try a different name, location or crop, or clear the status filter."
            }
            action={
              farms.length === 0 ? (
                <PrimaryButton onClick={openNew}>
                  <Plus className="h-4 w-4" /> Add farm
                </PrimaryButton>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((farm) => {
              const farmCrops = cropsByFarm.get(farm.id) ?? [];
              const acres = farm.area_ha != null ? haToAcres(farm.area_ha) : null;
              const spent = activities
                .filter((a) => a.farm_id === farm.id && a.cost_inr != null)
                .reduce((sum, a) => sum + Number(a.cost_inr), 0);

              return (
                <article key={farm.id} className="creator-card overflow-hidden">
                  <div className="relative h-28 bg-gradient-to-br from-brand-100 via-brand-50 to-teal-50">
                    {(farm as Farm & { photo_url?: string | null }).photo_url ? (
                      // eslint-disable-next-line jsx-a11y/img-redundant-alt
                      <img
                        src={(farm as Farm & { photo_url?: string | null }).photo_url as string}
                        alt={`${farm.name} photo`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-brand-700/40">
                        <ImagePlus className="h-7 w-7" />
                      </div>
                    )}
                    <div className="absolute right-2 top-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(farm)}
                        aria-label={`Edit ${farm.name}`}
                        className="grid h-7 w-7 place-items-center rounded-md bg-white/90 text-slate-600 shadow-sm hover:text-forest"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(farm)}
                        aria-label={`Delete ${farm.name}`}
                        className="grid h-7 w-7 place-items-center rounded-md bg-white/90 text-rose-600 shadow-sm hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="absolute left-2 top-2">
                      <Chip tone={farm.is_active !== false ? "green" : "slate"}>
                        {farm.is_active !== false ? "Active" : "Inactive"}
                      </Chip>
                    </span>
                  </div>

                  <div className="space-y-2 p-3.5">
                    <div>
                      <h3 className="truncate text-sm font-bold text-forest">{farm.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {farm.location || "Location not set"}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <dt className="text-slate-500">Area</dt>
                        <dd className="font-semibold text-forest">
                          {acres != null ? `${num(acres)} acres` : "Not recorded"}
                        </dd>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <dt className="text-slate-500">Soil</dt>
                        <dd className="truncate font-semibold text-forest">{farm.soil_type || "Not recorded"}</dd>
                      </div>
                      <div className="col-span-2 rounded-md bg-slate-50 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-slate-500">
                          <Droplets className="h-3 w-3" /> Water source
                        </dt>
                        <dd className="font-semibold text-forest">{farm.irrigation || "Not recorded"}</dd>
                      </div>
                    </dl>

                    {farmCrops.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {farmCrops.slice(0, 3).map((crop) => (
                          <Chip key={crop.id} tone="green">
                            {crop.name}
                          </Chip>
                        ))}
                        {farmCrops.length > 3 && <Chip tone="slate">+{farmCrops.length - 3}</Chip>}
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                      <span className="text-slate-500">
                        Logged cost: <strong className="text-slate-700">{spent > 0 ? inr(spent) : "—"}</strong>
                      </span>
                      <Link to="/crops" className="font-bold text-brand-700 hover:underline">
                        Crops
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Add / edit farm ── */}
      {draft && (
        <Modal
          title={draft.id ? "Edit farm" : "Add a farm"}
          description="Land area, soil and water source make advice and alerts specific to this field."
          onClose={() => setDraft(null)}
          wide
          footer={
            <>
              <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="farm-form" disabled={saving}>
                {saving ? "Saving…" : draft.id ? "Save changes" : "Add farm"}
              </PrimaryButton>
            </>
          }
        >
          <form id="farm-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Farm name <span className="text-rose-500">*</span>
              </span>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. North field, Boro land"
                required
                maxLength={120}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Location
              </span>
              <Input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="Village, block, district"
                maxLength={200}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Area</span>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={draft.area}
                  onChange={(e) => setDraft({ ...draft, area: e.target.value })}
                  placeholder="e.g. 2.5"
                  aria-label="Land area"
                />
                <Select
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value as AreaUnit })}
                  aria-label="Area unit"
                  className="w-28 shrink-0"
                >
                  {AREA_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </Select>
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Soil type</span>
              <Select
                value={draft.soil_type}
                onChange={(e) => setDraft({ ...draft, soil_type: e.target.value })}
              >
                <option value="">Not known</option>
                {SOIL_TYPES.map((soil) => (
                  <option key={soil} value={soil}>
                    {soil}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Irrigation source
              </span>
              <Select
                value={draft.irrigation}
                onChange={(e) => setDraft({ ...draft, irrigation: e.target.value })}
              >
                <option value="">Not known</option>
                {IRRIGATION_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Crops grown here
              </span>
              <Input
                value={draft.crops}
                onChange={(e) => setDraft({ ...draft, crops: e.target.value })}
                placeholder="Paddy, Mustard, Potato"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Photo URL (optional)
              </span>
              <Input
                value={draft.photo_url}
                onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })}
                placeholder="https://…"
                type="url"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Field notes
              </span>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Anything worth remembering about this field"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
              />
              This farm is currently in use
            </label>

            {formError && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {/* ── Delete confirmation ── */}
      {confirmDelete && (
        <Modal
          title="Delete this farm?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <GhostButton onClick={() => setConfirmDelete(null)}>Keep it</GhostButton>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                className="h-9 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {saving ? "Deleting…" : "Delete farm"}
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-slate-600">
            <strong className="text-forest">{confirmDelete.name}</strong> will be removed. Crops and activity
            records stay on your account but will no longer point at this farm. This cannot be undone.
          </p>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}


