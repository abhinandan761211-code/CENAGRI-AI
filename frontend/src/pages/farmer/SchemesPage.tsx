import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ExternalLink, FileText, Search, ShieldQuestion } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  PageHeader,
  Panel,
  SearchBox,
  Stat,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { SCHEMES } from "@/lib/schemes";

/**
 * Government Schemes.
 *
 * Every card links to the official portal that owns the scheme. The app does
 * not decide eligibility, does not copy deadlines or instalment amounts (they
 * change), and says so on every screen.
 */
export default function SchemesPage() {
  const { profile } = useAuth();
  const details = profile?.details ?? {};
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SCHEMES;
    return SCHEMES.filter((scheme) =>
      [scheme.name, scheme.shortName, scheme.forWhom, scheme.department]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query]);

  return (
    <FarmerShell>
      <PageHeader
        icon={BadgeCheck}
        title="Government Schemes"
        description="Central schemes for Indian farmers, with who they are meant for, the documents usually needed, and the official portal to apply on."
        meta={
          <>
            <Chip tone="green" icon={BadgeCheck}>
              Official gov.in links only
            </Chip>
            <Chip tone="slate">{[details.district, details.state].filter(Boolean).join(", ") || "Location not set"}</Chip>
          </>
        }
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-900">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Eligibility is decided by the issuing department, not by CenAGRI.</strong> Land size, family
            income, crop and district all matter, and the rules change between seasons. Always read the current
            rules on the official portal before applying, or ask your block agriculture office.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Schemes listed" value={SCHEMES.length} icon={BadgeCheck} hint="With official links" />
        <Stat
          label="Your land size"
          value={details.land_size ? `${details.land_size} acres` : "—"}
          icon={BadgeCheck}
          tone="teal"
          hint="From your profile"
        />
        <Stat label="Main crops" value={details.main_crops ?? "—"} icon={BadgeCheck} tone="blue" hint="Used by some schemes" />
        <Stat label="Documents ready" value={details.documents_ready === "true" ? "Yes" : "Check"} icon={FileText} tone="amber" hint="Manage in My Documents" />
      </div>

      <Panel flush>
        <div className="border-b border-slate-200 p-3">
          <SearchBox value={query} onChange={setQuery} placeholder="Search a scheme (PM-KISAN, soil, irrigation…)" label="Search schemes" />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={Search} title="No scheme matches that search" body="Try a shorter word, like “credit” or “soil”." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((scheme) => {
              const Icon = scheme.icon;
              const open = openId === scheme.id;
              return (
                <li key={scheme.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-forest">{scheme.name}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{scheme.forWhom}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{scheme.department}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : scheme.id)}
                        aria-expanded={open}
                        className="rounded-md px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                      >
                        {open ? "Hide" : "Details"}
                      </button>
                      <a
                        href={scheme.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="creator-btn-primary inline-flex h-8 items-center gap-1 px-2.5 text-[11px]"
                      >
                        Official site <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Documents usually required
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {scheme.documents.map((doc) => (
                          <li key={doc}>
                            <Chip tone="slate">{doc}</Chip>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                        Keep scanned copies ready in{" "}
                        <Link to="/account/documents" className="font-semibold text-brand-700 hover:underline">
                          My Documents &amp; KYC
                        </Link>
                        . Some offices also ask for the original documents.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          <strong className="text-forest">Application status</strong> is shown on the official portal after you
          apply, with your registration number. CenAGRI does not receive that status, so it is not displayed here.
        </p>
      </div>
    </FarmerShell>
  );
}
