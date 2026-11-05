import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CloudRain,
  Droplets,
  Leaf,
  Plus,
  Sparkles,
  Trash2,
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
  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  Stat,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import { calendarFor, scheduleActivities } from "@/lib/cropCalendar";
import type { ScheduledActivity } from "@/lib/cropCalendar";
import {
  addTask,
  deleteTask,
  farmerError,
  listActivities,
  listTasks,
  saveActivity,
  setTaskDone,
} from "@/lib/farmer";
import type { FarmActivity, FarmerTask } from "@/lib/farmer";
import { deriveAlerts, getWeather, isWeatherConfigured } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";

/**
 * Crop Calendar — two sources, merged into one schedule:
 *
 *   1. Derived entries  — sowing / fertiliser / irrigation / pest check /
 *      harvest dates computed from each crop's sowing date and its crop
 *      profile (`lib/cropCalendar.ts`). Never invented: each entry is a rule.
 *   2. Manual tasks    — reminders the farmer adds (`farmer_tasks`).
 *
 * Ticking an entry writes a row into the farm activity log, so "done" is a
 * record, not just a local checkbox. Weather-aware suggestions come only from
 * the live forecast; with no forecast the suggestion simply is not shown.
 */

const KIND_META: Record<string, { icon: typeof Leaf; tone: "green" | "teal" | "blue" | "amber" | "red" | "slate" }> = {
  sowing: { icon: Leaf, tone: "green" },
  fertiliser: { icon: Sparkles, tone: "teal" },
  irrigation: { icon: Droplets, tone: "blue" },
  pest: { icon: Leaf, tone: "amber" },
  pest_check: { icon: Leaf, tone: "amber" },
  harvest: { icon: CalendarDays, tone: "slate" },
  weeding: { icon: Leaf, tone: "green" },
  other: { icon: Circle, tone: "slate" },
};

type EntryKind = "derived" | "task";

type Entry = {
  id: string;
  kind: EntryKind;
  /** Ids for the underlying rows (task id, or crop id for a derived entry). */
  taskId?: string;
  cropId?: string;
  date: string;
  title: string;
  detail?: string;
  type: string;
  done: boolean;
  farmId?: string | null;
};

