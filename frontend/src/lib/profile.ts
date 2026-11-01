import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

/** Profile values captured from the signup form and stored in auth metadata. */
export type SignupMetadata = {
  full_name?: string;
  phone?: string;
  role?: string;
};

export function metadataToProfile(
  user: User
): Omit<Profile, "created_at" | "updated_at" | "details"> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (key: string) => {
    const value = meta[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  return {
    id: user.id,
    full_name: pick("full_name") ?? pick("name") ?? pick("full_name_google"),
    email: user.email ?? null,
    phone: pick("phone") ?? user.phone ?? null,
    role: pick("role"),
    avatar_url: pick("avatar_url") ?? pick("picture"),
  };
}

/**
 * Fetches the signed-in user's profile row, creating it from auth metadata when
 * the database trigger has not (yet) done so — e.g. on OAuth sign-in.
 */
export async function loadProfile(user: User): Promise<Profile | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!error && data) {
    const profile = data as Profile;
    // A row that is missing its role, or whose role details were never written
    // (OAuth re-login, a retry over an existing row, a trigger that ran before
    // the answers were set), cannot drive the role dashboards. The signup form
    // always writes role + location to auth metadata, so repair from there.
    const meta = metadataToProfile(user);
    const metaDetails = (user.user_metadata?.details ?? {}) as Record<string, string>;
    const metaLocation: Record<string, string> = {};
    for (const key of ["state", "district", "village"]) {
      const value = user.user_metadata?.[key];
      if (typeof value === "string" && value.trim()) metaLocation[key] = value.trim();
    }

    const patch: Record<string, unknown> = {};
    if (!profile.role && meta.role) patch.role = meta.role;
    if (!profile.phone && meta.phone) patch.phone = meta.phone;

    const existingDetails = profile.details ?? {};
    const missingDetails = Object.keys(existingDetails).length === 0;
    if (missingDetails) {
      const merged = { ...metaDetails, ...metaLocation };
      if (Object.keys(merged).length > 0) patch.details = merged;
    }

    if (Object.keys(patch).length > 0) {
      const { data: repaired } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id)
        .select()
        .maybeSingle();
      if (repaired) return repaired as Profile;
    }
    return profile;
  }

  // Accounts created before the `details` column existed still load fine.
  if (error?.code === "42703" || error?.message?.includes("details")) {
    const { data: legacy } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, avatar_url, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle();
    if (legacy) return { ...(legacy as Profile), details: null };
  }

  const row = metadataToProfile(user);
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select()
    .maybeSingle();

  if (insertError) {
    // Table may not exist yet — fall back to metadata so the UI still works.
    return { ...row, details: null, created_at: "", updated_at: "" };
  }
  return (created as Profile | null) ?? null;
}
