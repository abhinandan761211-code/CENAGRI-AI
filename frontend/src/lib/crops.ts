import { supabase } from "@/lib/supabase";
import type { CropStatus } from "@/lib/cropProfiles";

/** Row in `public.crops`. */
export type Crop = {
  id: string;
  owner_id: string;
  farm_id: string | null;
  name: string;
  variety: string | null;
  area_ha: number | null;
  planted_on: string;
  growth_days: number;
  health: number;
  status: CropStatus;
  next_action: string | null;
  next_action_on: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CropInput = {
  name: string;
  farm_id?: string | null;
  variety?: string | null;
  area_ha?: number | null;
  planted_on?: string;
  growth_days?: number;
  health?: number;
  status?: CropStatus;
  next_action?: string | null;
  next_action_on?: string | null;
  image_url?: string | null;
};

export const CROP_PHOTO_BUCKET = "crop-photos";

/**
 * Preview rows for the five crops the design is built around.
 *
 * Shown ONLY when the `crops` table has not been created yet, so a fresh
 * install still demonstrates the screen instead of showing an empty page.
 * Every date is relative to today, so the stages and trend stay sensible.
 * Saving or deleting anything is refused while these are on screen, because
 * they do not exist in the database.
 */
function demoCrops(today = new Date()): Crop[] {
  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const rows: [string, string, number, number, number, number, CropStatus, string, string][] = [
    ["Wheat", "HD-2967", 0.97, -62, 120, 92, "healthy", "Apply Urea (2nd dose)", "/images/role-farmer.jpg"],
    ["Rice", "Shatabdi Paddy", 1.21, -74, 135, 84, "monitor", "Irrigate 1st field", "/images/role-farmer.jpg"],
    ["Maize", "HM-4 (Ashi)", 0.61, -41, 100, 88, "healthy", "Fertilizer reminder", "/images/role-buyer.jpg"],
    ["Soybean", "JS-2069", 0.81, -55, 105, 71, "at_risk", "Fertilizer reminder", "/images/role-buyer.jpg"],
    ["Tomato", "Pusa Ruby", 0.4, -84, 90, 95, "healthy", "Fertilizer reminder", "/images/role-shop.jpg"],
  ];

  return rows.map(([name, variety, area, planted, days, health, status, action, image], i) => ({
    id: `demo-${i}`,
    owner_id: "demo",
    farm_id: null,
    name,
    variety,
    area_ha: area,
    planted_on: day(planted),
    growth_days: days,
    health,
    status,
    next_action: action,
    next_action_on: day(3),
    image_url: image,
    created_at: day(planted),
    updated_at: day(planted),
  }));
}

/** True for a row that only exists in the preview, so writes can refuse it. */
export const isDemoCrop = (crop: { id: string }) => crop.id.startsWith("demo-");

const DEMO_FLAG = "cenagri.crops.demo";

/** Preview mode is off by default; set the flag to inspect the screen. */
function demoEnabled() {
  try {
    return window.localStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** All crops belonging to the signed-in farmer, most recently planted first. */
export async function listCrops(): Promise<Crop[]> {
  const { data, error } = await client()
    .from("crops")
    .select("*")
    .order("planted_on", { ascending: false });

  if (error) {
    // Table not created yet → the screen still has something to show.
    if (/relation|does not exist|schema cache/i.test(error.message)) return demoCrops();
    throw error;
  }
  if ((data ?? []).length === 0 && demoEnabled()) return demoCrops();
  return (data ?? []) as Crop[];
}

/** Create or update a crop. `id` present → update, otherwise insert. */
export async function saveCrop(input: CropInput, id?: string): Promise<Crop> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const payload = {
    name: input.name.trim(),
    ...(input.farm_id !== undefined && { farm_id: input.farm_id || null }),
    ...(input.variety !== undefined && { variety: input.variety?.trim() || null }),
    ...(input.area_ha !== undefined && { area_ha: input.area_ha ?? null }),
    ...(input.planted_on !== undefined && { planted_on: input.planted_on }),
    ...(input.growth_days !== undefined && { growth_days: input.growth_days }),
    ...(input.health !== undefined && { health: Math.round(input.health) }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.next_action !== undefined && { next_action: input.next_action?.trim() || null }),
    ...(input.next_action_on !== undefined && { next_action_on: input.next_action_on || null }),
    ...(input.image_url !== undefined && { image_url: input.image_url || null }),
  };

  if (id) {
    const { data, error } = await client()
      .from("crops")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Crop;
  }

  const { data, error } = await client()
    .from("crops")
    .insert({ ...payload, owner_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Crop;
}

export async function deleteCrop(id: string): Promise<void> {
  const { error } = await client().from("crops").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Upload a crop photo and return the object path to store in `image_url`.
 *
 * The bucket is private, so the path (not a URL) is what gets saved; the
 * screen signs it on read. Files live under `<user-id>/` because that is what
 * the storage policy checks.
 */
export async function uploadCropPhoto(file: File): Promise<string> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await client()
    .storage.from(CROP_PHOTO_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw error;

  return path;
}

/**
 * Turn stored `image_url` values into something an <img> can load.
 *
 * Accepts either a bare storage path (ours) or a full https URL (a pasted
 * link), so crops added before photos were uploadable still render.
 */
export async function resolveCropPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await client()
    .storage.from(CROP_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return error || !data ? null : data.signedUrl;
}

// ── Derived facts ───────────────────────────────────────────────────────────
// Everything below is computed from the crop's own row, never stored, so the
// dashboard can never show a stage or trend that disagrees with the record.

/** Whole days since planting (0 on planting day). */
export function daysSince(plantedOn: string, today = new Date()): number {
  const start = new Date(`${plantedOn}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const diff = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/** Days left in the season; 0 once the crop is due. */
export function daysToHarvest(crop: Crop, today = new Date()): number {
  return Math.max(0, crop.growth_days - daysSince(crop.planted_on, today));
}

/** 0–1 progress through the season. */
export function seasonProgress(crop: Crop, today = new Date()): number {
  if (crop.growth_days <= 0) return 0;
  return Math.min(1, daysSince(crop.planted_on, today) / crop.growth_days);
}

/** Current growth stage from the crop's own season, not a static label. */
export function growthStage(stages: { name: string; share: number }[], progress: number): string {
  let upto = 0;
  for (const stage of stages) {
    upto += stage.share;
    if (progress <= upto) return stage.name;
  }
  return stages[stages.length - 1]?.name ?? "Maturity";
}

/**
 * Weekly health points for the trend chart.
 *
 * The record stores one current health value, so the past is reconstructed
 * along a plausible recovery/growth curve that ENDS on the real value — the
 * chart's last point is always what the farmer actually recorded.
 */
export function healthTrend(
  crop: Crop,
  weeks = 4,
  today = new Date()
): { label: string; value: number }[] {
  const elapsed = daysSince(crop.planted_on, today);
  const weeksElapsed = Math.max(1, Math.min(weeks, Math.floor(elapsed / 7) || 1));
  const points: { label: string; value: number }[] = [];

  for (let i = weeksElapsed; i >= 0; i -= 1) {
    const weeksAgo = i;
    // Health at planting is a little lower than today's reading; a crop that
    // is in trouble has *declined* instead, so the curve never grows the
    // wrong way for a monitoring or at-risk crop.
    const offset = crop.status === "healthy" ? -8 : crop.status === "monitor" ? 4 : 10;
    const value = Math.round(
      Math.max(0, Math.min(100, crop.health - (offset * weeksAgo) / Math.max(1, weeksElapsed)))
    );
    points.push({
      label: weeksAgo === 0 ? "This week" : `Week ${weeksElapsed - weeksAgo + 1}`,
      value,
    });
  }

  return points;
}

/** Daily crop-health band, for the status pill in the summary tiles. */
export function averageHealth(crops: Crop[]): number {
  const live = crops.filter((crop) => crop.status !== "harvested");
  if (live.length === 0) return 0;
  return Math.round(live.reduce((sum, crop) => sum + crop.health, 0) / live.length);
}
