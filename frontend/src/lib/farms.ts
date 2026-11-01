import { supabase } from "@/lib/supabase";

/** Row in `public.farms`. */
export type Farm = {
  id: string;
  owner_id: string;
  name: string;
  location: string | null;
  area_ha: number | null;
  soil_type: string | null;
  irrigation: string | null;
  crops: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FarmInput = {
  name: string;
  location?: string | null;
  area_ha?: number | null;
  soil_type?: string | null;
  irrigation?: string | null;
  crops?: string[];
  is_active?: boolean;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** All farms belonging to the signed-in user, newest first. */
export async function listFarms(): Promise<Farm[]> {
  const { data, error } = await client()
    .from("farms")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Farm[];
}

/** Create or rename a farm. `id` present → update, otherwise insert. */
export async function saveFarm(input: FarmInput, id?: string): Promise<Farm> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const payload = {
    name: input.name.trim(),
    location: input.location?.trim() || null,
    area_ha: input.area_ha ?? null,
    // Optional keys: only sent when the caller actually set them, so a farm
    // rename from the dashboard never blanks the detail fields.
    ...(input.soil_type !== undefined && { soil_type: input.soil_type || null }),
    ...(input.irrigation !== undefined && { irrigation: input.irrigation || null }),
    ...(input.crops !== undefined && { crops: input.crops }),
    ...(input.is_active !== undefined && { is_active: input.is_active }),
  };

  if (id) {
    const { data, error } = await client()
      .from("farms")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Farm;
  }

  const { data, error } = await client()
    .from("farms")
    .insert({ ...payload, owner_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Farm;
}

export async function deleteFarm(id: string): Promise<void> {
  const { error } = await client().from("farms").delete().eq("id", id);
  if (error) throw error;
}

/** Acres → hectares, for the farmer-facing "acre" inputs. */
export const acresToHa = (acres: number) => Math.round(acres * 0.404686 * 100) / 100;
export const haToAcres = (ha: number) => Math.round((ha / 0.404686) * 10) / 10;
