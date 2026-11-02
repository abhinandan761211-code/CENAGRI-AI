/**
 * Crop reference data — the handful of facts the Crop Management screen needs
 * about a crop that are the same for every farmer.
 *
 * Everything here is a *rate* or a *name*, never a measurement: the crop's own
 * row holds what was actually planted, so the growth stage and trend are
 * derived from it and can never contradict the record.
 */

export type CropStatus = "healthy" | "monitor" | "at_risk" | "harvested";

export type CropProfile = {
  /** Whole-season length in a typical Bengal growing window. */
  growthDays: number;
  /** Short, human-readable stage names, in order, with the share of the season each covers. */
  stages: { name: string; share: number }[];
};

/**
 * Defaults for the crops the platform actually talks about. Anything not
 * listed falls back to `DEFAULT_PROFILE`, so an unusual crop still gets a
 * sensible season instead of a blank chart.
 */
export const CROP_PROFILES: Record<string, CropProfile> = {
  wheat: {
    growthDays: 120,
    stages: [
      { name: "Germination", share: 0.12 },
      { name: "Tillering", share: 0.2 },
      { name: "Vegetative Stage", share: 0.25 },
      { name: "Flowering", share: 0.23 },
      { name: "Maturity", share: 0.2 },
    ],
  },
  rice: {
    growthDays: 135,
    stages: [
      { name: "Nursery", share: 0.13 },
      { name: "Transplanting", share: 0.12 },
      { name: "Tillering", share: 0.22 },
      { name: "Panicle Initiation", share: 0.25 },
      { name: "Grain Filling", share: 0.28 },
    ],
  },
  maize: {
    growthDays: 100,
    stages: [
      { name: "Emergence", share: 0.15 },
      { name: "Vegetative Stage", share: 0.3 },
      { name: "Tasselling", share: 0.2 },
      { name: "Silking", share: 0.15 },
      { name: "Maturity", share: 0.2 },
    ],
  },
  soybean: {
    growthDays: 105,
    stages: [
      { name: "Emergence", share: 0.15 },
      { name: "Vegetative Stage", share: 0.3 },
      { name: "Flowering", share: 0.2 },
      { name: "Pod Filling", share: 0.2 },
      { name: "Maturity", share: 0.15 },
    ],
  },
  tomato: {
    growthDays: 90,
    stages: [
      { name: "Nursery", share: 0.15 },
      { name: "Transplanting", share: 0.12 },
      { name: "Vegetative Stage", share: 0.25 },
      { name: "Flowering", share: 0.22 },
      { name: "Fruiting", share: 0.26 },
    ],
  },
  potato: {
    growthDays: 100,
    stages: [
      { name: "Sprouting", share: 0.15 },
      { name: "Vegetative Stage", share: 0.3 },
      { name: "Tuber Initiation", share: 0.2 },
      { name: "Tuber Bulking", share: 0.2 },
      { name: "Maturity", share: 0.15 },
    ],
  },
  mustard: {
    growthDays: 110,
    stages: [
      { name: "Germination", share: 0.15 },
      { name: "Rosette", share: 0.25 },
      { name: "Flowering", share: 0.3 },
      { name: "Pod Formation", share: 0.2 },
      { name: "Maturity", share: 0.1 },
    ],
  },
  jute: {
    growthDays: 120,
    stages: [
      { name: "Emergence", share: 0.15 },
      { name: "Rapid Growth", share: 0.4 },
      { name: "Flowering", share: 0.25 },
      { name: "Harvest Ready", share: 0.2 },
    ],
  },
};

export const DEFAULT_PROFILE: CropProfile = {
  growthDays: 120,
  stages: [
    { name: "Germination", share: 0.12 },
    { name: "Vegetative Stage", share: 0.33 },
    { name: "Flowering", share: 0.25 },
    { name: "Maturity", share: 0.3 },
  ],
};

/** Crop names offered in the add form — free text is still accepted. */
export const COMMON_CROPS = [
  "Wheat",
  "Rice",
  "Maize",
  "Soybean",
  "Tomato",
  "Potato",
  "Mustard",
  "Jute",
  "Pulses",
  "Vegetables",
];

export const STATUS_META: Record<
  CropStatus,
  { label: string; badge: string; dot: string; health: string }
> = {
  healthy: {
    label: "Healthy",
    badge: "bg-[#16C784]/15 text-[#2ED3B7] ring-1 ring-[#16C784]/30",
    dot: "bg-[#16C784]",
    health: "text-[#2ED3B7]",
  },
  monitor: {
    label: "Monitor",
    badge: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30",
    dot: "bg-amber-400",
    health: "text-amber-300",
  },
  at_risk: {
    label: "At risk",
    badge: "bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30",
    dot: "bg-rose-400",
    health: "text-rose-300",
  },
  harvested: {
    label: "Harvested",
    badge: "bg-white/10 text-slate-300 ring-1 ring-white/20",
    dot: "bg-slate-400",
    health: "text-slate-300",
  },
};

/** Health colour bands, used for the ring and the trend line. */
export function healthColour(health: number) {
  if (health >= 85) return "#16C784";
  if (health >= 65) return "#F59E0B";
  return "#F43F5E";
}

export function healthLabel(health: number) {
  if (health >= 85) return "Excellent";
  if (health >= 65) return "Fair";
  if (health >= 40) return "Needs attention";
  return "Poor";
}

/** A short emoji stand-in, so a crop without a photo still reads at a glance. */
export function cropEmoji(name: string) {
  const key = name.trim().toLowerCase();
  const map: Record<string, string> = {
    wheat: "🌾",
    rice: "🌾",
    paddy: "🌾",
    maize: "🌽",
    corn: "🌽",
    soybean: "🫘",
    "soya bean": "🫘",
    tomato: "🍅",
    potato: "🥔",
    mustard: "🌻",
    jute: "🌿",
    pulses: "🫘",
    vegetables: "🥬",
  };
  return map[key] ?? "🌱";
}

export function profileFor(name: string): CropProfile {
  return CROP_PROFILES[name.trim().toLowerCase()] ?? DEFAULT_PROFILE;
}
