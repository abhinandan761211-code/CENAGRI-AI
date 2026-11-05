import { Loader2 } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Full-screen "connecting to your account" screen.
 *
 * Shown from the moment the user submits a sign-in until the real Supabase
 * session AND its profile have actually arrived. Without it the Login form
 * un-disables its button as soon as the network call returns, so a slow or
 * failing connection looked like nothing happened and the user clicked again.
 *
 * It covers the WHOLE viewport (not just the form column) so nothing behind it
 * can be clicked while the account is still being connected.
 */
export default function SigningInOverlay({
  /** Progress line, e.g. "Loading your farm data…". Falls back to the generic text. */
  message,
}: {
  message?: string;
}) {
  const { t } = useLang();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[80] grid place-items-center bg-cream/95 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl2 border border-slate-200 bg-white p-8 text-center shadow-card">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-700" aria-hidden="true" />
        <h1 className="mt-4 font-display text-lg font-bold text-forest">{t("auth.connecting")}</h1>
        <p className="mt-2 text-sm text-slate-500">{message ?? t("auth.connectingBody")}</p>

        {/* Indeterminate bar: a sign-in has no known length, so it must never
            look stuck at a fixed percentage. */}
        <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-600" />
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">{t("auth.connectingHint")}</p>
      </div>
    </div>
  );
}
