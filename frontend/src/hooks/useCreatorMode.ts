import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Profile } from "@/types";

/**
 * Creator Mode — an opt-in ability to publish to the Kisan Video Hub.
 *
 * The hub has two sides and they are NOT the same permission:
 *
 *   • Watching  — every signed-in account, always. No creator mode needed.
 *   • Creating  — only accounts that switched Creator Mode on. This covers the
 *                 Content Creator role, and also lets a farmer, buyer, retailer
 *                 or worker publish without changing their account type.
 *
 * The flag lives in `profiles.creator_mode` (a real boolean column) so it can be
 * indexed and read by the API, and is mirrored into `details.creator_mode` for
 * rows written before that column existed. `details` is a JSON blob every role
 * already reads and writes, so the mirror keeps older projects working.
 *
 * The same value is mirrored into localStorage so the sidebar does not flicker
 * while the profile row is loading, and so a failed write still leaves the
 * choice on this device.
 */

const STORAGE_KEY = "kalika.creator_mode";

function readStored(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${STORAGE_KEY}:${userId}`) === "on";
  } catch {
    return false;
  }
}

function writeStored(userId: string | undefined, on: boolean) {
  if (!userId) return;
  try {
    if (on) localStorage.setItem(`${STORAGE_KEY}:${userId}`, "on");
    else localStorage.removeItem(`${STORAGE_KEY}:${userId}`);
  } catch {
    /* private mode / quota — the profile row is still the source of truth */
  }
}

export type CreatorModeSource = {
  /** The profile row as loaded (not the metadata-derived fallback). */
  profile: Pick<Profile, "creator_mode" | "details" | "updated_at"> | null;
  /** Raw auth metadata, used only while the profile row is still loading. */
  metadata: {
    creator_mode?: unknown;
    details?: Record<string, unknown> | null;
  } | null;
};

/**
 * Reads Creator Mode from the best source available.
 *
 * Order: the column, then `details.creator_mode` (written by both the legacy
 * hook and `saveDetails`), then the copy in auth metadata. The metadata copy is
 * consulted only for a profile that has not loaded yet, or whose row is old
 * enough that neither the column nor the details key was ever written — which
 * is exactly the case a projects that has not run the migration yet.
 */
export function resolveCreatorMode(source: CreatorModeSource): boolean {
  const { profile, metadata } = source;
  const details = (profile?.details ?? metadata?.details ?? null) as
    | Record<string, unknown>
    | null;
  const storedFlag = metadata?.creator_mode;

  if (profile) {
    if (typeof profile.creator_mode === "boolean") return profile.creator_mode;
    if (details && "creator_mode" in details) return creatorModeFromDetails(details);
    if (typeof storedFlag === "boolean") return storedFlag;
    if (typeof storedFlag === "string") return creatorModeFromDetails({ creator_mode: storedFlag });
    return false;
  }

  if (typeof storedFlag === "boolean") return storedFlag;
  if (typeof storedFlag === "string") return creatorModeFromDetails({ creator_mode: storedFlag });
  return creatorModeFromDetails(details);
}

/** Reads the flag out of a profile's `details` blob. */
export function creatorModeFromDetails(details: Record<string, unknown> | null | undefined): boolean {
  const value = details?.creator_mode;
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

export function useCreatorMode() {
  const { user, profile, saveDetails, setCreatorMode } = useAuth();
  const userId = user?.id;

  // `useAuth` exposes a metadata-merged profile when the row is missing columns
  // or still loading. `updated_at` is only ever set by a real row (`loadProfile`
  // returns "" for a synthetic one), so use it to tell the two apart.
  const isRealRow = Boolean(profile?.updated_at);
  const profileForCreatorMode = isRealRow ? profile : null;

  // The raw profile row and auth metadata, not `profile` (which is already a
  // metadata-merged fallback) — `resolveCreatorMode` does that merging itself.
  const profileFlag = useMemo(
    () =>
      resolveCreatorMode({
        profile: profileForCreatorMode,
        metadata: (user?.user_metadata ?? null) as CreatorModeSource["metadata"],
      }),
    [profileForCreatorMode, user?.user_metadata]
  );

  // The stored value is only a starting point; the profile row wins once it is
  // loaded, so a change made on another device is reflected here.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [stored, setStored] = useState<boolean>(() => readStored(userId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStored(readStored(userId));
    setOptimistic(null);
  }, [userId]);

  const enabled = optimistic ?? profileFlag ?? stored;

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!userId) return;
      setError("");
      setSaving(true);
      setOptimistic(next);
      writeStored(userId, next);
      setStored(next);

      // Keep every other answer in `details` — this writes one key, not the blob.
      // The column is written first by `setCreatorMode`; the key below remains
      // the fallback for accounts on a project without that column.
      const current = (profile?.details ?? {}) as Record<string, string>;
      const merged = { ...current, creator_mode: next ? "true" : "false" };

      try {
        // The column is the source of truth when it exists; `details` and auth
        // metadata carry the value when the project has not run the migration.
        await setCreatorMode(next);
        await saveDetails(merged);

        // Auth metadata is the fallback path used when the profiles table is
        // unreachable, exactly like role and location. Best effort.
        if (supabase) {
          await supabase.auth
            .updateUser({ data: { creator_mode: next } })
            .catch(() => undefined);
        }
      } catch (err) {
        // The device keeps the choice; the account did not. Say so instead of
        // silently pretending the switch worked.
        setOptimistic(null);
        setError(err instanceof Error ? err.message : "Could not save Creator Mode to your account.");
        writeStored(userId, profileFlag);
        setStored(profileFlag);
      } finally {
        setSaving(false);
      }
    },
    [userId, profile?.details, profileFlag, saveDetails, setCreatorMode]
  );

  return { enabled, saving, error, setEnabled, isContentCreator: profile?.role === "Content Creator" };
}
