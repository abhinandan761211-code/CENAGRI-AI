import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Droplets,
  Leaf,
  Lightbulb,
  ListChecks,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection } from "@/components/farm/FarmerShell";
import { useAuth } from "@/hooks/useAuth";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import {
  ACTIVITY_META,
  CALENDAR_CROPS,
  activitiesByDay,
  addDays,
  calendarFor,
  formatDate,
  monthMatrix,
  monthTasks,
  scheduleActivities,
  windowLabel,
} from "@/lib/cropCalendar";
import { getWeather, isWeatherConfigured } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Crop Calendar.
 *
 * The month grid, the schedule rail, the task list and the tips all come from
 * `cropCalendar.ts`, which only holds *timing*. The season start is the
 * farmer's own `planted_on` when that crop exists, and the next sowing window
 * otherwise — so the calendar matches the record instead of a hardcoded year.
 */
export default function CropCalendar() {
  const { profile } = useAuth();
  const details = profile?.details ?? {};
  const district = details.district;

  const [crops, setCrops] = useState<Crop[]>([]);
  const [selected, setSelected] = useState<string>(CALENDAR_CROPS[0]);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);

  // The farmer's crops, so a chip can jump to "my Wheat" rather than a demo.
  useEffect(() => {
    let alive = true;
    listCrops()
      .then((rows) => {
        if (alive) setCrops(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!district || !isWeatherConfigured) return;
    let alive = true;
    getWeather(district, details.state, details.village)
      .then((data) => {
        if (alive && data) setWeather(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [district, details.state, details.village]);

  const profileForCrop = useMemo(() => calendarFor(selected), [selected]);
  const ownCrop = useMemo(
    () => crops.find((c) => c.name.trim().toLowerCase() === selected.trim().toLowerCase()),
    [crops, selected]
  );

  /**
   * Season start. A planted crop anchors to its real date; with no crop the
   * calendar opens on the month the next sowing window would begin, so the
   * grid always shows something due rather than an empty past.
   */
  const seasonStart = useMemo(() => {
    if (ownCrop?.planted_on) {
      const [y, m, d] = ownCrop.planted_on.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    const today = new Date();
    const [y, m] = [monthCursor.year, monthCursor.month];
    return new Date(y, m, 1) > today ? new Date(y, m, 1) : addDays(today, -30);
  }, [ownCrop, monthCursor.year, monthCursor.month]);

  const activities = useMemo(
    () =>
      scheduleActivities(
        profileForCrop,
        seasonStart,
        ownCrop?.planted_on ? addDays(seasonStart, ownCrop.growth_days) : undefined
      ),
    [profileForCrop, seasonStart, ownCrop]
  );

  const byDay = useMemo(
    () => activitiesByDay(activities, monthCursor.year, monthCursor.month),
    [activities, monthCursor.year, monthCursor.month]
  );
  const tasks = useMemo(
    () => monthTasks(activities, monthCursor.year, monthCursor.month),
    [activities, monthCursor.year, monthCursor.month]
  );
  const cells = useMemo(() => monthMatrix(monthCursor.year, monthCursor.month), [monthCursor]);
  const today = new Date();
  const isThisMonth = today.getFullYear() === monthCursor.year && today.getMonth() === monthCursor.month;

  const shiftMonth = (step: number) =>
    setMonthCursor(({ year, month }) => {
      const d = new Date(year, month + step, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const pickedActivities = picked != null ? byDay.get(picked) ?? [] : [];

  return (
    <FeatureShell
      title="Crop Calendar"
      description="Plan your farming activities with a smart schedule — sowing, irrigation, fertilizer, pest control and harvest."
    >
      <div className="space-y-5">
        <FarmerSection
          title={`Select Crop`}
          description="The whole calendar follows this crop's season."
        >
        {/* Crop chips — also the selector for the whole page. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {CALENDAR_CROPS.map((name) => {
            const active = name === selected;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setSelected(name);
                  setPicked(null);
                }}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${active
                    ? "border-brand-700/40 bg-brand-700/15 text-brand-700"
                    : "border-slate-200 bg-slate-100 text-slate-500 hover:border-slate-200 hover:text-forest"
                  }`}
              >
                <span aria-hidden="true">{calendarFor(name).emoji}</span>
                {name}
              </button>
            );
          })}
        </div>
      </FarmerSection>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
        {/* ── Month grid ── */}
        <FarmerSection title="Month">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-display text-lg font-bold text-forest">
              <CalendarDays className="h-4 w-4 text-brand-700" />
              {MONTHS[monthCursor.month]} {monthCursor.year}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <p
                key={day}
                className={`pb-1 text-[10px] font-bold uppercase tracking-wide ${day === "Sun" ? "text-rose-300/80" : "text-slate-500"
                  }`}
              >
                {day}
              </p>
            ))}
            {cells.map((cell, i) => {
              if (!cell.date) return <span key={`pad-${i}`} />;
              const day = cell.date.getDate();
              const items = byDay.get(day) ?? [];
              const isToday = isThisMonth && day === today.getDate();
              const isPicked = picked === day;
              return (
                <button
                  key={cell.date.toISOString()}
                  type="button"
                  onClick={() => setPicked(items.length ? day : null)}
                  aria-label={`${day} ${MONTHS[monthCursor.month]}${items.length ? ` — ${items.length} activities` : ""
                    }`}
                  aria-pressed={isPicked}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-lg text-sm transition ${isPicked
                      ? "bg-brand-100 font-bold text-brand-700 ring-1 ring-[#16C784]/40"
                      : isToday
                        ? "bg-slate-100 font-bold text-forest ring-1 ring-white/25"
                        : "text-slate-500 hover:bg-slate-100"
                    }`}
                >
                  {day}
                  {items.length > 0 && (
                    <span className="absolute bottom-1 flex gap-0.5">
                      {items.slice(0, 3).map((item) => (
                        <span
                          key={item.key}
                          className={`h-1 w-1 rounded-full ${ACTIVITY_META[item.kind].dot}`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-200 pt-3">
            {(["sowing", "irrigation", "fertilizer", "pest", "harvest"] as const).map((kind) => (
              <li key={kind} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className={`h-1.5 w-1.5 rounded-full ${ACTIVITY_META[kind].dot}`} />
                {ACTIVITY_META[kind].label}
              </li>
            ))}
          </ul>

          {picked != null && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2">
              <p className="text-[11px] font-bold text-forest">
                {formatDate(iso(new Date(monthCursor.year, monthCursor.month, picked)))}
              </p>
              <ul className="mt-1 space-y-1">
                {pickedActivities.map((item) => (
                  <li key={item.key} className="flex items-start gap-1.5 text-[11px] text-slate-500">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_META[item.kind].dot}`} />
                    <span>
                      <span className="font-semibold text-forest">{item.title}</span> — {item.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FarmerSection>

        {/* ── Schedule rail ── */}
        <FarmerSection title={`${selected} Farming Schedule`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-forest">
              <span className="text-2xl" aria-hidden="true">{profileForCrop.emoji}</span>
              Sowing window: <span className="text-brand-700">{profileForCrop.sowingWindow}</span>
            </p>
            {ownCrop ? (
              <Link
                to="/crops"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-forest"
              >
                View Details <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <span className="rounded-lg border border-dashed border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-500">
                Sample timing — add the crop to sync dates
              </span>
            )}
          </div>

          <ol className="mt-4 space-y-2">
            {profileForCrop.entries.map((entry, i) => {
              const meta = ACTIVITY_META[entry.kind];
              return (
                <li
                  key={`${entry.kind}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100[0.03] px-3 py-2.5"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ${meta.ring}`}>
                    <Leaf className={`h-4 w-4 ${meta.colour}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-forest">{entry.title}</p>
                    <p className="truncate text-[11px] text-slate-400">{entry.detail}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.badge}`}
                  >
                    {windowLabel(entry)}
                  </span>
                </li>
              );
            })}
          </ol>
        </FarmerSection>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── This month's tasks ── */}
        <FarmerSection title="This Month's Tasks">
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nothing scheduled for {MONTHS[monthCursor.month]}. Move to another month, or add{" "}
              {selected} under Crop Management to anchor the dates.
            </p>
          ) : (
            <ul className="space-y-2">
              {tasks.slice(0, 6).map((task) => (
                <li key={task.key} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${task.done
                        ? "border-brand-700 bg-brand-100 text-brand-700"
                        : "border-slate-200"
                      }`}
                  >
                    {task.done && <ListChecks className="h-2.5 w-2.5" />}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-medium ${task.done ? "text-slate-500 line-through" : "text-slate-200"
                        }`}
                    >
                      {task.title} — {task.detail}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formatDate(task.date)} · {ACTIVITY_META[task.kind].label}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FarmerSection>

        {/* ── Weather alert ── */}
        <FarmerSection title="Weather Alert">
          {weather ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
                  <CloudRain className="h-3 w-3" />
                  {weather.forecast[0]?.rainChance ?? 0}% rain
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <MapPin className="h-3 w-3" /> {weather.place}
                </span>
              </div>
              <p className="mt-2 font-display text-3xl font-bold text-forest">{weather.temp}°C</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Droplets className="h-3 w-3 text-sky-400" /> Humidity {weather.humidity}%
              </p>
              <p className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-[11px] leading-relaxed text-sky-200">
                <Lightbulb className="mr-1 inline h-3 w-3" />
                {weather.forecast[0] && weather.forecast[0].rainChance >= 60
                  ? "Skip irrigation today — heavy rain is likely. Check drainage in low fields."
                  : "Conditions are fit for field work. Irrigate early morning to save water."}
              </p>
              <Link
                to="/weather"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
              >
                Full forecast <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              {district
                ? "Live weather is not configured for this build. Add your district and the weather key to see farming advice here."
                : "Add your state and district to your profile to get weather-based advice for your area."}
            </p>
          )}
        </FarmerSection>

        {/* ── Smart tips ── */}
        <FarmerSection title="Smart Tips">
          <ul className="space-y-2">
            {profileForCrop.tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-xs text-slate-500">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
                {tip}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
            General agronomy for {selected} — confirm with your local extension officer.
          </p>
        </FarmerSection>
      </div>
    </div>
    </FeatureShell>
  );
}
