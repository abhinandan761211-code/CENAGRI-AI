import { Link } from "react-router-dom";
import {
  ExternalLink,
  FileText,
  PhoneCall,
  ShieldCheck,
  ShieldQuestion,
  Sprout,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import { Chip, PageHeader, Panel, Stat } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { INSURANCE_LINKS, INSURANCE_STEPS } from "@/lib/schemes";

/**
 * Crop Insurance.
 *
 * This screen explains the scheme and the claim process and links to the
 * official portal. Premiums and coverage are set every season by the
 * government and the insurer, so no amount is copied into the app: it would go
 * out of date and mislead a farmer making a decision.
 */
export default function InsurancePage() {
  const { profile } = useAuth();
  const details = profile?.details ?? {};

  return (
    <FarmerShell>
      <PageHeader
        icon={ShieldCheck}
        title="Crop Insurance"
        description="How crop insurance (PM Fasal Bima Yojana) works, what you need at enrolment, and the steps to follow if a crop is damaged."
        meta={<Chip tone="green" icon={ShieldCheck}>Official PMFBY information</Chip>}
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-900">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>CenAGRI does not sell, approve or settle crop insurance.</strong> Premium rates, notified crops,
            coverage and claim decisions are set by the government scheme and the insurance company. This page
            links to those sources; it does not guarantee enrolment or a payout.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Scheme" value="PMFBY" icon={ShieldCheck} hint="Pradhan Mantri Fasal Bima Yojana" />
        <Stat label="Your district" value={details.district ?? "—"} icon={Sprout} tone="teal" hint="Notified crops depend on it" />
        <Stat label="Your crops" value={details.main_crops ?? "—"} icon={Sprout} tone="blue" hint="Check if they are notified" />
        <Stat label="Report loss within" value="72 hours" icon={AlertCircle} tone="amber" hint="Confirm the exact window in the rules" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="What the scheme covers" icon={ShieldCheck}>
          <div className="space-y-3 p-4 text-[12px] leading-relaxed text-slate-600">
            <p>
              PMFBY insures <strong>notified crops in notified areas</strong> for the season. The most common
              covered events are:
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {[
                "Drought, dry spell and flood",
                "Cyclone and storm damage",
                "Pest and disease attack (as notified)",
                "Localised calamities — hailstorm, landslide, inundation",
                "Post-harvest losses for specified crops",
              ].map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-bold text-forest">Premium share</p>
              <p className="mt-0.5 text-[11px]">
                The farmer's share is capped in the scheme rules (commonly 2% for kharif and 1.5% for rabi food
                crops, 5% for commercial crops). The exact figure for your crop and season is shown on the official
                portal — use that number when you enrol.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INSURANCE_LINKS.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="creator-btn-primary inline-flex h-9 items-center gap-1.5 px-3.5 text-xs"
                >
                  {link.title} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="What you need to enrol" icon={FileText}>
          <ul className="space-y-2 p-4">
            {[
              "Aadhaar card",
              "Land records or tenancy proof",
              "Bank account details (Aadhaar-linked)",
              "Sowing certificate / declaration",
              "Crop and area details for the season",
            ].map((doc) => (
              <li key={doc} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
                {doc}
              </li>
            ))}
            <li className="pt-1">
              <Link to="/account/documents" className="text-[11px] font-bold text-brand-700 hover:underline">
                Keep these in My Documents &amp; KYC
              </Link>
            </li>
          </ul>
        </Panel>
      </div>

      <Panel title="If a crop is damaged — claim process" icon={AlertCircle}>
        <ol className="space-y-3 p-4">
          {INSURANCE_STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <p className="text-[12px] leading-relaxed text-slate-600">{step}</p>
            </li>
          ))}
        </ol>
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <PhoneCall className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
            Keep a dated photo of the damage and the claim number. If you insured through your bank, ask the branch
            for the claim form the same week.
          </p>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/account/documents" className="creator-card p-4 transition hover:border-brand-300">
          <p className="text-xs font-bold text-forest">Documents &amp; KYC</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Upload Aadhaar and land records so they are ready when you enrol or claim.
          </p>
        </Link>
        <Link to="/advisory" className="creator-card p-4 transition hover:border-brand-300">
          <p className="text-xs font-bold text-forest">Ask the AI assistant</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Ask what a claim needs for your crop and district — then confirm it on the official portal.
          </p>
        </Link>
      </div>
    </FarmerShell>
  );
}
