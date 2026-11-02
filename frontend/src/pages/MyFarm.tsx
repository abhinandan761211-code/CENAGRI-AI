import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Droplets,
  Filter,
  LandPlot,
  Layers,
  Leaf,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sprout,
  Trash2,
  Wheat,
  X,
} from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { useAuth } from "@/hooks/useAuth";
import { acresToHa, deleteFarm, haToAcres, listFarms, saveFarm } from "@/lib/farms";
import type { Farm } from "@/lib/farms";

/* ── Choices offered in the add/edit form ─────────────────────────────── */

const SOIL_TYPES = [
  "Loamy Soil",
  "Red Soil",
  "Clay Soil",
  "Sandy Soil",
  "Black Soil",
  "Saline Soil",
  "Other",
];

const IRRIGATION_TYPES = [
  "Drip Irrigation",
  "Sprinkler",
  "Canal Irrigation",
  "Borewell",
  "Shallow Tubewell",
  "Rainfed",
  "Other",
];

type FarmForm = {
  name: string;
  location: string;
  area: string;
  soil: string;
  irrigation: string;
  crops: string;
  status: "Active" | "Inactive";
};

const emptyForm: FarmForm = {
  name: "",
  location: "",
  area: "",
  soil: "Loamy Soil",
  irrigation: "Drip Irrigation",
  crops: "",
  status: "Active",
};

/** Comma separated crop input → clean list. */
function splitCrops(value: string): string[] {
  return value
    .split(",")
    .map((crop) => crop.trim())
    .filter(Boolean);
}

/** A farm's status, defaulting to Active when the column is missing. */
const isActive = (farm: Farm) => farm.is_active !== false;

/**
 * My Farm — the farmer's own land records.
 *
 * Replaces the in-dashboard "My Farm" panel with a full page, in the style of
 * the farm-management console: summary tiles, search + status filter, farm
 * cards, an add/edit form and a details dialog.
 *
 * Everything is read from and written to `public.farms` through
 * `@/lib/farms`; there is no local seed data, so what a farmer sees here is
 * exactly what is stored for their account.
 */
