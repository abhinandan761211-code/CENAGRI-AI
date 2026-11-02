import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CloudSun,
  Droplets,
  FlaskConical,
  Heart,
  ImagePlus,
  LandPlot,
  Leaf,
  LineChart,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sprout,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { useAuth } from "@/hooks/useAuth";
import { listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import {
  averageHealth,
  daysSince,
  daysToHarvest,
  deleteCrop,
  growthStage,
  healthTrend,
  isDemoCrop,
  listCrops,
  resolveCropPhoto,
  saveCrop,
  seasonProgress,
  uploadCropPhoto,
} from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import {
  COMMON_CROPS,
  STATUS_META,
  cropEmoji,
  healthColour,
  healthLabel,
  profileFor,
} from "@/lib/cropProfiles";
import type { CropStatus } from "@/lib/cropProfiles";
import { acresToHa, haToAcres } from "@/lib/farms";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const TABS = ["Overview", "Growth Details", "Care Tips", "Alerts"] as const;
type Tab = (typeof TABS)[number];

/** YYYY-MM-DD in local time — `toISOString()` would shift the day by TZ. */
function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type CropForm = {
  name: string;
  variety: string;
  farmId: string;
  area: string;
  plantedOn: string;
  growthDays: string;
  health: string;
  status: CropStatus;
  nextAction: string;
  nextActionOn: string;
};

function emptyForm(farmId = ""): CropForm {
  return {
    name: "",
    variety: "",
    farmId,
    area: "",
    plantedOn: todayISO(),
    growthDays: "120",
    health: "90",
    status: "healthy",
    nextAction: "",
    nextActionOn: "",
  };
}

/** Next-action suggestions, per growth stage. */
function careTips(crop: Crop): { title: string; body: string; icon: typeof Droplets }[] {
  const stage = growthStage(profileFor(crop.name).stages, seasonProgress(crop));
  return [
    {
      title: "Irrigation",
      body:
        stage === "Maturity" || stage === "Harvest Ready"
          ? "Stop irrigation about 10 days before harvest so the grain dries evenly."
          : "Water in the early morning; skip if more than 10 mm rain is forecast in the next 24 hours.",
      icon: Droplets,
    },
    {
      title: "Nutrition",
      body:
        crop.next_action
          ? `Next step on your plan: ${crop.next_action}.`
          : "Split the nitrogen dose across the season instead of a single application.",
      icon: Sprout,
    },
    {
      title: "Pest watch",
      body: "Check the underside of leaves twice a week — early spotting is what keeps treatment cheap.",
      icon: Stethoscope,
    },
  ];
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function CropManagement() {
  const { user, profile, needsRole, needsDetails } = useAuth();
  const [params, setParams] = useSearchParams();
  const farmFilter = params.get("farm");

  const [crops, setCrops] = useState<Crop[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CropForm>(emptyForm());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Signed URLs for every crop photo, keyed by stored path. */
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Crops are the point of this page, so they alone decide whether it can
      // load. A farms table that is not set up must not take the crops down
      // with it (that used to leave the page stuck on its skeleton).
      const nextCrops = await listCrops();
      const nextFarms = await listFarms().catch(() => [] as Farm[]);
      setCrops(nextCrops);
      setFarms(nextFarms);

      // Sign each photo once, in parallel. Signing is a nicety: a missing
      // bucket, an unconfigured client or a stored external URL must never
      // fail the whole page, so each signing failure just yields null.
      const paths = nextCrops.map((c) => c.image_url).filter((p): p is string => Boolean(p));
      const resolved = await Promise.all(
        paths.map((p) => resolveCropPhoto(p).catch(() => null))
      );
      const map: Record<string, string> = {};
      paths.forEach((path, i) => {
        if (resolved[i]) map[path] = resolved[i]!;
      });
      setPhotoUrls(map);

      setSelectedId((current) => {
        if (current && nextCrops.some((c) => c.id === current)) return current;
        return nextCrops[0]?.id ?? null;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load your crops.";
      setError(
        /relation|does not exist/i.test(message)
          ? "The crops table is not set up yet. Run database/supabase/schema.sql in Supabase."
          : message
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void load();
      return;
    }
    // Signed out (or auth still settling): never leave the skeleton spinning
    // forever — drop out of loading and let the session redirect take over.
    setLoading(false);
  }, [user, load]);

  if (needsRole || needsDetails) {
    return <Navigate to="/complete-profile?next=/crops" replace />;
  }
  if (profile?.role && profile.role !== "Farmer") {
    return <Navigate to="/farmer-account" replace />;
  }

  /* ── Derived values ── */

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return crops.filter((crop) => {
      const matchesFarm = !farmFilter || crop.farm_id === farmFilter;
      const matchesTerm =
        !term ||
        crop.name.toLowerCase().includes(term) ||
        (crop.variety ?? "").toLowerCase().includes(term);
      return matchesFarm && matchesTerm;
    });
  }, [crops, search, farmFilter]);

  const selected = visible.find((c) => c.id === selectedId) ?? visible[0] ?? null;

  const activeFarms = farms.filter((f) => f.is_active !== false);
  const totalHa = crops.reduce((sum, crop) => sum + (crop.area_ha ?? 0), 0);
  const avgHealth = averageHealth(crops);

  /* ── Form actions ── */

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm(farms[0]?.id ?? ""), plantedOn: todayISO() });
    setPhotoFile(null);
    setPhotoPreview("");
    setError("");
    setShowForm(true);
  }

  function openEdit(crop: Crop) {
    setEditingId(crop.id);
    setForm({
      name: crop.name,
      variety: crop.variety ?? "",
      farmId: crop.farm_id ?? "",
      area: crop.area_ha != null ? String(haToAcres(crop.area_ha)) : "",
      plantedOn: crop.planted_on,
      growthDays: String(crop.growth_days),
      health: String(crop.health),
      status: crop.status,
      nextAction: crop.next_action ?? "",
      nextActionOn: crop.next_action_on ?? "",
    });
    setPhotoFile(null);
    setPhotoPreview(crop.image_url ? photoUrls[crop.image_url] ?? "" : "");
    setError("");
    setShowForm(true);
  }

  /** Keep the season length in step with the crop name unless it was edited. */
  function chooseCrop(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      growthDays:
        prev.growthDays === String(profileFor(prev.name).growthDays)
          ? String(profileFor(name).growthDays)
          : prev.growthDays,
    }));
  }

  function choosePhoto(file: File | null) {
    setPhotoFile(file);
    if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (editingId && isDemoCrop({ id: editingId })) {
      return setError("This is a preview crop. Run database/supabase/schema.sql to save real crops.");
    }
    if (!form.name.trim()) return setError("Pick or type a crop name.");
    const acres = Number(form.area);
    if (form.area && (!Number.isFinite(acres) || acres <= 0)) {
      return setError("Enter the planted area in acres as a positive number.");
    }
    const days = Number(form.growthDays);
    if (!Number.isFinite(days) || days <= 0) return setError("Season length must be a positive number of days.");

    setSaving(true);
    setError("");
    try {
      let imagePath: string | undefined;
      if (photoFile) imagePath = await uploadCropPhoto(photoFile);

      await saveCrop(
        {
          name: form.name,
          variety: form.variety || null,
          farm_id: form.farmId || null,
          area_ha: form.area ? acresToHa(acres) : null,
          planted_on: form.plantedOn,
          growth_days: Math.round(days),
          health: Number(form.health) || 0,
          status: form.status,
          next_action: form.nextAction || null,
          next_action_on: form.nextActionOn || null,
          ...(imagePath !== undefined && { image_url: imagePath }),
        },
        editingId ?? undefined
      );

      await load();
      setShowForm(false);
      setPhotoFile(null);
      setPhotoPreview("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the crop.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(crop: Crop) {
    if (isDemoCrop(crop)) {
      setError("Preview crops cannot be deleted. Run database/supabase/schema.sql to manage real crops.");
      return;
    }
    if (!window.confirm(`Delete ${crop.name}? This also removes its history from this dashboard.`)) {
      return;
    }
    setError("");
    try {
      await deleteCrop(crop.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the crop.");
    }
  }

  /* ── Render ── */

  return (
    <FeatureShell
      title="Crop Management"
      description="Manage your crops, get AI-powered insights, and optimize your farming practices."
    >
      {farmFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-700/25 bg-brand-50 px-4 py-2.5">
          <p className="text-xs text-slate-200">
            Showing crops for{" "}
            <span className="font-semibold text-forest">
              {farms.find((f) => f.id === farmFilter)?.name ?? "this farm"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-slate-100"
          >
            <X className="h-3 w-3" /> Clear filter
          </button>
        </div>
      )}

      <FarmerStats
        items={[
          {
            label: "Total Crops",
            value: crops.length,
            icon: Sprout,
            hint: `${crops.filter((c) => c.status !== "harvested").length} in the field`,
          },
          {
            label: "Active Farms",
            value: activeFarms.length,
            icon: LandPlot,
            hint: `${farms.length} land records`,
          },
          {
            label: "Total Area",
            value: `${Math.round(totalHa * 10) / 10} Ha`,
            icon: Leaf,
            hint: cropAreaHint(crops),
          },
          {
            label: "Avg. Crop Health",
            value: crops.length ? `${avgHealth}%` : "—",
            icon: Heart,
            hint: crops.length ? healthLabel(avgHealth) : "Add a crop to begin",
          },
        ]}
      />

      {crops.length > 0 && isDemoCrop(crops[0]) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Preview
          </span>
          <p className="text-xs leading-relaxed text-amber-800">
            Showing sample crops because the <code className="rounded bg-slate-100 px-1">crops</code> table does
            not exist yet. Run <code className="rounded bg-slate-100 px-1">database/supabase/schema.sql</code> to
            start recording your own.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3"
        >
          <p className="text-xs leading-relaxed text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss"
            className="shrink-0 text-rose-300 hover:text-rose-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="h-[420px] animate-pulse rounded-xl bg-slate-100" />
          <div className="h-[420px] animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : crops.length === 0 ? (
        <EmptyState onAdd={openAdd} hasFarms={farms.length > 0} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* ── My Crops ── */}
          <FarmerSection
            id="my-crops"
            className="order-2 lg:order-1"
            title="My Crops"
            description={`${visible.length} of ${crops.length} shown`}
            icon={Sprout}
            action={
              <button
                type="button"
                onClick={openAdd}
                className="creator-btn-primary h-8 gap-1 px-3 text-[11px]"
              >
                <Plus className="h-3.5 w-3.5" /> Add Crop
              </button>
            }
          >
            <div className="border-b border-slate-200 p-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 focus-within:border-brand-700">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search crops…"
                  aria-label="Search crops"
                  className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="shrink-0 text-slate-500 hover:text-slate-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <ul className="divide-y divide-white/5">
              {visible.length === 0 && (
                <li className="px-4 py-8 text-center text-xs text-slate-500">
                  No crops match “{search}”.
                </li>
              )}
              {visible.map((crop) => {
                const meta = STATUS_META[crop.status];
                const active = selected?.id === crop.id;
                return (
                  <li key={crop.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(crop.id);
                        setTab("Overview");
                      }}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition ${active
                        ? "border-brand-700 bg-brand-50"
                        : "border-transparent hover:bg-slate-100"
                        }`}
                    >
                      <CropThumb crop={crop} url={crop.image_url ? photoUrls[crop.image_url] : null} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-forest">{crop.name}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {crop.area_ha != null ? `${Math.round(crop.area_ha * 10) / 10} Ha` : "Area not set"}
                          {" • "}Planted {formatDate(crop.planted_on)}
                        </p>
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 ${active ? "text-brand-700" : "text-slate-600"}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </FarmerSection>

          {/* ── Selected crop ── */}
          {selected && (
            <div className="order-1 min-w-0 space-y-4 lg:order-2">
              <CropDetail crop={selected} photo={selected.image_url ? photoUrls[selected.image_url] ?? null : null} />

              {/* Tabs */}
              <div role="tablist" aria-label="Crop details" className="flex gap-1 overflow-x-auto border-b border-slate-200">
                {TABS.map((name) => (
                  <button
                    key={name}
                    role="tab"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                    className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition ${tab === name
                      ? "border-brand-700 text-forest"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {tab === "Overview" && <OverviewTab crop={selected} />}
              {tab === "Growth Details" && <GrowthTab crop={selected} />}
              {tab === "Care Tips" && <TipsTab crop={selected} />}
              {tab === "Alerts" && <AlertsTab crop={selected} />}

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => openEdit(selected)} className="btn-outline h-9 gap-1.5 px-4 text-xs">
                  <Pencil className="h-3.5 w-3.5" /> Edit Crop
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(selected)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-400/30 px-4 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
                <p className="ml-auto text-[11px] text-slate-500">
                  Recorded {daysSince(selected.planted_on)} days ago
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <CropFormDialog
          form={form}
          setForm={setForm}
          farms={farms}
          editing={Boolean(editingId)}
          saving={saving}
          error={error}
          photoPreview={photoPreview}
          fileRef={fileRef}
          onChooseCrop={chooseCrop}
          onChoosePhoto={choosePhoto}
          onSubmit={handleSave}
          onClose={() => {
            setShowForm(false);
            setPhotoFile(null);
            setPhotoPreview("");
          }}
        />
      )}
    </FeatureShell>
  );
}



function cropAreaHint(crops: Crop[]) {
  const acres = crops.reduce((sum, crop) => sum + (crop.area_ha != null ? haToAcres(crop.area_ha) : 0), 0);
  return crops.length ? `≈ ${Math.round(acres * 10) / 10} acres planted` : "No area recorded yet";
}

/** "in 7 days" / "due today" / "overdue by 2 days" for a YYYY-MM-DD date. */
function dueLabel(iso: string): string {
  const due = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(due.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return `overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;
  if (days === 0) return "due today";
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function CropThumb({ crop, url }: { crop: Crop; url: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;

  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-emerald-900/60 to-emerald-700/30 ring-1 ring-white/10">
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-lg" aria-hidden="true">
          {cropEmoji(crop.name)}
        </span>
      )}
    </span>
  );
}

function CropDetail({ crop, photo }: { crop: Crop; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  const meta = STATUS_META[crop.status];
  const showImage = photo && !failed;

  return (
    <section className="creator-card relative overflow-hidden">
      <div className="relative h-40 sm:h-48">
        {showImage ? (
          <img src={photo} alt={`${crop.name} field`} onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#0f2a20] via-[#123524] to-[#16C784]/25">
            <span className="text-5xl opacity-80" aria-hidden="true">
              {cropEmoji(crop.name)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070d14] via-[#070d14]/35 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-forest drop-shadow">
                {crop.name}
              </h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.badge}`}>
                {meta.label}
              </span>
            </div>
            {crop.variety && <p className="mt-0.5 text-xs text-slate-600">{crop.variety}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <LandPlot className="h-3.5 w-3.5" />
                {crop.area_ha != null ? `${Math.round(crop.area_ha * 10) / 10} Hectares` : "Area not set"}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Planted {formatDate(crop.planted_on)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Circular health gauge, drawn with plain SVG so it scales cleanly. */
function HealthRing({ value, label }: { value: number; label: string }) {
  const size = 132;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
  const colour = healthColour(value);

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Crop health ${value}%`}
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize="26"
          fontWeight="800"
        >
          {value}%
        </text>
      </svg>
      <span
        className="mt-2 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
        style={{ color: colour, background: `${colour}1f` }}
      >
        {label}
      </span>
    </div>
  );
}

/** Weekly growth trend, as an inline SVG line chart. */
function TrendChart({ points }: { points: { label: string; value: number }[] }) {
  const w = 520;
  const h = 200;
  const padX = 34;
  const padY = 18;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const x = (i: number) => padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padY + innerH - (v / 100) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${padY + innerH} L${x(0)},${padY + innerH} Z`;
  const last = points[points.length - 1]?.value ?? 0;
  const colour = healthColour(last);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label="Weekly crop health trend">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.35" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line x1={padX} x2={w - padX} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          <text x={padX - 8} y={y(tick)} textAnchor="end" dominantBaseline="central" fontSize="10" fill="#64748b">
            {tick}%
          </text>
        </g>
      ))}

      <path d={area} fill="url(#trendFill)" />
      <path d={line} fill="none" stroke={colour} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill="#0b1018" stroke={colour} strokeWidth="2.5" />
          <text x={x(i)} y={h - 2} textAnchor="middle" fontSize="10" fill="#64748b">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function OverviewTab({ crop }: { crop: Crop }) {
  const profile = profileFor(crop.name);
  const progress = seasonProgress(crop);
  const stage = growthStage(profile.stages, progress);
  const remaining = daysToHarvest(crop);
  const trend = healthTrend(crop);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="creator-card p-4">
          <h3 className="text-sm font-bold text-forest">Crop Health</h3>
          <div className="mt-3">
            <HealthRing value={crop.health} label={healthLabel(crop.health)} />
          </div>
        </div>

        <div className="creator-card flex flex-col p-4">
          <h3 className="text-sm font-bold text-forest">Growth Stage</h3>
          <div className="flex flex-1 flex-col items-center justify-center py-3">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-700/12 text-brand-700">
              <Sprout className="h-7 w-7" />
            </span>
            <p className="mt-2 text-center text-sm font-bold text-forest">{stage}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Day {daysSince(crop.planted_on)} of {crop.growth_days}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-700"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">{Math.round(progress * 100)}% of the season</p>
          </div>
        </div>

        <div className="creator-card p-4">
          <h3 className="text-sm font-bold text-forest">Next Action</h3>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-forest">
                {crop.next_action ?? "No action scheduled"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {crop.next_action
                  ? crop.next_action_on
                    ? `${formatDate(crop.next_action_on)} · ${dueLabel(crop.next_action_on)}`
                    : "Date not set"
                  : `Harvest due in ${remaining} ${remaining === 1 ? "day" : "days"}`}
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-lg bg-slate-100 p-2.5 text-[11px] leading-relaxed text-slate-400">
            {crop.status === "at_risk"
              ? "This crop is flagged at risk — treat the alert below before the next irrigation."
              : crop.status === "monitor"
                ? "Slightly off track. Watch the trend before the next dose."
                : "On track for the season. Keep the schedule below."}
          </p>
        </div>
      </div>

      <FarmerSection title="Growth Trend" description="Crop health by week this season" icon={LineChart}>
        <div className="p-4">
          <TrendChart points={trend} />
        </div>
      </FarmerSection>
    </div>
  );
}

function GrowthTab({ crop }: { crop: Crop }) {
  const profile = profileFor(crop.name);
  const progress = seasonProgress(crop);
  let upto = 0;

  return (
    <FarmerSection title="Growth Stages" description={`${crop.name} · ${crop.growth_days} day season`} icon={Sprout}>
      <ol className="space-y-2 p-4">
        {profile.stages.map((stage, index) => {
          const start = upto;
          upto += stage.share;
          const done = progress >= upto;
          const current = !done && progress > start;

          return (
            <li
              key={`${stage.name}-${index}`}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${current
                ? "border-brand-700/40 bg-brand-50"
                : "border-slate-200 bg-slate-100[0.03]"
                }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${done || current ? "bg-brand-700 text-forest" : "bg-slate-100 text-slate-400"
                  }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-forest">{stage.name}</p>
                <p className="text-[11px] text-slate-400">
                  Day {Math.round(start * crop.growth_days)}–{Math.round(upto * crop.growth_days)}
                </p>
              </div>
              {current && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                  Now
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </FarmerSection>
  );
}

function TipsTab({ crop }: { crop: Crop }) {
  return (
    <FarmerSection title="Care Tips" description="Guidance for the current stage" icon={Stethoscope}>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {careTips(crop).map(({ title, body, icon: Icon }) => (
          <div key={title} className="rounded-lg border border-slate-200 bg-slate-100[0.03] p-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700/12 text-brand-700">
              <Icon className="h-4 w-4" />
            </span>
            <p className="mt-2 text-xs font-bold text-forest">{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{body}</p>
          </div>
        ))}
      </div>
    </FarmerSection>
  );
}

function AlertsTab({ crop }: { crop: Crop }) {
  const alerts: { title: string; body: string; tone: string; icon: typeof Bell }[] = [];

  if (crop.status === "at_risk") {
    alerts.push({
      title: "Health below safe level",
      body: "Recorded health is in the danger band. Check for pests or disease before the next irrigation.",
      tone: "border-rose-400/30 bg-rose-500/10 text-rose-200",
      icon: Stethoscope,
    });
  }
  if (crop.status === "monitor") {
    alerts.push({
      title: "Health drifting",
      body: "Health has slipped into the monitor band. A field visit this week will catch the cause early.",
      tone: "border-amber-200 bg-amber-50 text-amber-200",
      icon: FlaskConical,
    });
  }
  if (crop.next_action_on) {
    const due = new Date(`${crop.next_action_on}T00:00:00`);
    const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
    if (days <= 7) {
      alerts.push({
        title: crop.next_action ?? "Scheduled action",
        body: days < 0 ? `Overdue by ${Math.abs(days)} days.` : days === 0 ? "Due today." : `Due in ${days} days.`,
        tone: "border-sky-400/30 bg-sky-500/10 text-sky-200",
        icon: CalendarDays,
      });
    }
  }
  if (daysToHarvest(crop) <= 14) {
    alerts.push({
      title: "Harvest window approaching",
      body: `${daysToHarvest(crop)} days left in the season — arrange labour and transport.`,
      tone: "border-brand-700/30 bg-brand-50 text-brand-700",
      icon: CloudSun,
    });
  }

  return (
    <FarmerSection title="Alerts" description={`${alerts.length} active for ${crop.name}`} icon={Bell}>
      {alerts.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-slate-500">
          Nothing to act on right now — this crop has no open alerts.
        </p>
      ) : (
        <ul className="space-y-2 p-4">
          {alerts.map(({ title, body, tone, icon: Icon }) => (
            <li key={title} className={`flex gap-3 rounded-lg border px-3 py-2.5 ${tone}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-xs font-bold">{title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FarmerSection>
  );
}

function EmptyState({ onAdd, hasFarms }: { onAdd: () => void; hasFarms: boolean }) {
  return (
    <section className="creator-card px-6 py-14 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-700/12 text-brand-700">
        <Sprout className="h-7 w-7" />
      </span>
      <h2 className="mt-3 text-base font-bold text-forest">No crops recorded yet</h2>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">
        Add what you have planted — the crop, area and planting date — and this dashboard fills in the
        growth stage, health trend and the next action for you.
      </p>
      <button type="button" onClick={onAdd} className="creator-btn-primary mx-auto mt-4 h-9 gap-1.5 px-4 text-xs">
        <Plus className="h-4 w-4" /> Add your first crop
      </button>
      {!hasFarms && (
        <p className="mt-3 text-[11px] text-slate-500">
          Tip: add a farm under My Farm first to group crops by land.
        </p>
      )}
    </section>
  );
}

/* ── Add / edit dialog ────────────────────────────────────────────────────── */

function CropFormDialog({
  form,
  setForm,
  farms,
  editing,
  saving,
  error,
  photoPreview,
  fileRef,
  onChooseCrop,
  onChoosePhoto,
  onSubmit,
  onClose,
}: {
  form: CropForm;
  setForm: (form: CropForm) => void;
  farms: Farm[];
  editing: boolean;
  saving: boolean;
  error: string;
  photoPreview: string;
  fileRef: React.RefObject<HTMLInputElement>;
  onChooseCrop: (name: string) => void;
  onChoosePhoto: (file: File | null) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const field =
    "w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-2 text-sm text-forest outline-none focus:border-brand-700";
  const label = "mb-1 block text-xs font-semibold text-slate-200";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-dark/40 sm:items-center sm:p-4">
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-forest">
              {editing ? "Edit Crop" : "Add Crop"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Growth stage and the trend chart are worked out from these values.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="crop-name" className={label}>
              Crop *
            </label>
            <input
              id="crop-name"
              required
              list="crop-options"
              value={form.name}
              onChange={(e) => onChooseCrop(e.target.value)}
              placeholder="Wheat"
              className={field}
            />
            <datalist id="crop-options">
              {COMMON_CROPS.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="crop-variety" className={label}>
              Variety
            </label>
            <input
              id="crop-variety"
              value={form.variety}
              onChange={(e) => setForm({ ...form, variety: e.target.value })}
              placeholder="e.g. HD-2967"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="crop-farm" className={label}>
              Farm
            </label>
            <select
              id="crop-farm"
              value={form.farmId}
              onChange={(e) => setForm({ ...form, farmId: e.target.value })}
              className={field}
            >
              <option value="">Not linked</option>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="crop-area" className={label}>
              Area (acres)
            </label>
            <input
              id="crop-area"
              type="number"
              min="0.01"
              step="0.01"
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="2.5"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="crop-planted" className={label}>
              Planting date *
            </label>
            <input
              id="crop-planted"
              required
              type="date"
              max={todayISO()}
              value={form.plantedOn}
              onChange={(e) => setForm({ ...form, plantedOn: e.target.value })}
              className={field}
            />
          </div>

          <div>
            <label htmlFor="crop-days" className={label}>
              Season length (days)
            </label>
            <input
              id="crop-days"
              type="number"
              min="30"
              max="365"
              value={form.growthDays}
              onChange={(e) => setForm({ ...form, growthDays: e.target.value })}
              className={field}
            />
          </div>

          <div>
            <label htmlFor="crop-health" className={label}>
              Health: <span className="text-brand-700">{form.health}%</span>
            </label>
            <input
              id="crop-health"
              type="range"
              min="0"
              max="100"
              step="1"
              value={form.health}
              onChange={(e) => setForm({ ...form, health: e.target.value })}
              className="w-full accent-[#16C784]"
            />
          </div>

          <div>
            <label htmlFor="crop-status" className={label}>
              Status
            </label>
            <select
              id="crop-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CropStatus })}
              className={field}
            >
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="crop-action" className={label}>
              Next action
            </label>
            <input
              id="crop-action"
              value={form.nextAction}
              onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
              placeholder="Apply Fertilizer"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="crop-action-on" className={label}>
              Action due
            </label>
            <input
              id="crop-action-on"
              type="date"
              value={form.nextActionOn}
              onChange={(e) => setForm({ ...form, nextActionOn: e.target.value })}
              className={field}
            />
          </div>

          <div className="sm:col-span-2">
            <p className={label}>Crop photo</p>
            <div className="flex items-center gap-3">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-slate-500" />
                )}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    onChoosePhoto(null);
                    return;
                  }
                  onChoosePhoto(file);
                }}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-forest hover:file:bg-slate-100"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">JPG, PNG or WebP up to 5 MB. Private to your account.</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline h-9 px-4 text-xs">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="creator-btn-primary h-9 gap-1.5 px-4 text-xs disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Crop"}
          </button>
        </div>
      </form>
    </div>
  );
}


