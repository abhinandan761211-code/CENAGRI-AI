import { useMemo, useState } from "react";
import {
  Briefcase,
  ChevronDown,
  Filter,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import WorkerLayout, { WORKER_ROUTES } from "@/components/worker/WorkerLayout";
import { JobCard, JobGrid } from "@/components/worker/ui";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  JOB_CATEGORIES,
  WORK_TYPES,
  WORK_TYPE_LABEL,
  distanceKm,
  formatINR,
  listOpenJobs,
} from "@/lib/worker";
import type { JobCategory, JobListing, WorkType } from "@/lib/worker";
import { Link } from "react-router-dom";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Job discovery.
 *
 * Location is never assumed: the page asks for it only when the worker presses
 * "Use my location", and falls back to a manual district pick. Distance badges
 * appear only when coordinates are actually known — an unknown distance renders
 * nothing rather than a guessed number.
 */
export default function WorkerJobs() {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<JobCategory | "all">("all");
  const [district, setDistrict] = useState("all");
  const [workType, setWorkType] = useState<WorkType | "all">("all");
  const [maxWage, setMaxWage] = useState<number | null>(null);
  const [maxExperience, setMaxExperience] = useState<number | null>(null);
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "asking" | "denied" | "error">("idle");

  // One query for every open job; the filters below run in memory so typing is
  // instant and never hits the network per keystroke.
  const jobs = useWorkerData<JobListing[]>(() => listOpenJobs({}), []);
  const all = jobs.data ?? [];

  const districts = useMemo(
    () => Array.from(new Set(all.map((j) => j.district))).sort(),
    [all]
  );

  const filtered = useMemo(() => {
    let rows = all;
    if (category !== "all") rows = rows.filter((j) => j.category === category);
    if (district !== "all") rows = rows.filter((j) => j.district === district);
    if (workType !== "all") rows = rows.filter((j) => j.work_type === workType);
    if (maxWage != null) rows = rows.filter((j) => Number(j.wage_inr) <= maxWage);
    if (maxExperience != null) rows = rows.filter((j) => j.experience_required <= maxExperience);
    if (availableOnly) rows = rows.filter((j) => j.status === "open" && j.workers_hired < j.workers_needed);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.employer_name.toLowerCase().includes(q) ||
          j.category.toLowerCase().includes(q) ||
          (j.village ?? "").toLowerCase().includes(q) ||
          (j.description ?? "").toLowerCase().includes(q)
      );
    }

    if (maxDistance != null && coords) {
      rows = rows.filter((j) => {
        const km = distanceKm(coords, { lat: j.latitude, lng: j.longitude });
        return km == null ? false : km <= maxDistance;
      });
    }

    // Nearest first when we know where the worker is, otherwise newest first.
    if (coords) {
      rows = [...rows].sort((a, b) => {
        const da = distanceKm(coords, { lat: a.latitude, lng: a.longitude });
        const db = distanceKm(coords, { lat: b.latitude, lng: b.longitude });
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      });
    }
    return rows;
  }, [all, category, district, workType, maxWage, maxExperience, availableOnly, search, maxDistance, coords]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoState("error");
      return;
    }
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState("idle");
      },
      (err) => setGeoState(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { timeout: 10_000, maximumAge: 300_000 }
    );
  }

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setDistrict("all");
    setWorkType("all");
    setMaxWage(null);
    setMaxExperience(null);
    setMaxDistance(null);
    setAvailableOnly(true);
  }

  const activeFilterCount = [
    category !== "all",
    district !== "all",
    workType !== "all",
    maxWage != null,
    maxExperience != null,
    maxDistance != null,
  ].filter(Boolean).length;

  return (
    <WorkerLayout
      title={t("wk.j.title")}
      subtitle={`${filtered.length} job${filtered.length === 1 ? "" : "s"} match what you are looking for`}
      action={
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-brand-700 px-1.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      }
    >
      {/* ── Search ── */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("wk.j.searchPlaceholder")}
            aria-label={t("wk.j.search")}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-brand-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("wk.j.clearSearch")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoState === "asking"}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          {coords ? "Location on" : geoState === "asking" ? "Locating…" : "Use my location"}
        </button>
      </div>

      {geoState === "denied" && (
        <p className="text-[11.5px] text-amber-700">
          Location permission was not granted. Pick your district below — distance will be hidden.
        </p>
      )}
      {geoState === "error" && (
        <p className="text-[11.5px] text-amber-700">
          Could not get your location. Choose a district manually instead.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* ── Filters ── */}
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
          <Panel
            title={t("wk.j.filters")}
            action={
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-bold text-brand-700 hover:underline"
              >
                Reset
              </button>
            }
          >
            <div className="space-y-4 p-4">
              <FilterBlock label={t("wk.j.jobCategory")}>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
                    All
                  </FilterChip>
                  {JOB_CATEGORIES.map((c) => (
                    <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                      {c}
                    </FilterChip>
                  ))}
                </div>
              </FilterBlock>

              <FilterBlock label={t("wk.j.location")}>
                <div className="relative">
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    aria-label={t("wk.j.district")}
                    className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white px-2.5 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-brand-500"
                  >
                    <option value="all">All districts</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </div>
              </FilterBlock>

              <FilterBlock label={t("wk.j.distance")}>
                <div className="flex flex-wrap gap-1.5">
                  {[null, 5, 10, 25, 50].map((km) => (
                    <FilterChip
                      key={String(km)}
                      active={maxDistance === km}
                      onClick={() => {
                        setMaxDistance(km);
                        if (km != null && !coords) useMyLocation();
                      }}
                      disabled={km != null && !coords && geoState === "denied"}
                    >
                      {km == null ? "Any" : `≤ ${km} km`}
                    </FilterChip>
                  ))}
                </div>
              </FilterBlock>

              <FilterBlock label={t("wk.j.workType")}>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={workType === "all"} onClick={() => setWorkType("all")}>
                    All
                  </FilterChip>
                  {WORK_TYPES.map((w) => (
                    <FilterChip key={w} active={workType === w} onClick={() => setWorkType(w)}>
                      {WORK_TYPE_LABEL[w]}
                    </FilterChip>
                  ))}
                </div>
              </FilterBlock>

              <FilterBlock label={t("wk.j.maxWage")}>
                <div className="flex flex-wrap gap-1.5">
                  {[null, 400, 600, 800, 1200].map((w) => (
                    <FilterChip key={String(w)} active={maxWage === w} onClick={() => setMaxWage(w)}>
                      {w == null ? "Any" : `≤ ${formatINR(w)}`}
                    </FilterChip>
                  ))}
                </div>
              </FilterBlock>

              <FilterBlock label={t("wk.j.experienceNeeded")}>
                <div className="flex flex-wrap gap-1.5">
                  {[null, 0, 1, 3, 5].map((y) => (
                    <FilterChip
                      key={String(y)}
                      active={maxExperience === y}
                      onClick={() => setMaxExperience(y)}
                    >
                      {y == null ? "Any" : y === 0 ? "No experience" : `≤ ${y} yrs`}
                    </FilterChip>
                  ))}
                </div>
              </FilterBlock>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-700"
                />
                <span className="text-[11.5px] font-semibold text-slate-700">
                  Only jobs still taking workers
                </span>
              </label>
            </div>
          </Panel>
        </aside>

        {/* ── Results ── */}
        <section>
          {jobs.state === "loading" && <Loading label={t("wk.c.loadingJobs")} />}
          {jobs.state === "error" && <ErrorNotice message={jobs.error} onRetry={jobs.reload} />}
          {jobs.state === "ready" && filtered.length === 0 && (
            <div className="card">
              <EmptyState
                icon={Briefcase}
                title={all.length === 0 ? "No jobs posted yet" : "No jobs match these filters"}
                description={
                  all.length === 0
                    ? "When farmers and businesses post work, their listings appear here with pay, location and duration."
                    : "Try widening the wage range, choosing a different category, or clearing the search."
                }
                action={
                  all.length > 0 ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <Link
                      to={WORKER_ROUTES.home}
                      className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back to dashboard
                    </Link>
                  )
                }
              />
            </div>
          )}
          {jobs.state === "ready" && filtered.length > 0 && (
            <JobGrid>
              {filtered.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  distance={coords ? distanceKm(coords, { lat: job.latitude, lng: job.longitude }) : null}
                />
              ))}
            </JobGrid>
          )}
        </section>
      </div>
    </WorkerLayout>
  );
}

/* ── small filter primitives ───────────────────────────────────────────── */

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
        <Filter className="h-3 w-3" /> {label}
      </p>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800"
        }`}
    >
      {children}
    </button>
  );
}

/** Location hint used when the worker has no district on their profile. */
export function LocationHint({ district }: { district: string | null }) {
  if (district) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
      <MapPin className="h-3.5 w-3.5" />
      Add your district in{" "}
      <Link to={WORKER_ROUTES.profile} className="font-bold text-brand-700 hover:underline">
        your profile
      </Link>{" "}
      to see jobs near you first.
    </p>
  );
}
