import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Camera,
  CircleAlert,
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
  Input,
  LoadingRows,
  Modal,
  num,
  PageHeader,
  Panel,
  PrimaryButton,
  ProgressBar,
  SearchBox,
  Select,
  Stat,
  Textarea,
  Toast,
  useToast,
  shortDate,
  relativeDays,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { acresToHa, haToAcres, listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import {
  deleteCrop,
  daysSince,
  daysToHarvest,
  growthStage,
  isDemoCrop,
  listCrops,
  saveCrop,
  seasonProgress,
  uploadCropPhoto,
} from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import { CALENDARS, calendarFor, scheduleActivities } from "@/lib/cropCalendar";
import { profileFor } from "@/lib/cropProfiles";

import type { ScheduledActivity } from "@/lib/cropCalendar";
import { listActivities, farmerError, saveActivity } from "@/lib/farmer";
import type { FarmActivity } from "@/lib/farmer";

/**
 * Crop Management — one row per crop on the land, with the sowing date that
 * drives the calendar, the growth stage, health, the expected harvest and the
 * harvest record itself.
 */

const CROP_CHOICES = Object.keys(CALENDARS)
  .map((key) => key.charAt(0).toUpperCase() + key.slice(1))
  .concat(["Paddy", "Potato", "Mustard", "Jute", "Onion"]);

type Draft = {
  id?: string;
  name: string;
  variety: string;
  farm_id: string;
  area: string;
  planted_on: string;
  growth_days: string;
  health: string;
  status: "healthy" | "monitor" | "at_risk" | "harvested";
  next_action: string;
  next_action_on: string;
  image_url: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  variety: "",
  farm_id: "",
  area: "",
  planted_on: new Date().toISOString().slice(0, 10),
  growth_days: "120",
  health: "90",
  status: "healthy",
  next_action: "",
  next_action_on: "",
  image_url: "",
});

const statusTone = (status: string) =>
  status === "at_risk" ? "red" : status === "monitor" ? "amber" : status === "harvested" ? "slate" : "green";

