import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileCheck2,
  FileText,
  ListChecks,
  MapPin,
  Search,
  ShieldQuestion,
  Sprout,
  Wheat,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import { Chip, EmptyState, PageHeader, SearchBox } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listCrops } from "@/lib/crops";
import { listDocuments } from "@/lib/farmer";
import { listFarms, haToAcres } from "@/lib/farms";
import { SCHEMES, SCHEME_CATEGORIES } from "@/lib/schemes";
import type { SchemeCategory, SchemeDoc, SchemeLink } from "@/lib/schemes";

/**
 * Government Schemes.
 *
 * Written for the person on the phone, not for a policy reader:
 *
 *  1. A plain-language summary at the top — what this page is, how many schemes
 *     there are, and the one rule that matters (eligibility is the department's
 *     decision, not the app's).
 *  2. A "your situation" strip built from data the account ALREADY has (farms,
 *     crops, uploaded documents). Anything missing says so and links to the page
 *     that fixes it — the old version printed "—" for fields that never exist.
 *  3. Schemes grouped by category, not one long list, with a search and an
 *     "I have my documents ready" filter.
 *  4. Every card leads with the benefit in one sentence, then a three-part
 *     answer: am I the right person, what do I need, what do I do first. Each
 *     document is ticked only when it is actually uploaded in My Documents.
 *
 * Nothing here decides eligibility, copies a deadline or promises a payment.
 */

/** Profile fields are stored loosely (jsonb), so read them defensively. */
function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function acresLabel(value: string | null): string | null {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return null;
  return `${n} ${n === 1 ? "acre" : "acres"}`;
}

