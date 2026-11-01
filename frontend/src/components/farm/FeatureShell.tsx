import type { ReactNode } from "react";
import { FlaskConical, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { FarmerHero, FarmerShell } from "@/components/farm/FarmerShell";

/**
 * Shared chrome for the farmer feature pages (advisory, marketplace, …).
 * Keeping it in one place means every page carries the same honest "demo"
 * marking instead of each one inventing its own.
 */

/** Small, unmissable marker that a screen is not yet backed by real data. */
export function DemoBadge({ label = "Demo" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
      <FlaskConical className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * Page frame for the farmer feature pages.
 *
 * Renders the FULL farmer chrome (sidebar, header, hover rail, search, bell)
 * through `<FarmerShell>`, so a feature page looks and navigates exactly like
 * the dashboard instead of being a separate mini-site with a back link.
 *
 * Signature kept identical to the old shell, so every existing page upgraded
 * by importing this — no page had to be rewritten for the new layout.
 */
export function FeatureShell({
  title,
  description,
  demo = false,
  demoNote,
  children,
}: {
  title: string;
  description?: string;
  demo?: boolean;
  /** Why it is a demo and what is missing — shown in a banner when `demo`. */
  demoNote?: string;
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const details = profile?.details ?? {};
  const locationLine =
    [details.village, details.district, details.state].filter(Boolean).join(", ") ||
    "Location not set";

  return (
    <FarmerShell>
      <FarmerHero
        eyebrow={locationLine}
        title={title}
        description={description ?? ""}
        aside={
          demo ? (
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                Status
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-bold">
                <MapPin className="h-3.5 w-3.5" /> Demo preview
              </p>
            </div>
          ) : undefined
        }
      />

      {demo && demoNote && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-amber-900">
            <span className="font-bold">Demo preview.</span> {demoNote}
          </p>
        </div>
      )}

      {children}
    </FarmerShell>
  );
}
