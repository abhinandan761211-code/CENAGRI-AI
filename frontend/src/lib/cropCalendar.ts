/**
 * Crop calendar reference data.
 *
 * A schedule is the *timing* of a season, never a measurement: sowing window,
 * irrigation interval, fertilizer dose dates, pest checks and harvest window,
 * all expressed in days after sowing (DAS) or as a month window. The farmer's
 * own row in `public.crops` supplies what was actually planted, so a schedule
 * can be laid over any crop instead of inventing a planted date.
 */

export type ActivityKind =
  | "sowing"
  | "irrigation"
  | "fertilizer"
  | "pest"
  | "harvest"
  | "weeding";

export type ScheduleEntry = {
  kind: ActivityKind;
  /** What to do, in the farmer's words. */
  title: string;
  /** One line of detail shown under the title. */
  detail: string;
  /** Window relative to sowing. `from` may be negative for pre-sowing work. */
  from: number;
  to: number;
  /** Repeat every N days across the window (irrigation, scouting). */
  every?: number;
};

export type CropCalendarProfile = {
  emoji: string;
  /** Whole season length, matching `cropProfiles.ts` so stages agree. */
  growthDays: number;
  /** Sowing window as month/day, for the Kharif/Rabi/Rabi-mid calendar. */
  sowingWindow: string;
  entries: ScheduleEntry[];
  /** Crop-specific advice for the Smart Tips panel. */
  tips: string[];
};

export const ACTIVITY_META: Record<
  ActivityKind,
  { label: string; colour: string; ring: string; dot: string; badge: string }
> = {
  sowing: {
    label: "Sowing",
    colour: "text-[#2ED3B7]",
    ring: "bg-[#16C784]/15 ring-[#16C784]/30",
    dot: "bg-[#16C784]",
    badge: "bg-[#16C784]/15 text-[#2ED3B7] ring-1 ring-[#16C784]/30",
  },
  irrigation: {
    label: "Irrigation",
    colour: "text-sky-300",
    ring: "bg-sky-400/15 ring-sky-400/30",
    dot: "bg-sky-400",
    badge: "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/30",
  },
  fertilizer: {
    label: "Fertilizer",
    colour: "text-amber-300",
    ring: "bg-amber-400/15 ring-amber-400/30",
    dot: "bg-amber-400",
    badge: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30",
  },
  pest: {
    label: "Pest Control",
    colour: "text-rose-300",
    ring: "bg-rose-400/15 ring-rose-400/30",
    dot: "bg-rose-400",
    badge: "bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30",
  },
  harvest: {
    label: "Harvesting",
    colour: "text-orange-300",
    ring: "bg-orange-400/15 ring-orange-400/30",
    dot: "bg-orange-400",
    badge: "bg-orange-400/15 text-orange-300 ring-1 ring-orange-400/30",
  },
  weeding: {
    label: "Weeding",
    colour: "text-lime-300",
    ring: "bg-lime-400/15 ring-lime-400/30",
    dot: "bg-lime-400",
    badge: "bg-lime-400/15 text-lime-300 ring-1 ring-lime-400/30",
  },
};

/** Crop names offered as chips, in the design's order. */
export const CALENDAR_CROPS = ["Wheat", "Rice", "Tomato", "Maize", "Soybean"] as const;