export default function MyFarm() {
  const { user, profile, needsRole, needsDetails } = useAuth();
  const navigate = useNavigate();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Active" | "Inactive">("All");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [form, setForm] = useState<FarmForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const details = profile?.details ?? {};
  const locationLine =
    [details.village, details.district].filter(Boolean).join(", ") ||
    details.state ||
    "Location not set";

  /** Load the signed-in farmer's farms. */
  const loadFarms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setFarms(await listFarms());
    } catch (err) {
      const message =
        err instanceof Error && /relation|does not exist/i.test(err.message)
          ? "The farms table is not set up yet. Run database/supabase/schema.sql in Supabase."
          : err instanceof Error
            ? err.message
            : "Could not load your farms.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadFarms();
  }, [user, loadFarms]);

  if (needsRole || needsDetails) {
    return <Navigate to="/complete-profile?next=/my-farm" replace />;
  }

  // Only farmers own farms; anyone else goes back to their own home.
  if (profile?.role && profile.role !== "Farmer") {
    return <Navigate to="/farmer-account" replace />;
  }

  const activeFarms = farms.filter(isActive).length;
  const totalAcres = farms.reduce(
    (sum, farm) => sum + (farm.area_ha != null ? haToAcres(farm.area_ha) : 0),
    0
  );
  const cropVarieties = new Set(
    farms.flatMap((farm) => farm.crops ?? []).filter(Boolean)
  ).size;

  const filteredFarms = useMemo(() => {
    const term = search.trim().toLowerCase();
    return farms.filter((farm) => {
      const matchesSearch =
        !term ||
        farm.name.toLowerCase().includes(term) ||
        (farm.location ?? "").toLowerCase().includes(term) ||
        (farm.crops ?? []).some((crop) => crop.toLowerCase().includes(term));

      const matchesFilter =
        filter === "All" ||
        (filter === "Active" ? isActive(farm) : !isActive(farm));

      return matchesSearch && matchesFilter;
    });
  }, [farms, search, filter]);

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm, location: locationLine === "Location not set" ? "" : locationLine });
    setError("");
    setShowModal(true);
  }

  function openEdit(farm: Farm) {
    setEditingId(farm.id);
    setForm({
      name: farm.name,
      location: farm.location ?? "",
      area: farm.area_ha != null ? String(haToAcres(farm.area_ha)) : "",
      soil: farm.soil_type || "Loamy Soil",
      irrigation: farm.irrigation || "Drip Irrigation",
      crops: (farm.crops ?? []).join(", "),
      status: isActive(farm) ? "Active" : "Inactive",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const acres = Number(form.area);
    if (!form.name.trim() || !form.location.trim()) {
      setError("Farm name and location are required.");
      return;
    }
    if (!Number.isFinite(acres) || acres <= 0) {
      setError("Enter the land area in acres (a positive number).");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await saveFarm(
        {
          name: form.name,
          location: form.location,
          area_ha: acresToHa(acres),
          soil_type: form.soil,
          irrigation: form.irrigation,
          crops: splitCrops(form.crops),
          is_active: form.status === "Active",
        },
        editingId ?? undefined
      );
      await loadFarms();
      setShowModal(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the farm.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this farm?")) return;
    setError("");
    try {
      await deleteFarm(id);
      setSelectedFarm(null);
      await loadFarms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the farm.");
    }
  }

  return (
    <FeatureShell
      title="My Farm"
      description="Manage your farms, land details and agricultural activities in one place."
    >
      <FarmerStats
        items={[
          { label: "Total Farms", value: farms.length, icon: LandPlot, hint: "Land records saved" },
          {
            label: "Total Land Area",
            value: `${Math.round(totalAcres * 10) / 10} Acres`,
            icon: Sprout,
            hint: "Across all farms",
          },
          { label: "Active Farms", value: activeFarms, icon: Leaf, hint: "Currently in use" },
          { label: "Crop Varieties", value: cropVarieties, icon: Wheat, hint: "Distinct crops grown" },
        ]}
      />

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3"
        >
          <p className="text-xs leading-relaxed text-rose-800">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss"
            className="shrink-0 text-rose-500 hover:text-rose-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search + status filter */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 focus-within:border-brand-700 focus-within:bg-slate-100">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search farm name, location or crop…"
            aria-label="Search farms"
            className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="shrink-0 text-slate-500 hover:text-slate-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-slate-500" />
          {(["All", "Active", "Inactive"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${filter === option
                  ? "bg-forest text-forest"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-100"
                }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <FarmerSection
        id="crops"
        title="Your Farms"
        description={`${filteredFarms.length} of ${farms.length} farms shown`}
        icon={LandPlot}
        action={
          <button type="button" onClick={openAdd} className="creator-btn-primary h-9 px-4 text-xs">
            <Plus className="h-4 w-4" /> Add New Farm
          </button>
        }
      >
        {loading ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredFarms.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <LandPlot className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-forest">
              {farms.length === 0 ? "No farms added yet" : "No farms match your search"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              {farms.length === 0
                ? "Add your first farm with its location, land area and crops so advice and alerts can be tailored to it."
                : "Try a different name, location or crop, or clear the status filter."}
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="creator-btn-primary mt-4 h-9 px-4 text-xs"
            >
              <Plus className="h-4 w-4" /> Add Farm
            </button>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredFarms.map((farm) => {
              const acres = farm.area_ha != null ? haToAcres(farm.area_ha) : null;
              const active = isActive(farm);

              return (
                <article
                  key={farm.id}
                  className="overflow-hidden rounded-xl border border-slate-200 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card"
                >
                  <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-emerald-100 to-green-50">
                    <Sprout className="h-10 w-10 text-emerald-600/70" />
                    <span
                      className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${active
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-500"
                        }`}
                    >
                      {active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-forest">{farm.name}</h3>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{farm.location || "Location not set"}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(farm)}
                        title="Edit farm"
                        aria-label={`Edit ${farm.name}`}
                        className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="my-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-100 p-2.5">
                        <LandPlot className="mb-1 h-4 w-4 text-brand-700" />
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">
                          Land Area
                        </p>
                        <p className="text-xs font-bold text-forest">
                          {acres != null ? `${acres} Acres` : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-100 p-2.5">
                        <Droplets className="mb-1 h-4 w-4 text-sky-500" />
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">
                          Irrigation
                        </p>
                        <p className="truncate text-xs font-bold text-forest">
                          {farm.irrigation || "—"}
                        </p>
                      </div>
                    </div>

                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Current Crops
                    </p>
                    <div className="flex min-h-[22px] flex-wrap gap-1.5">
                      {(farm.crops ?? []).length ? (
                        farm.crops!.map((crop) => (
                          <span
                            key={crop}
                            className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
                          >
                            {crop}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-500">No crops added</span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                      <button
                        type="button"
                        onClick={() => setSelectedFarm(farm)}
                        className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 hover:text-brand-700"
                      >
                        View Details <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(farm.id)}
                        title="Delete farm"
                        aria-label={`Delete ${farm.name}`}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </FarmerSection>

      {/* Add / edit farm */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-dark/50 sm:items-center sm:p-4">
          <form
            onSubmit={handleSave}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-slate-100 p-5 shadow-xl sm:max-w-xl sm:rounded-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-forest">
                  {editingId ? "Edit Farm" : "Add New Farm"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Land area is entered in acres and stored for your account only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="farm-name" className="mb-1 block text-xs font-semibold text-slate-200">
                  Farm Name *
                </label>
                <input
                  id="farm-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Main Farm"
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-brand-700"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="farm-location" className="mb-1 block text-xs font-semibold text-slate-200">
                  Location *
                </label>
                <input
                  id="farm-location"
                  required
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Village, District, State"
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-brand-700"
                />
              </div>

              <div>
                <label htmlFor="farm-area" className="mb-1 block text-xs font-semibold text-slate-200">
                  Land Area (Acres) *
                </label>
                <input
                  id="farm-area"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  placeholder="e.g. 2.5"
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-brand-700"
                />
              </div>

              <div>
                <label htmlFor="farm-status" className="mb-1 block text-xs font-semibold text-slate-200">
                  Status
                </label>
                <select
                  id="farm-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as FarmForm["status"] })
                  }
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-brand-700"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label htmlFor="farm-soil" className="mb-1 block text-xs font-semibold text-slate-200">
                  Soil Type
                </label>
                <select
                  id="farm-soil"
                  value={form.soil}
                  onChange={(e) => setForm({ ...form, soil: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-brand-700"
                >
                  {SOIL_TYPES.map((soil) => (
                    <option key={soil} value={soil}>
                      {soil}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="farm-irrigation" className="mb-1 block text-xs font-semibold text-slate-200">
                  Irrigation
                </label>
                <select
                  id="farm-irrigation"
                  value={form.irrigation}
                  onChange={(e) => setForm({ ...form, irrigation: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-brand-700"
                >
                  {IRRIGATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="farm-crops" className="mb-1 block text-xs font-semibold text-slate-200">
                  Crops
                </label>
                <input
                  id="farm-crops"
                  value={form.crops}
                  onChange={(e) => setForm({ ...form, crops: e.target.value })}
                  placeholder="Tomato, Rice, Maize"
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-brand-700"
                />
                <p className="mt-1 text-[11px] text-slate-500">Separate crops with commas.</p>
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn-outline h-9 px-4 text-xs"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="creator-btn-primary h-9 px-4 text-xs disabled:opacity-60">
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Farm"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Farm details */}
      {selectedFarm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-dark/50 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-slate-100 p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700">
                  Farm Details
                </p>
                <h2 className="font-display text-lg font-bold text-forest">{selectedFarm.name}</h2>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {selectedFarm.location || "Location not set"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFarm(null)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="divide-y divide-white/10 rounded-lg border border-slate-200">
              {[
                {
                  label: "Land Area",
                  value:
                    selectedFarm.area_ha != null
                      ? `${haToAcres(selectedFarm.area_ha)} Acres`
                      : "—",
                  icon: LandPlot,
                },
                { label: "Soil Type", value: selectedFarm.soil_type || "—", icon: Layers },
                { label: "Irrigation", value: selectedFarm.irrigation || "—", icon: Droplets },
                {
                  label: "Status",
                  value: isActive(selectedFarm) ? "Active" : "Inactive",
                  icon: Leaf,
                },
                {
                  label: "Crops",
                  value: (selectedFarm.crops ?? []).join(", ") || "None",
                  icon: Wheat,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-brand-700" />
                  <dt className="w-24 shrink-0 text-xs text-slate-500">{label}</dt>
                  <dd className="min-w-0 flex-1 text-xs font-semibold text-forest">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const farm = selectedFarm;
                  setSelectedFarm(null);
                  if (farm) navigate(`/crops?farm=${farm.id}`);
                }}
                className="btn-outline h-9 flex-1 text-xs"
              >
                <Wheat className="h-3.5 w-3.5" /> View crops
              </button>
              <button
                type="button"
                onClick={() => {
                  const farm = selectedFarm;
                  setSelectedFarm(null);
                  if (farm) openEdit(farm);
                }}
                className="btn-outline h-9 flex-1 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Farm
              </button>
              <button
                type="button"
                onClick={() => navigate("/advisory")}
                className="creator-btn-primary h-9 flex-1 text-xs"
              >
                <Sprout className="h-3.5 w-3.5" /> Get Crop Advice
              </button>
            </div>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
