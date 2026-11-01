import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { describeCreatorError, getMyChannel } from "@/lib/creator";
import type { CreatorProfile } from "@/lib/creator";

export type ChannelState = "loading" | "ready" | "error";

/**
 * Resolves the signed-in user's channel once per page.
 *
 * Three states matter to the UI, and they are kept distinct on purpose:
 *   • `channel` null + `state` ready     → the user has no channel yet
 *   • `state` error                      → tables not migrated / not signed in
 *   • `state` loading                    → still resolving
 *
 * `canCreate` is false until the channel exists, so the "Create" button never
 * leads to a form that cannot be saved.
 */
export function useCreatorChannel() {
  const { user, profile } = useAuth();
  const [channel, setChannel] = useState<CreatorProfile | null>(null);
  const [state, setState] = useState<ChannelState>("loading");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!user) {
      setState("ready");
      setChannel(null);
      return;
    }
    try {
      setChannel(await getMyChannel());
      setState("ready");
      setError("");
    } catch (err) {
      setState("error");
      setError(describeCreatorError(err));
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isContentCreator = profile?.role === "Content Creator";

  return {
    channel,
    state,
    error,
    reload,
    setChannel,
    /** A channel is required before uploading or going live. */
    canCreate: Boolean(channel),
    /** True for the Content Creator role, even before a channel exists. */
    isContentCreator,
  };
}