export default function CropCalendarPage() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();

  const [crops, setCrops] = useState<Crop[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [tasks, setTasks] = useState<FarmerTask[]>([]);
  const [activities, setActivities] = useState<FarmActivity[]>([]);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<"month" | "list">("month");
  const [newTask, setNewTask] = useState<{ title: string; kind: string; due_on: string; crop_id: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const details = profile?.details ?? {};

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cropRows, farmRows, taskRows, activityRows] = await Promise.all([
        listCrops(),
        listFarms().catch(() => []),
        listTasks().catch(() => []),
        listActivities(400).catch(() => []),
      ]);
      // Crop rows are all real records; `isDemoCrop` only flags a pruned demo
      // row in older builds, so the calendar simply lists everything returned.
      setCrops(cropRows);
      setFarms(farmRows);
      setTasks(taskRows);
      setActivities(activityRows);
    } catch (err) {
      setError(farmerError(err, "Could not build your crop calendar."));
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
        /* suggestions are optional — no forecast means no suggestion */
      });
    return () => {
      alive = false;
    };
  }, [details.district, details.state, details.village]);

  /** All derived entries from every active crop. */
  const derived = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const crop of crops) {
      if (crop.status === "harvested") continue;
      const profileDef = calendarFor(crop.name);
      const schedule: ScheduledActivity[] = scheduleActivities(profileDef, new Date(`${crop.planted_on}T00:00:00`));
      for (const item of schedule) {
        // A calendar entry counts as done when a matching activity exists.
        const done = activities.some(
          (a) =>
            a.crop_id === crop.id &&
            a.kind === normaliseKind(item.kind) &&
            Math.abs(daysBetween(a.activity_on, item.date)) <= 6
        );
        out.push({
          id: `${crop.id}:${item.key}`,
          kind: "derived",
          cropId: crop.id,
          date: item.date,
          title: `${item.title} — ${crop.name}`,
          detail: item.detail,
          type: item.kind,
          done,
          farmId: crop.farm_id,
        });
      }
    }
    return out;
  }, [crops, activities]);

  const manual = useMemo<Entry[]>(
    () =>
      tasks.map((task) => ({
        id: task.id,
        kind: "task",
        taskId: task.id,
        cropId: task.crop_id ?? undefined,
        date: task.due_on,
        title: task.title,
        type: task.kind,
        done: task.done,
        farmId: task.farm_id,
      })),
    [tasks]
  );

  const entries = useMemo(
    () => [...derived, ...manual].sort((a, b) => a.date.localeCompare(b.date)),
    [derived, manual]
  );

  const todayIso = today.toISOString().slice(0, 10);
  /**
   * Only recent misses count as overdue. A crop sown months ago has a dozen
   * calendar steps behind it; listing them all as "overdue" would bury the
   * one task that still matters. Anything older than the window is history.
   */
  const overdueFrom = addDays(todayIso, -21);
  const overdue = entries.filter((e) => !e.done && e.date < todayIso && e.date >= overdueFrom);
  const dueToday = entries.filter((e) => !e.done && e.date === todayIso);
  const week = entries.filter((e) => !e.done && e.date > todayIso && e.date <= addDays(todayIso, 7));

  /** Next 7 days of forecast, for weather-aware suggestions only. */
  const rainSoon = useMemo(() => {
    if (!weather) return null;
    const wet = weather.forecast.slice(0, 3).filter((day) => (day.rainChance ?? 0) >= 60);
    return wet.length ? wet : null;
  }, [weather]);

  const suggestions = useMemo(() => {
    const out: { title: string; body: string }[] = [];
    if (rainSoon) {
      const day = rainSoon[0];
      out.push({
        title: `Rain likely ${day.day} (${day.rainChance}%)`,
        body: "Hold irrigation for the next two days — the field should keep enough moisture. Spraying within 24 hours of rain washes off.",
      });
    }
    if (weather && weather.temp >= 38) {
      out.push({
        title: `High temperature today (${weather.temp}°C)`,
        body: "Irrigate early morning or evening to reduce evaporation and heat stress on young plants.",
      });
    }
    const alerts = deriveAlerts(weather);
    for (const alert of alerts.slice(0, 1)) {
      out.push({ title: alert.title, body: alert.body });
    }
    return out.slice(0, 3);
  }, [rainSoon, weather]);

  /* ── Month grid ───────────────────────────────────────────────────── */

  const grid = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // Monday-first
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      return {
        iso,
        day: d.getDate(),
        inMonth: d.getMonth() === month.getMonth(),
        isToday: iso === todayIso,
        entries: entries.filter((e) => e.date === iso),
      };
    });
  }, [month, entries, todayIso]);

  async function complete(entry: Entry) {
    setBusyKey(entry.id);
    try {
      if (entry.kind === "task" && entry.taskId) {
        await setTaskDone(entry.taskId, !entry.done);
      } else if (entry.kind === "derived" && entry.cropId && !entry.done) {
        const crop = crops.find((c) => c.id === entry.cropId);
        await saveActivity({
          crop_id: entry.cropId,
          farm_id: crop?.farm_id ?? null,
          kind: normaliseKind(entry.type) as never,
          title: entry.title.replace(/\s—\s.*$/, ""),
          activity_on: entry.date,
        });
      }
      await load();
      showToast("Marked done");
    } catch (err) {
      setError(farmerError(err, "Could not update this item."));
    } finally {
      setBusyKey(null);
    }
  }

  async function removeTask(id: string) {
    setBusyKey(id);
    try {
      await deleteTask(id);
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not delete the reminder."));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveNewTask(e: FormEvent) {
    e.preventDefault();
    if (!newTask) return;
    if (!newTask.title.trim()) return;
    setSaving(true);
    try {
      const crop = crops.find((c) => c.id === newTask.crop_id);
      await addTask({
        title: newTask.title,
        kind: newTask.kind,
        due_on: newTask.due_on,
        crop_id: newTask.crop_id || null,
        farm_id: crop?.farm_id ?? null,
      });
      setNewTask(null);
      showToast("Reminder added");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not save the reminder."));
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = month.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <FarmerShell>
      <PageHeader
        icon={CalendarDays}
        title="Crop Calendar"
        description="Sowing, fertiliser, irrigation, pest checks and harvest — worked out from each crop's sowing date, plus reminders you add yourself."
        actions={
          <>
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              {(["month", "list"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  aria-pressed={view === option}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold capitalize ${view === option ? "bg-forest text-white" : "text-slate-600"
                    }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <PrimaryButton
              onClick={() =>
                setNewTask({ title: "", kind: "other", due_on: todayIso, crop_id: crops[0]?.id ?? "" })
              }
            >
              <Plus className="h-4 w-4" /> Add reminder
            </PrimaryButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Due today" value={dueToday.length} icon={CalendarDays} tone={dueToday.length ? "amber" : "green"} hint="Across all crops" />
        <Stat label="Overdue" value={overdue.length} icon={Circle} tone={overdue.length ? "amber" : "slate"} hint="In the last 3 weeks" />
        <Stat label="Next 7 days" value={week.length} icon={Leaf} tone="teal" hint="Coming up" />
        <Stat label="Your reminders" value={tasks.filter((t) => !t.done).length} icon={Plus} tone="blue" hint="Added by you" />
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
            <CloudRain className="h-3.5 w-3.5" /> Weather-aware suggestions
          </p>
          <ul className="mt-1.5 space-y-1">
            {suggestions.map((s) => (
              <li key={s.title} className="text-[11px] leading-relaxed text-blue-900">
                <span className="font-semibold">{s.title}:</span> {s.body}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-blue-700">From the live forecast for your district.</p>
        </div>
      )}

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      {loading ? (
        <Panel>
          <LoadingRows rows={6} />
        </Panel>
      ) : crops.length === 0 && tasks.length === 0 ? (
        <Panel>
          <EmptyState
            icon={CalendarDays}
            title="Your calendar is empty"
            body="Add a crop with its sowing date and the full season schedule appears here. You can also add a reminder by hand."
            action={
              <PrimaryButton onClick={() => setNewTask({ title: "", kind: "other", due_on: todayIso, crop_id: "" })}>
                <Plus className="h-4 w-4" /> Add reminder
              </PrimaryButton>
            }
          />
        </Panel>
      ) : view === "month" ? (
        <Panel
          flush
          title={monthLabel}
          icon={CalendarDays}
          action={
            <div className="flex items-center gap-1">
              <GhostButton className="h-8 px-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </GhostButton>
              <GhostButton className="h-8 px-2" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
                Today
              </GhostButton>
              <GhostButton className="h-8 px-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </GhostButton>
            </div>
          }
        >
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell) => (
              <div
                key={cell.iso}
                className={`min-h-[68px] border-b border-r border-slate-100 p-1 last:border-r-0 sm:min-h-[92px] ${cell.inMonth ? "bg-white" : "bg-slate-50/60"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${cell.isToday ? "bg-brand-700 text-white" : cell.inMonth ? "text-slate-700" : "text-slate-400"
                      }`}
                  >
                    {cell.day}
                  </span>
                  {cell.entries.length > 0 && (
                    <span className="text-[9px] font-bold text-brand-700">{cell.entries.length}</span>
                  )}
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {cell.entries.slice(0, 2).map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => void complete(entry)}
                        title={entry.title}
                        className={`block w-full truncate rounded px-1 py-0.5 text-left text-[9px] font-semibold leading-tight ${entry.done
                            ? "bg-slate-100 text-slate-400 line-through"
                            : entry.kind === "task"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-brand-50 text-brand-900"
                          }`}
                      >
                        {entry.title.replace(/\s—\s.*$/, "")}
                      </button>
                    </li>
                  ))}
                  {cell.entries.length > 2 && (
                    <li className="px-1 text-[9px] text-slate-400">+{cell.entries.length - 2} more</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
            Tap an entry to mark it done. Ticked entries are written to your farm activity log.
          </p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {[
            { title: "Overdue", list: overdue, tone: "red" as const },
            { title: "Today", list: dueToday, tone: "amber" as const },
            { title: "Next 7 days", list: week, tone: "teal" as const },
            {
              title: "Later",
              list: entries.filter((e) => !e.done && e.date > addDays(todayIso, 7)).slice(0, 20),
              tone: "slate" as const,
            },
          ]
            .filter((section) => section.list.length > 0)
            .map((section) => (
              <Panel key={section.title} title={section.title} icon={CalendarDays}>
                <ul className="divide-y divide-slate-100">
                  {section.list.map((entry) => {
                    const meta = KIND_META[entry.type] ?? KIND_META.other;
                    const Icon = meta.icon;
                    return (
                      <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => void complete(entry)}
                          disabled={busyKey === entry.id}
                          aria-label={entry.done ? "Mark not done" : "Mark done"}
                          className="shrink-0"
                        >
                          {entry.done ? (
                            <CheckCircle2 className="h-4 w-4 text-brand-600" />
                          ) : (
                            <Circle className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-forest">{entry.title}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {formatDay(entry.date)} · {entry.detail ?? entry.type.replace("_", " ")}
                          </p>
                        </div>
                        <Chip tone={meta.tone}>{entry.kind === "task" ? "Reminder" : entry.type.replace("_", " ")}</Chip>
                        <Icon className="hidden h-3.5 w-3.5 text-slate-300 sm:block" />
                        {entry.kind === "task" && entry.taskId && (
                          <button
                            type="button"
                            onClick={() => void removeTask(entry.taskId as string)}
                            aria-label="Delete reminder"
                            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))}
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-400">
        Derived dates are general guidance for the crop and its sowing date, not a prediction for your field.
        Adjust them with your own observations and local advisory.
      </p>

      {newTask && (
        <Modal
          title="Add a reminder"
          description="Reminders appear on the calendar and in today's tasks on the dashboard."
          onClose={() => setNewTask(null)}
          footer={
            <>
              <GhostButton onClick={() => setNewTask(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="task-form" disabled={saving}>
                {saving ? "Saving…" : "Add reminder"}
              </PrimaryButton>
            </>
          }
        >
          <form id="task-form" onSubmit={saveNewTask} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                What needs doing? <span className="text-rose-500">*</span>
              </span>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="e.g. Spray for stem borer"
                required
                maxLength={200}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Type</span>
                <Select value={newTask.kind} onChange={(e) => setNewTask({ ...newTask, kind: e.target.value })}>
                  {["fertiliser", "irrigation", "pest", "weeding", "sowing", "harvest", "other"].map((kind) => (
                    <option key={kind} value={kind} className="capitalize">
                      {kind.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Date</span>
                <Input
                  type="date"
                  value={newTask.due_on}
                  onChange={(e) => setNewTask({ ...newTask, due_on: e.target.value })}
                  required
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Crop</span>
              <Select value={newTask.crop_id} onChange={(e) => setNewTask({ ...newTask, crop_id: e.target.value })}>
                <option value="">Not linked to a crop</option>
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name} {crop.variety ? `(${crop.variety})` : ""}
                  </option>
                ))}
              </Select>
              {farms.length > 0 && (
                <span className="mt-1 block text-[10px] text-slate-400">
                  The farm comes from the crop you pick.
                </span>
              )}
            </label>
          </form>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/** Map a calendar entry type onto the activity kinds the database accepts. */
function normaliseKind(type: string): string {
  const map: Record<string, string> = {
    pest: "pest_check",
    fertiliser: "fertiliser",
    irrigation: "irrigation",
    sowing: "sowing",
    harvest: "harvest",
    weeding: "weeding",
    ploughing: "ploughing",
    spray: "spray",
  };
  return map[type] ?? "other";
}
