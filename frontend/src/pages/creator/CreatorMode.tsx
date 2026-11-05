import { useState } from "react";
import { Clapperboard, Eye, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import CreatorShell, { CREATOR_ROUTES, HUB_ROUTE, STUDIO_ROUTE } from "@/components/creator/CreatorShell";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import { useCreatorMode } from "@/hooks/useCreatorMode";

/**
 * The Creator Mode switch — `/creator-mode`.
 *
 * This screen exists because of a loop. Every studio page (`/creator/*`) is
 * wrapped in <CreatorModeRoute>, which redirects an account with the mode off
 * back to `/video-hub?creator=off`. The only place that could switch the mode
 * on was `/creator/settings` — inside the very guarded tree it had to unlock.
 * So "Turn on Creator Mode" on the hub (and the "Creator Studio" entries in the
 * account sidebars) bounced straight back to the watch feed and looked dead.
 *
 * It lives outside `/creator/*`, is wrapped only in <ProtectedRoute> (App.tsx),
 * and writes the flag through `useCreatorMode`, which does not need the mode to
 * be on. Turning it on also creates the channel when there is none yet, since
 * the channel row is what publishing hangs off.
 */
export default function CreatorMode() {
  const navigate = useNavigate();
  const { enabled, saving, error, setEnabled } = useCreatorMode();
  const { channel, reload } = useCreatorChannel();
  const [notice, setNotice] = useState("");

  async function enable() {
    setNotice("");
    await setEnabled(true);
    // A channel is required before uploading; open the form that creates it.
    await reload().catch(() => undefined);
    navigate(CREATOR_ROUTES.settings, { replace: true });
  }

  return (
    <CreatorShell
      hub
      title={enabled ? "Creator Mode is on" : "Turn on Creator Mode"}
      subtitle={
        enabled
          ? "You can publish to Kisan Video Hub from this account."
          : "Publish videos and shorts to Kisan Video Hub. Watching stays open to everyone."
      }
    >
      <div className="creator-card rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--cr-green)]/15 text-[var(--cr-green)]">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="creator-heading text-sm font-bold">
              {enabled ? "Publishing is unlocked" : "Publishing is off for this account"}
            </p>
            <p className="text-[12px] leading-relaxed text-slate-400">
              {enabled
                ? "Open the studio to upload a video, go live or check analytics."
                : "Creator Mode is an account setting, not an account type. A farmer, buyer or retailer can publish without changing their role."}
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            {notice}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Link to={STUDIO_ROUTE} className="creator-btn-primary h-9 px-4 text-xs">
                <Clapperboard className="h-3.5 w-3.5" />
                Open Creator Studio
              </Link>
              <Link to={CREATOR_ROUTES.settings} className="creator-btn-ghost h-9 px-3 text-xs">
                {channel ? "Channel settings" : "Create your channel"}
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void enable()}
                disabled={saving}
                className="creator-btn-primary h-9 px-4 text-xs disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
                {saving ? "Turning on…" : "Turn on Creator Mode"}
              </button>
              <Link to={HUB_ROUTE} className="creator-btn-ghost h-9 px-3 text-xs">
                <Eye className="h-3.5 w-3.5" />
                Keep watching
              </Link>
            </>
          )}
        </div>
      </div>
    </CreatorShell>
  );
}