export const CALENDARS: Record<string, CropCalendarProfile> = {
  wheat: {
    emoji: "🌾",
    growthDays: 120,
    sowingWindow: "15 Nov – 30 Dec",
    entries: [
      { kind: "sowing", title: "Sowing Date", detail: "Best time: 15 Nov – 30 Dec", from: 0, to: 0 },
      { kind: "irrigation", title: "Irrigation", detail: "Every 20–25 days", from: 20, to: 100, every: 22 },
      { kind: "fertilizer", title: "Fertilizer", detail: "Urea + DAP at 20–25 DAS", from: 20, to: 25 },
      { kind: "pest", title: "Pest Control", detail: "Check for aphids & termites", from: 30, to: 105, every: 15 },
      { kind: "harvest", title: "Harvesting", detail: "Ready in 120–140 days", from: 120, to: 140 },
    ],
    tips: [
      "Sow wheat in well-drained soil.",
      "Use recommended fertilizer dose.",
      "Monitor for leaf diseases regularly.",
      "Keep proper irrigation schedule.",
    ],
  },
  rice: {
    emoji: "🌾",
    growthDays: 135,
    sowingWindow: "10 Jun – 10 Jul",
    entries: [
      { kind: "sowing", title: "Nursery Sowing", detail: "Raise seedlings 20–25 days before transplanting", from: -25, to: -20 },
      { kind: "sowing", title: "Transplanting", detail: "Best time: 10 Jun – 10 Jul", from: 0, to: 0 },
      { kind: "irrigation", title: "Irrigation", detail: "Keep 5 cm standing water; drain before harvest", from: 5, to: 120, every: 5 },
      { kind: "fertilizer", title: "Fertilizer", detail: "Urea + SSP split into three doses", from: 15, to: 20 },
      { kind: "weeding", title: "Weeding", detail: "Remove weeds at 20 and 45 DAS", from: 20, to: 45, every: 25 },
      { kind: "pest", title: "Pest Control", detail: "Scout for stem borer & BLB", from: 25, to: 115, every: 12 },
      { kind: "harvest", title: "Harvesting", detail: "Ready in 130–140 days", from: 130, to: 140 },
    ],
    tips: [
      "Transplant 2–3 seedlings per hill.",
      "Keep 5 cm water till panicle initiation.",
      "Drain the field 10 days before harvest.",
      "Watch for yellowing — it signals nitrogen shortage.",
    ],
  },
  tomato: {
    emoji: "🍅",
    growthDays: 90,
    sowingWindow: "Oct – Nov (rabi)",
    entries: [
      { kind: "sowing", title: "Nursery Sowing", detail: "Raise seedlings under cover, 25 days ahead", from: -25, to: -20 },
      { kind: "sowing", title: "Transplanting", detail: "Best time: Oct – Nov", from: 0, to: 0 },
      { kind: "irrigation", title: "Irrigation", detail: "Drip every 3–4 days", from: 4, to: 85, every: 4 },
      { kind: "fertilizer", title: "Fertilizer", detail: "DAP at transplant + urea at 30 DAS", from: 30, to: 35 },
      { kind: "pest", title: "Pest Control", detail: "Look for early blight & fruit borer", from: 20, to: 80, every: 10 },
      { kind: "harvest", title: "Harvesting", detail: "Pick at 60–75 days, in stages", from: 60, to: 90 },
    ],
    tips: [
      "Stake plants to keep fruit off the soil.",
      "Mulch to hold moisture and stop fruit rot.",
      "Pick at breaker stage for longer shelf life.",
      "Avoid overhead watering in humid weather.",
    ],
  },
  maize: {
    emoji: "🌽",
    growthDays: 100,
    sowingWindow: "Jun – Jul (kharif)",
    entries: [
      { kind: "sowing", title: "Sowing Date", detail: "Best time: Jun – Jul", from: 0, to: 0 },
      { kind: "irrigation", title: "Irrigation", detail: "Critical at knee-high and tasselling", from: 20, to: 70, every: 10 },
      { kind: "fertilizer", title: "Fertilizer", detail: "Urea at 25 and 45 DAS", from: 25, to: 45 },
      { kind: "pest", title: "Pest Control", detail: "Check for fall armyworm in the whorl", from: 20, to: 80, every: 10 },
      { kind: "harvest", title: "Harvesting", detail: "Ready in 95–105 days", from: 95, to: 105 },
    ],
    tips: [
      "Sow on ridges if drainage is poor.",
      "Fall armyworm attacks the whorl first — scout early.",
      "Do not let plants wilt at tasselling.",
      "Harvest when husk turns dry and brown.",
    ],
  },
  soybean: {
    emoji: "🫘",
    growthDays: 105,
    sowingWindow: "Jun – Jul (kharif)",
    entries: [
      { kind: "sowing", title: "Sowing Date", detail: "Best time: Jun – Jul, ridge sown", from: 0, to: 0 },
      { kind: "irrigation", title: "Irrigation", detail: "Rain-fed; one protective irrigation at flowering", from: 40, to: 60, every: 20 },
      { kind: "fertilizer", title: "Fertilizer", detail: "DAP + Rhizobium seed treatment", from: 5, to: 10 },
      { kind: "pest", title: "Pest Control", detail: "Check for girdle beetle & yellow mosaic", from: 25, to: 85, every: 12 },
      { kind: "harvest", title: "Harvesting", detail: "Ready in 100–110 days", from: 100, to: 110 },
    ],
    tips: [
      "Treat seed with Rhizobium before sowing.",
      "Avoid waterlogging — roots rot within days.",
      "Stop irrigation after pod filling.",
      "Harvest promptly; pods shatter when overripe.",
    ],
  },
};