export default function SchemesPage() {
  const { user, profile } = useAuth();
  const details = profile?.details ?? {};

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SchemeCategory | "All">("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyReady, setOnlyReady] = useState(false);

  /** Document kinds this account has uploaded (empty until they load). */
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  /** Real account data, not profile guesses: farms, crops, document list. */
  const [crops, setCrops] = useState<string[]>([]);
  const [farmCount, setFarmCount] = useState<number | null>(null);
  const [landAcres, setLandAcres] = useState<number | null>(null);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setDataState("loading");
    try {
      const [docs, farmRows, cropRows] = await Promise.all([
        listDocuments().catch(() => []),
        listFarms().catch(() => []),
        listCrops().catch(() => []),
      ]);
      setUploaded(new Set(docs.map((d) => d.kind)));
      setFarmCount(farmRows.length);
      // Stored in hectares; farmers talk in acres.
      const acres = farmRows.reduce((sum, farm) => sum + haToAcres(farm.area_ha ?? 0), 0);
      setLandAcres(acres > 0 ? Math.round(acres * 10) / 10 : null);
      setCrops([...new Set(cropRows.filter((c) => c.status !== "harvested").map((c) => c.name))]);
      setDataState("ready");
    } catch {
      setDataState("error");
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  /** How many of a scheme's uploaded-trackable documents are already in. */
  const readyFor = useCallback(
    (scheme: SchemeLink) => {
      const tracked = scheme.documents.filter((d) => d.kind);
      const have = tracked.filter((d) => uploaded.has(d.kind!)).length;
      return { have, total: tracked.length, complete: tracked.length > 0 && have === tracked.length };
    },
    [uploaded]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCHEMES.filter((scheme) => {
      if (category !== "All" && scheme.category !== category) return false;
      if (onlyReady && !readyFor(scheme).complete) return false;
      if (!q) return true;
      return [
        scheme.name,
        scheme.shortName,
        scheme.forWhom,
        scheme.benefit,
        scheme.department,
        scheme.category,
        ...scheme.documents.map((d) => d.label),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, category, onlyReady, readyFor]);

  const grouped = useMemo(
    () =>
      SCHEME_CATEGORIES.map((name) => ({
        name,
        items: visible.filter((scheme) => scheme.category === name),
      })).filter((group) => group.items.length > 0),
    [visible]
  );

  const allReady = SCHEMES.filter((scheme) => readyFor(scheme).complete).length;
  const location = [details.district, details.state].filter(Boolean).join(", ") || null;
  const headlineLand = acresLabel(asText(details.land_acres) ?? asText(details.land_size));

  return (
    <FarmerShell>
      <PageHeader
        icon={BadgeCheck}
        title="Government Schemes"
        description="The central schemes a farmer can apply for — what each one gives you, who it is for, the papers it needs and where to apply. Every link goes to the official government portal."
        meta={
          <>
            <Chip tone="green" icon={BadgeCheck}>
              Official gov.in links only
            </Chip>
            {location && (
              <Chip tone="slate" icon={MapPin}>
                {location}
              </Chip>
            )}
          </>
        }
      />

      {/* ── The one rule, said plainly ── */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-brand-700">
            <ShieldQuestion className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-forest">
              Kalika shows you the scheme. The government department decides who gets it.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              Land size, family income, crop and district all affect eligibility, and the rules change every
              season. Read the current rules on the official portal before applying, or ask your block
              agriculture office — they can confirm in person.
            </p>
          </div>
        </div>
      </div>

      {/* ── Your situation: only facts this account really has ── */}
      <section className="creator-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-forest">
              <Sprout className="h-4 w-4 text-brand-700" />
              Your details, ready for an application
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              These come from your farm and document records, so a counter clerk can check them quickly.
            </p>
          </div>
          <Link
            to="/account/documents"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:underline"
          >
            Manage documents <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
          <FactTile
            icon={MapPin}
            label="Location"
            value={location}
            hint={location ? "Used to check which schemes apply in your district" : undefined}
            missing="Add your state and district"
            missingTo="/account/personal"
            loading={dataState === "loading"}
          />
          <FactTile
            icon={Wheat}
            label="Land on record"
            value={farmCount === null ? null : landAcres ? acresLabel(String(landAcres)) : null}
            hint={
              farmCount === null
                ? undefined
                : farmCount > 0
                  ? `${farmCount} ${farmCount === 1 ? "farm" : "farms"} in My Farm`
                  : undefined
            }
            fallback={headlineLand ?? undefined}
            missing="Add your farm and its area"
            missingTo="/my-farm"
            loading={dataState === "loading"}
          />
          <FactTile
            icon={Sprout}
            label="Crops this season"
            value={crops.length ? crops.slice(0, 3).join(", ") : null}
            hint={crops.length > 3 ? `and ${crops.length - 3} more in Crop Management` : undefined}
            missing="No active crop recorded"
            missingTo="/crops"
            loading={dataState === "loading"}
          />
          <FactTile
            icon={FileCheck2}
            label="Documents uploaded"
            value={dataState === "loading" ? null : `${uploaded.size} of 6 core papers`}
            hint={uploaded.size === 0 ? "Aadhaar, land record and bank passbook are asked for most often" : undefined}
            missing={null}
            missingTo="/account/documents"
            loading={dataState === "loading"}
            tone={uploaded.size >= 3 ? "green" : "amber"}
          />
        </div>

        {dataState === "error" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
            <p className="text-[11px] text-slate-500">Some of your records could not be loaded.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50"
            >
              Try again
            </button>
          </div>
        )}
      </section>

      {/* ── Search + filters ── */}
      <div className="creator-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:p-4">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search a scheme — PM-KISAN, loan, drip, tractor…"
            label="Search schemes"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={category === "All"} onClick={() => setCategory("All")}>
              All {SCHEMES.length}
            </FilterPill>
            {SCHEME_CATEGORIES.map((name) => {
              const count = SCHEMES.filter((s) => s.category === name).length;
              if (!count) return null;
              return (
                <FilterPill key={name} active={category === name} onClick={() => setCategory(name)}>
                  {name}
                </FilterPill>
              );
            })}
            <button
              type="button"
              onClick={() => setOnlyReady((v) => !v)}
              aria-pressed={onlyReady}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${onlyReady
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              Documents ready ({allReady})
            </button>
          </div>
        </div>

        {grouped.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No scheme matches that"
            body={
              onlyReady
                ? "No scheme is fully papered yet. Upload Aadhaar, land record and bank passbook in My Documents."
                : "Try a shorter word — “credit”, “soil”, “tractor” — or pick a different category."
            }
            action={
              onlyReady ? (
                <Link to="/account/documents" className="creator-btn-primary inline-flex h-9 items-center px-3.5 text-xs">
                  Open My Documents
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map((group) => (
              <section key={group.name} className="p-3 sm:p-4">
                <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {group.name}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {group.items.length}
                  </span>
                </h3>
                {/* Single-card categories span the row instead of leaving
                    half the screen blank next to one narrow card. */}
                <div className={group.items.length === 1 ? "grid gap-3" : "grid gap-3 lg:grid-cols-2"}>
                  {group.items.map((scheme) => (
                    <SchemeCard
                      key={scheme.id}
                      scheme={scheme}
                      ready={readyFor(scheme)}
                      uploaded={uploaded}
                      wide={group.items.length === 1}
                      open={openId === scheme.id}
                      onToggle={() => setOpenId(openId === scheme.id ? null : scheme.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ── Where to get help ── */}
      <div className="creator-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-forest">
          <CircleHelp className="h-4 w-4 text-brand-700" />
          Stuck, or told you are not eligible?
        </h2>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
          <li className="flex gap-2">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            Your <strong>block agriculture office</strong> can check your papers and tell you which scheme fits your land.
          </li>
          <li className="flex gap-2">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            Your <strong>application status</strong> is shown only on the official portal, under your registration
            number. Kalika does not receive it, so it is not shown here.
          </li>
          <li className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            Nobody should ask for money to fill a government scheme form. If someone does, report it at the office.
          </li>
        </ul>
      </div>
    </FarmerShell>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────── */

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${active
          ? "border-forest bg-forest text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        }`}
    >
      {children}
    </button>
  );
}

/** One fact about the account, with an honest empty state that links to the fix. */
function FactTile({
  icon: Icon,
  label,
  value,
  hint,
  fallback,
  missing,
  missingTo,
  loading,
  tone = "slate",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  hint?: string;
  /** Profile value shown when the record-based one is empty. */
  fallback?: string;
  missing: string | null;
  missingTo: string;
  loading: boolean;
  tone?: "slate" | "green" | "amber";
}) {
  const shown = value ?? fallback ?? null;
  const toneCls =
    tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-forest";

  return (
    <div className="flex items-start gap-2.5 p-3.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {loading && !shown ? (
          <span className="mt-1.5 block h-4 w-24 animate-pulse rounded bg-slate-100" />
        ) : shown ? (
          <p className={`mt-0.5 truncate text-sm font-bold ${toneCls}`} title={shown}>
            {shown}
          </p>
        ) : missing ? (
          <Link to={missingTo} className="mt-0.5 inline-block text-[12px] font-semibold text-amber-700 hover:underline">
            {missing} →
          </Link>
        ) : (
          <p className="mt-0.5 text-[12px] text-slate-400">Not recorded</p>
        )}
        {hint && <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

/** One scheme: benefit first, then the three questions every farmer asks. */
function SchemeCard({
  scheme,
  ready,
  uploaded,
  wide,
  open,
  onToggle,
}: {
  scheme: SchemeLink;
  ready: { have: number; total: number; complete: boolean };
  uploaded: Set<string>;
  /** The only card in its category — use the full width for a two-column body. */
  wide: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = scheme.icon;

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-brand-200 hover:shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold leading-snug text-forest">{scheme.shortName}</h4>
          <p className="mt-0.5 truncate text-[10px] text-slate-400" title={scheme.name}>
            {scheme.name}
          </p>
        </div>
        {ready.complete ? (
          <Chip tone="green" icon={CheckCircle2}>
            Papers ready
          </Chip>
        ) : ready.total > 0 ? (
          <Chip tone="slate">
            {ready.have}/{ready.total} papers
          </Chip>
        ) : null}
      </div>

      {scheme.benefit && (
        <p className="mt-2.5 rounded-lg bg-brand-50/60 px-2.5 py-2 text-[12px] font-semibold leading-snug text-brand-900">
          {scheme.benefit}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        <strong className="font-semibold text-slate-700">Who it is for: </strong>
        {scheme.forWhom}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
        >
          <ListChecks className="h-3.5 w-3.5" />
          {open ? "Hide steps" : "Papers & steps"}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <a
          href={scheme.url}
          target="_blank"
          rel="noreferrer noopener"
          className="creator-btn-primary ml-auto inline-flex h-8 items-center gap-1 px-2.5 text-[11px]"
        >
          Official site <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {open && (
        <div
          className={`mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 ${
            wide ? "sm:grid-cols-2" : ""
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Papers needed{" "}
              <span className="font-semibold normal-case tracking-normal text-slate-400">
                (ticked = already uploaded)
              </span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {scheme.documents.map((doc) => (
                <DocRow key={doc.label} doc={doc} have={Boolean(doc.kind && uploaded.has(doc.kind))} />
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
              Keep scanned copies in{" "}
              <Link to="/account/documents" className="font-semibold text-brand-700 hover:underline">
                My Documents &amp; KYC
              </Link>
              . Most offices also ask to see the originals.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">What to do, step by step</p>
            <ol className="mt-1.5 space-y-1.5">
              {scheme.steps.map((step, index) => (
                <li key={step} className="flex gap-2 text-[11px] leading-relaxed text-slate-700">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-forest text-[9px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className={`rounded-md border border-slate-200 bg-white px-2.5 py-2 ${wide ? "sm:col-span-2" : ""}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Where to apply</p>
            <p className="mt-0.5 text-[11px] font-semibold text-forest">{scheme.applyWhere}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{scheme.department}</p>
          </div>
        </div>
      )}
    </article>
  );
}

function DocRow({ doc, have }: { doc: SchemeDoc; have: boolean }) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      {doc.kind ? (
        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${have ? "text-emerald-600" : "text-slate-300"}`} />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300" aria-hidden="true" />
      )}
      <span className={have ? "font-semibold text-emerald-800" : "text-slate-700"}>{doc.label}</span>
      {doc.kind && (
        <span className="ml-auto text-[10px] text-slate-400">{have ? "uploaded" : "not uploaded"}</span>
      )}
    </li>
  );
}