export default function CropManagement() {
  const { user } = useAuth();
  const { toast, showToast } = useToast();

  const [crops, setCrops] = useState<Crop[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [activities, setActivities] = useState<FarmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | "harvested">("active");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [detail, setDetail] = useState<Crop | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Crop | null>(null);
  const [harvest, setHarvest] = useState<{ crop: Crop; quantity: string; date: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cropRows, farmRows, activityRows] = await Promise.all([
        listCrops(),
        listFarms().catch(() => []),
        listActivities(200).catch(() => []),
      ]);
      setCrops(cropRows);
      setFarms(farmRows);
      setActivities(activityRows);
    } catch (err) {
      setError(farmerError(err, "Could not load your crops."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return crops.filter((crop) => {
      if (filter === "active" && crop.status === "harvested") return false;
      if (filter === "harvested" && crop.status !== "harvested") return false;
      if (!q) return true;
      return [crop.name, crop.variety, farmName.get(crop.farm_id ?? "")]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [crops, filter, query, farmName]);

  const active = crops.filter((c) => c.status !== "harvested");
  const atRisk = active.filter((c) => c.status === "at_risk" || c.status === "monitor");
  const totalAcres = active.reduce((sum, c) => sum + (c.area_ha != null ? haToAcres(c.area_ha) : 0), 0);

  /** Today's and upcoming agronomy, straight from the crop calendar model. */
  function scheduleFor(crop: Crop): ScheduledActivity[] {
    const profile = calendarFor(crop.name);
    const sowing = new Date(`${crop.planted_on}T00:00:00`);
    return scheduleActivities(profile, sowing);
  }

  function openNew() {
    setFormError("");
    setDraft({ ...emptyDraft(), farm_id: farms[0]?.id ?? "" });
  }

  function openEdit(crop: Crop) {
    if (isDemoCrop(crop)) return;
    setFormError("");
    setDraft({
      id: crop.id,
      name: crop.name,
      variety: crop.variety ?? "",
      farm_id: crop.farm_id ?? "",
      area: crop.area_ha != null ? String(haToAcres(crop.area_ha)) : "",
      planted_on: crop.planted_on,
      growth_days: String(crop.growth_days),
      health: String(crop.health),
      status: crop.status,
      next_action: crop.next_action ?? "",
      next_action_on: crop.next_action_on ?? "",
      image_url: crop.image_url ?? "",
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) {
      setFormError("Choose or type the crop name.");
      return;
    }
    const days = Number(draft.growth_days);
    if (!Number.isFinite(days) || days <= 0) {
      setFormError("Enter how many days the crop takes, from sowing to harvest.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await saveCrop(
        {
          name: draft.name.trim(),
          variety: draft.variety.trim() || null,
          farm_id: draft.farm_id || null,
          area_ha: draft.area ? acresToHa(Number(draft.area)) : null,
          planted_on: draft.planted_on,
          growth_days: days,
          health: Number(draft.health) || 90,
          status: draft.status,
          next_action: draft.next_action.trim() || null,
          next_action_on: draft.next_action_on || null,
          image_url: draft.image_url.trim() || null,
        },
        draft.id
      );
      showToast(draft.id ? "Crop updated" : "Crop added");
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(farmerError(err, "Could not save the crop."));
    } finally {
      setSaving(false);
    }
  }

  async function pickPhoto(file: File | null) {
    if (!file || !draft) return;
    setUploading(true);
    setFormError("");
    try {
      const path = await uploadCropPhoto(file);
      setDraft({ ...draft, image_url: path });
    } catch (err) {
      setFormError(farmerError(err, "Could not upload the photo."));
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteCrop(confirmDelete.id);
      setConfirmDelete(null);
      setDetail(null);
      showToast("Crop removed");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not remove the crop."));
    } finally {
      setSaving(false);
    }
  }

  /** Harvest closes the crop and writes a harvest activity — a real record. */
  async function recordHarvest(e: FormEvent) {
    e.preventDefault();
    if (!harvest) return;
    setSaving(true);
    try {
      await saveCrop(
        { name: harvest.crop.name, status: "harvested", next_action: null, next_action_on: null },
        harvest.crop.id
      );
      await saveActivity({
        crop_id: harvest.crop.id,
        farm_id: harvest.crop.farm_id,
        kind: "harvest",
        title: `Harvested ${harvest.crop.name}${harvest.quantity ? ` — ${harvest.quantity}` : ""}`,
        activity_on: harvest.date,
      });
      setHarvest(null);
      setDetail(null);
      showToast("Harvest recorded");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not record the harvest."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Sprout}
        title="Crop Management"
        description="Every crop on your land: variety, sowing date, growth stage, health and the expected harvest. The sowing date also builds your crop calendar."
        actions={
          <PrimaryButton onClick={openNew}>
            <Plus className="h-4 w-4" /> Add crop
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active crops" value={active.length} icon={Sprout} hint="On the land now" />
        <Stat label="Cropped area" value={`${num(totalAcres)} acres`} icon={Wheat} tone="teal" hint="Sum of active crops" />
        <Stat
          label="Need attention"
          value={atRisk.length}
          icon={CircleAlert}
          tone={atRisk.length ? "amber" : "green"}
          hint={atRisk.length ? "Monitor or at risk" : "All look normal"}
        />
        <Stat
          label="Harvested records"
          value={crops.filter((c) => c.status === "harvested").length}
          icon={CalendarDays}
          tone="slate"
          hint="This account"
        />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <Panel flush>
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search crop or variety…" label="Search crops" />
          <div className="flex gap-1.5">
            {(["active", "all", "harvested"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold capitalize transition ${filter === option ? "bg-forest text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
            icon={Sprout}
            title={crops.length === 0 ? "No crops recorded yet" : "No crops match this filter"}
            body={
              crops.length === 0
                ? "Add the crop you have sown, with its sowing date. The calendar, advice and health checks all start from that date."
                : "Try another crop name or switch the filter."
            }
            action={
              crops.length === 0 ? (
                <PrimaryButton onClick={openNew}>
                  <Plus className="h-4 w-4" /> Add crop
                </PrimaryButton>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((crop) => {
              const progress = seasonProgress(crop);
              const left = daysToHarvest(crop);
              const stage = growthStage(profileFor(crop.name).stages, progress);
              return (
                <article key={crop.id} className="creator-card overflow-hidden">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3.5 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                        <Wheat className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-forest">{crop.name}</h3>
                        <p className="truncate text-[11px] text-slate-500">
                          {crop.variety || "Variety not set"}
                          {crop.farm_id ? ` · ${farmName.get(crop.farm_id) ?? "Farm"}` : ""}
                        </p>
                      </div>
                    </div>
                    <Chip tone={statusTone(crop.status)}>{crop.status.replace("_", " ")}</Chip>
                  </div>

                  <div className="space-y-2.5 p-3.5">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-semibold text-forest">{stage}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <ProgressBar
                        value={progress}
                        tone={crop.status === "at_risk" ? "red" : crop.status === "monitor" ? "amber" : "green"}
                        label={`${crop.name} season progress`}
                      />
                    </div>

                    <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <dt className="text-slate-500">Sown</dt>
                        <dd className="font-semibold text-forest">{shortDate(crop.planted_on)}</dd>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <dt className="text-slate-500">Day</dt>
                        <dd className="font-semibold text-forest">{daysSince(crop.planted_on)}</dd>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <dt className="text-slate-500">Harvest</dt>
                        <dd className="font-semibold text-forest">
                          {crop.status === "harvested" ? "Recorded" : left >= 0 ? `${left} days` : "Overdue"}
                        </dd>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <dt className="text-slate-500">Health</dt>
                        <dd className="font-semibold text-forest">{crop.health}%</dd>
                      </div>
                    </dl>

                    {crop.next_action && (
                      <p className="rounded-md border border-brand-100 bg-brand-50 px-2 py-1.5 text-[11px] text-brand-900">
                        <strong>Next:</strong> {crop.next_action}
                        {crop.next_action_on ? ` · ${relativeDays(crop.next_action_on)}` : ""}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <GhostButton onClick={() => setDetail(crop)} className="h-8 px-2.5 text-[11px]">
                        View
                      </GhostButton>
                      {crop.status !== "harvested" && (
                        <>
                          <GhostButton onClick={() => openEdit(crop)} className="h-8 px-2.5 text-[11px]">
                            <Pencil className="h-3 w-3" /> Edit
                          </GhostButton>
                          <GhostButton
                            onClick={() => setHarvest({ crop, quantity: "", date: new Date().toISOString().slice(0, 10) })}
                            className="h-8 px-2.5 text-[11px]"
                          >
                            Harvest
                          </GhostButton>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(crop)}
                        className="ml-auto grid h-8 w-8 place-items-center rounded-md text-rose-600 hover:bg-rose-50"
                        aria-label={`Remove ${crop.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Crop detail: stage, next steps, logged work ── */}
      {detail && (
        <Modal title={`${detail.name}${detail.variety ? ` — ${detail.variety}` : ""}`} onClose={() => setDetail(null)} wide>
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Farm", farmName.get(detail.farm_id ?? "") ?? "Not linked"],
                ["Sown on", shortDate(detail.planted_on)],
                ["Season length", `${detail.growth_days} days`],
                ["Expected harvest", shortDate(new Date(Date.now() + daysToHarvest(detail) * 86_400_000).toISOString().slice(0, 10))],
                ["Area", detail.area_ha != null ? `${num(haToAcres(detail.area_ha))} acres` : "Not recorded"],
                ["Health", `${detail.health}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="text-xs font-semibold text-forest">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Crop calendar for this season
              </p>
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {scheduleFor(detail)
                  .filter((item) => item.date >= new Date().toISOString().slice(0, 10))
                  .slice(0, 8)
                  .map((item) => (
                    <li key={item.key} className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-forest">{item.title}</p>
                        <p className="truncate text-[10px] text-slate-500">{item.detail}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold text-slate-600">{shortDate(item.date)}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Logged work</p>
              {activities.filter((a) => a.crop_id === detail.id).length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Nothing logged for this crop yet.{" "}
                  <Link to="/farm-activities" className="font-semibold text-brand-700 hover:underline">
                    Log an activity
                  </Link>
                </p>
              ) : (
                <ul className="space-y-1">
                  {activities
                    .filter((a) => a.crop_id === detail.id)
                    .slice(0, 6)
                    .map((activity) => (
                      <li key={activity.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate capitalize text-slate-600">
                          {activity.kind.replace("_", " ")} — {activity.title}
                        </span>
                        <span className="shrink-0 text-slate-500">{shortDate(activity.activity_on)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              This advice is general for the crop. Confirm pesticide doses and any diagnosis with your block
              agriculture officer.
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Link to={`/advisory?crop=${encodeURIComponent(detail.name)}`} className="creator-btn-primary inline-flex h-9 items-center px-3.5 text-xs">
                Ask about this crop
              </Link>
              <Link to="/disease-detection" className="creator-btn-ghost inline-flex h-9 items-center px-3.5 text-xs">
                <Camera className="h-3.5 w-3.5" /> Check a problem
              </Link>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add / edit crop ── */}
      {draft && (
        <Modal
          title={draft.id ? "Edit crop" : "Add a crop"}
          description="The sowing date starts the calendar and the harvest countdown."
          onClose={() => setDraft(null)}
          wide
          footer={
            <>
              <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="crop-form" disabled={saving}>
                {saving ? "Saving…" : draft.id ? "Save changes" : "Add crop"}
              </PrimaryButton>
            </>
          }
        >
          <form id="crop-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Crop <span className="text-rose-500">*</span>
              </span>
              <Input
                list="crop-choices"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Paddy"
                required
              />
              <datalist id="crop-choices">
                {CROP_CHOICES.map((crop) => (
                  <option key={crop} value={crop} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Variety</span>
              <Input
                value={draft.variety}
                onChange={(e) => setDraft({ ...draft, variety: e.target.value })}
                placeholder="e.g. Swarna, Pusa Ruby"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Farm</span>
              <Select value={draft.farm_id} onChange={(e) => setDraft({ ...draft, farm_id: e.target.value })}>
                <option value="">Not linked</option>
                {farms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Area (acres)
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Sowing date <span className="text-rose-500">*</span>
              </span>
              <Input
                type="date"
                value={draft.planted_on}
                onChange={(e) => setDraft({ ...draft, planted_on: e.target.value })}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Days to harvest
              </span>
              <Input
                type="number"
                min="1"
                value={draft.growth_days}
                onChange={(e) => setDraft({ ...draft, growth_days: e.target.value })}
                title="Usually on the seed packet. 120 is typical for paddy."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Health</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={draft.health}
                onChange={(e) => setDraft({ ...draft, health: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</span>
              <Select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}
              >
                <option value="healthy">Healthy</option>
                <option value="monitor">Monitor</option>
                <option value="at_risk">At risk</option>
                <option value="harvested">Harvested</option>
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Next action
              </span>
              <Input
                value={draft.next_action}
                onChange={(e) => setDraft({ ...draft, next_action: e.target.value })}
                placeholder="e.g. Apply urea (2nd dose)"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Next action on
              </span>
              <Input
                type="date"
                value={draft.next_action_on}
                onChange={(e) => setDraft({ ...draft, next_action_on: e.target.value })}
              />
            </label>

            <div className="sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Crop photo
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="creator-btn-ghost h-9 cursor-pointer px-3 text-xs">
                  <Camera className="h-3.5 w-3.5" />
                  {uploading ? "Uploading…" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void pickPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                {draft.image_url && (
                  <Chip tone="green">Photo attached</Chip>
                )}
              </div>
            </div>

            {formError && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {/* ── Harvest record ── */}
      {harvest && (
        <Modal
          title={`Record harvest — ${harvest.crop.name}`}
          description="This closes the crop and writes a harvest entry to your farm activity log."
          onClose={() => setHarvest(null)}
          footer={
            <>
              <GhostButton onClick={() => setHarvest(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="harvest-form" disabled={saving}>
                {saving ? "Saving…" : "Record harvest"}
              </PrimaryButton>
            </>
          }
        >
          <form id="harvest-form" onSubmit={recordHarvest} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Harvest date
              </span>
              <Input
                type="date"
                value={harvest.date}
                onChange={(e) => setHarvest({ ...harvest, date: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Quantity (optional)
              </span>
              <Textarea
                rows={2}
                value={harvest.quantity}
                onChange={(e) => setHarvest({ ...harvest, quantity: e.target.value })}
                placeholder="e.g. 18 quintals, sold at the mandi"
              />
            </label>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Remove this crop?"
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
                {saving ? "Removing…" : "Remove crop"}
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-slate-600">
            <strong className="text-forest">
              {confirmDelete.name} {confirmDelete.variety ?? ""}
            </strong>{" "}
            and its calendar will be removed. Activity and expense records stay, but will no longer be linked
            to this crop.
          </p>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}
