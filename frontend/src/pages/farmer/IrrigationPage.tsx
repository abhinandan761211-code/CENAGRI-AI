import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  CloudRain,
  Droplets,
  History,
  Plus,
  Trash2,
  Waves,
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
  Select,
  shortDate,
  Stat,
  Textarea,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listFarms, haToAcres } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import {
  deleteIrrigationLog,
  farmerError,
  IRRIGATION_METHODS,
  label,
  listIrrigationLogs,
  listTasks,
  saveIrrigationLog,
} from "@/lib/farmer";
import type { IrrigationLog, IrrigationMethod, FarmerTask } from "@/lib/farmer";
import { getWeather, isWeatherConfigured } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";

/**
 * Irrigation Management — schedules, water-use records and history.
 *
 * Schedules are the crop-specific irrigation steps from each crop's calendar
 * (rule-based, from the sowing date) plus the reminders the farmer added.
 * Water use is only ever what the farmer recorded — there are no moisture
 * sensors here, and the page says so. Rain suggestions come from the live
 * forecast only.
 */

type Draft = {
  farm_id: string;
  crop_id: string;
  irrigated_on: string;
  method: string;
  hours: string;
  volume_m3: string;
  cost_inr: string;
  notes: string;
};

const emptyDraft = (farmId: string): Draft => ({
  farm_id: farmId,
  crop_id: "",
  irrigated_on: new Date().toISOString().slice(0, 10),
  method: "",
  hours: "",
  volume_m3: "",
  cost_inr: "",
  notes: "",
});