export const DEFAULT_CALENDAR: CropCalendarProfile = {
  emoji: "🌱",
  growthDays: 120,
  sowingWindow: "As per your crop",
  entries: [
    { kind: "sowing", title: "Sowing Date", detail: "Follow your local sowing window", from: 0, to: 0 },
    { kind: "irrigation", title: "Irrigation", detail: "Every 15–20 days", from: 15, to: 90, every: 18 },
    { kind: "fertilizer", title: "Fertilizer", detail: "Basal dose + one top dressing", from: 20, to: 40 },
    { kind: "pest", title: "Pest Control", detail: "Weekly field scouting", from: 25, to: 90, every: 14 },
    { kind: "harvest", title: "Harvesting", detail: "At maturity", from: 110, to: 125 },
  ],
  tips: [
    "Check your field after every rainfall.",
    "Keep notes of what you applied and when.",
    "Scout for pests early in the morning.",
  ],
};

export function calendarFor(name: string): CropCalendarProfile {
  return CALENDARS[name.trim().toLowerCase()] ?? DEFAULT_CALENDAR;
}

/** A dated activity — the shape the calendar grid and task list consume. */
export type ScheduledActivity = {
  /** Stable key: kind + day, so the same task never appears twice. */
  key: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  date: string;
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(from: Date, to: Date) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Expand a profile into real dates for a season that started on `sowingOn`.
 *
 * One repeating entry (irrigation every 20 days) becomes many dated rows, so
 * the month grid can mark every one of them. Anything beyond the season end is
 * dropped — a calendar should not promise irrigation after harvest.
 */
export function scheduleActivities(
  profile: CropCalendarProfile,
  sowingOn: Date,
  seasonEnd?: Date
): ScheduledActivity[] {
  const out: ScheduledActivity[] = [];
  const end = seasonEnd ?? addDays(sowingOn, profile.growthDays);

  for (const entry of profile.entries) {
    if (entry.every && entry.every > 0) {
      for (let day = entry.from; day <= entry.to; day += entry.every) {
        const date = addDays(sowingOn, day);
        if (date > end) break;
        out.push({
          key: `${entry.kind}-${day}`,
          kind: entry.kind,
          title: entry.title,
          detail: entry.detail,
          date: iso(date),
        });
      }
      continue;
    }
    // A window (from..to) marks its start; a single-day entry is its own date.
    const date = addDays(sowingOn, entry.from);
    if (date > addDays(end, 14)) continue;
    out.push({
      key: `${entry.kind}-${entry.from}`,
      kind: entry.kind,
      title: entry.title,
      detail: entry.detail,
      date: iso(date),
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Activities dated inside a given month, keyed by day-of-month. */
export function activitiesByDay(
  activities: ScheduledActivity[],
  year: number,
  month: number
): Map<number, ScheduledActivity[]> {
  const map = new Map<number, ScheduledActivity[]>();
  for (const activity of activities) {
    const [y, m, d] = activity.date.split("-").map(Number);
    if (y !== year || m - 1 !== month) continue;
    const list = map.get(d) ?? [];
    list.push(activity);
    map.set(d, list);
  }
  return map;
}

/**
 * The month's to-do list, in the farmer's words. Anything due in the shown
 * month is a task; past-dated ones are marked done only if they are older than
 * today, which keeps the list honest instead of ticking everything.
 */
export function monthTasks(activities: ScheduledActivity[], year: number, month: number, today = new Date()) {
  return activities
    .filter((a) => {
      const [y, m] = a.date.split("-").map(Number);
      return y === year && m - 1 === month && a.kind !== "sowing" && a.kind !== "harvest";
    })
    .map((a) => ({
      ...a,
      // Compare date strings, not Date objects: `new Date("2024-03-01")` is
      // parsed as UTC midnight, so a local-timezone comparison marks today's
      // task as overdue west of Greenwich.
      done: a.date < iso(today),
    }));
}

/** Monthly calendar cells, Sunday-first, padded to whole weeks. */
export function monthMatrix(year: number, month: number): { date: Date | null }[] {
  const first = new Date(year, month, 1);
  const lead = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date | null }[] = [];
  for (let i = 0; i < lead; i++) cells.push({ date: null });
  for (let d = 1; d <= days; d++) cells.push({ date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });
  return cells;
}

export function formatDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/** "Every 20–25 days", "At 20–25 DAS", "Mar – Apr" — the chip beside a row. */
export function windowLabel(entry: ScheduleEntry) {
  if (entry.kind === "sowing" || entry.kind === "harvest") return entry.detail.replace(/^(Best time|Ready in):?\s*/i, "");
  if (entry.every) return `Every ${entry.every} days`;
  if (entry.from === entry.to) return `${entry.from} DAS`;
  return `${entry.from}–${entry.to} DAS`;
}