export default function IrrigationPage() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();
  const details = profile?.details ?? {};

  const [logs, setLogs] = useState<IrrigationLog[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [tasks, setTasks] = useState<FarmerTask[]>([]);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<IrrigationLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [logRows, farmRows, cropRows, taskRows] = await Promise.all([
        listIrrigationLogs(),
        listFarms().catch(() => []),
        listCrops().catch(() => []),
        listTasks().catch(() => []),
      ]);
      setLogs(logRows);
      setFarms(farmRows);
      setCrops(cropRows);
      setTasks(taskRows);
    } catch (err) {
      setError(farmerError(err, "Could not load your irrigation records."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!details.district || !isWeatherConfigured) return;
    let alive = true;
    getWeather(details.district, details.state, details.village)
      .then((data) => {
        if (alive && data) setWeather(data);
      })
      .catch(() => {
        /* the suggestion block simply does not appear */
      });
    return () => {
      alive = false;
    };
  }, [details.district, details.state, details.village]);

  const cropName = useMemo(() => new Map(crops.map((c) => [c.id, c.name])), [crops]);
  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms]);

  const thisMonth = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    const iso = start.toISOString().slice(0, 10);
    return logs.filter((log) => log.irrigated_on >= iso);
  }, [logs]);

  const monthHours = thisMonth.reduce((sum, log) => sum + (log.hours ?? 0), 0);
  const monthCost = thisMonth.reduce((sum, log) => sum + (log.cost_inr ?? 0), 0);

  const irrigationTasks = useMemo(
    () => tasks.filter((task) => !task.done && (task.kind === "irrigation" || task.kind === "other")).slice(0, 8),
    [tasks]
  );

  /** Next irrigation step per crop — from the crop's own next_action. */
  const cropSchedules = useMemo(
    () =>
      crops
        .filter((c) => c.status !== "harvested")
        .map((crop) => ({
          crop,
          next: crop.next_action_on && /irrigat|water|pani|sinch/i.test(crop.next_action ?? "")
            ? { on: crop.next_action_on, text: crop.next_action ?? "Irrigation" }
            : null,
        }))
        .filter((row) => row.next),
    [crops]
  );

  const rainNote = useMemo(() => {
    if (!weather) return null;
    const wet = weather.forecast.slice(0, 3).filter((d) => (d.rainChance ?? 0) >= 60);
    return wet.length ? wet[0] : null;
  }, [weather]);

  const lastIrrigation = logs[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError("");
    try {
      await saveIrrigationLog({
        farm_id: draft.farm_id || null,
        crop_id: draft.crop_id || null,
        irrigated_on: draft.irrigated_on,
        method: (draft.method || null) as IrrigationMethod | null,
        hours: draft.hours ? Number(draft.hours) : null,
        volume_m3: draft.volume_m3 ? Number(draft.volume_m3) : null,
        cost_inr: draft.cost_inr ? Number(draft.cost_inr) : null,
        notes: draft.notes || null,
      });
      setDraft(null);
      showToast("Irrigation recorded");
      await load();
    } catch (err) {
      setFormError(farmerError(err, "Could not save the irrigation record."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteIrrigationLog(confirmDelete.id);
      setConfirmDelete(null);
      showToast("Record deleted");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not delete the record."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Droplets}
        title="Irrigation Management"
        description="Crop-wise irrigation steps, the water you actually used, and how much it cost — entered by you, nothing is measured automatically."
        actions={
          <PrimaryButton onClick={() => setDraft(emptyDraft(farms[0]?.id ?? ""))}>
            <Plus className="h-4 w-4" /> Record irrigation
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Irrigations this month" value={thisMonth.length} icon={Droplets} hint="Recorded by you" />
        <Stat label="Hours this month" value={monthHours ? `${num(monthHours)} h` : "—"} icon={Waves} tone="teal" hint="If hours were entered" />
        <Stat label="Cost this month" value={monthCost ? inr(monthCost) : "—"} icon={History} tone="amber" hint="Not counted in expenses unless logged there" />
        <Stat
          label="Last irrigation"
          value={lastIrrigation ? shortDate(lastIrrigation.irrigated_on) : "—"}
          icon={History}
          tone="slate"
          hint={lastIrrigation ? farmName.get(lastIrrigation.farm_id ?? "") ?? "Farm" : "Nothing recorded"}
        />
      </div>

      {rainNote && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
            <CloudRain className="h-3.5 w-3.5" /> Rain expected {rainNote.day} ({rainNote.rainChance}%)
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-blue-900">
            Consider holding irrigation for the next two days. From the live forecast for your district.
          </p>
        </div>
      )}

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Irrigation history"
          description="Water use and cost per irrigation, newest first"
          icon={History}
        >
          {loading ? (
            <LoadingRows rows={4} />
          ) : logs.length === 0 ? (
            <EmptyState
              icon={Droplets}
              title="No irrigation recorded"
              body="Log each watering with its date, hours and cost. It then counts towards this month's summary and appears in the crop's history."
              action={
                <PrimaryButton onClick={() => setDraft(emptyDraft(farms[0]?.id ?? ""))}>
                  <Plus className="h-4 w-4" /> Record irrigation
                </PrimaryButton>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                    <Droplets className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-forest">
                      {cropName.get(log.crop_id ?? "") ?? "All crops"}
                      {log.farm_id ? ` · ${farmName.get(log.farm_id) ?? "Farm"}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {shortDate(log.irrigated_on)}
                      {log.method ? ` · ${label(log.method)}` : ""}
                      {log.hours != null ? ` · ${num(log.hours)} h` : ""}
                      {log.volume_m3 != null ? ` · ${num(log.volume_m3)} m³` : ""}
                      {log.notes ? ` · ${log.notes}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-600">
                    {log.cost_inr != null ? inr(log.cost_inr) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(log)}
                    aria-label="Delete record"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Crop-wise schedule" description="Next irrigation step per crop" icon={Droplets}>
            {cropSchedules.length === 0 ? (
              <EmptyState
                icon={Droplets}
                title="No irrigation steps set"
                body="Set a next action (e.g. “Irrigate 2nd time”) on a crop to see it here."
                action={
                  <Link to="/crops" className="creator-btn-ghost inline-flex h-9 items-center px-4 text-xs">
                    Open Crop Management
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {cropSchedules.map(({ crop, next }) => (
                  <li key={crop.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-forest">{crop.name}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {crop.area_ha != null ? `${num(haToAcres(crop.area_ha))} acres · ` : ""}
                        {next?.text}
                      </p>
                    </div>
                    <Chip tone="blue">{shortDate(next?.on)}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Reminders" description="Irrigation reminders you added in the calendar" icon={History}>
            {irrigationTasks.length === 0 ? (
              <p className="px-4 py-5 text-[11px] text-slate-500">
                None yet.{" "}
                <Link to="/calendar" className="font-semibold text-brand-700 hover:underline">
                  Add one on the crop calendar
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {irrigationTasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="truncate text-[11px] font-semibold text-forest">{task.title}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{shortDate(task.due_on)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              <strong className="text-forest">No soil-moisture sensors are connected.</strong> Schedules here come
              from each crop's calendar and from you. Check the field before watering.
            </p>
          </div>
        </div>
      </div>

      {draft && (
        <Modal
          title="Record irrigation"
          onClose={() => setDraft(null)}
          footer={
            <>
              <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="irrigation-form" disabled={saving}>
                {saving ? "Saving…" : "Save record"}
              </PrimaryButton>
            </>
          }
        >
          <form id="irrigation-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Date</span>
              <Input
                type="date"
                value={draft.irrigated_on}
                onChange={(e) => setDraft({ ...draft, irrigated_on: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Method</span>
              <Select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
                <option value="">Not recorded</option>
                {IRRIGATION_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {label(method)}
                  </option>
                ))}
              </Select>
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
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Crop</span>
              <Select value={draft.crop_id} onChange={(e) => setDraft({ ...draft, crop_id: e.target.value })}>
                <option value="">All crops</option>
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Hours</span>
              <Input
                type="number"
                min="0"
                step="0.25"
                inputMode="decimal"
                value={draft.hours}
                onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                placeholder="e.g. 3"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Water used (m³)
              </span>
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                value={draft.volume_m3}
                onChange={(e) => setDraft({ ...draft, volume_m3: e.target.value })}
                placeholder="Optional"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Cost (₹)</span>
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                value={draft.cost_inr}
                onChange={(e) => setDraft({ ...draft, cost_inr: e.target.value })}
                placeholder="Pump / electricity charge"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</span>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Anything worth remembering"
              />
            </label>

            {formError && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete this record?"
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
                Delete
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            The irrigation from {shortDate(confirmDelete.irrigated_on)} will be removed from your history.
          </p>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}
