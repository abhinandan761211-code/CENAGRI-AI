import { useMemo } from "react";
import {
  Briefcase,
  CheckCircle2,
  PlusCircle,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import EmployerLayout, { EMPLOYER_ROUTES } from "@/components/employer/EmployerLayout";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { StarRating } from "@/components/worker/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  employerTotals,
  formatDate,
  formatINR,
  listApplicants,
  listMyJobs,
  describeEmployerError,
} from "@/lib/employer";
import type { ApplicantRow, EmployerJobStat } from "@/lib/employer";

/**
 * Employer dashboard.
 *
 * Every figure is derived from the employer's own listings and applications
 * (`employer_id = auth.uid()` in RLS). A brand-new employer sees zeros, never a
 * fabricated number.
 */
export default function EmployerHome() {
  const { profile } = useAuth();
  const jobs = useWorkerData<EmployerJobStat[]>(() => listMyJobs(), [], describeEmployerError);
  const applicants = useWorkerData<ApplicantRow[]>(() => listApplicants(), [], describeEmployerError);

  const jobList = jobs.data ?? [];
  const applicantList = applicants.data ?? [];
  const totals = employerTotals(jobList);

  const pending = useMemo(
    () => applicantList.filter((a) => a.status === "applied" || a.status === "under_review"),
    [applicantList]
  );

  const completed = useMemo(
    () => applicantList.filter((a) => a.status === "accepted"),
    [applicantList]
  );

  const loading = jobs.state === "loading";
  const failed = jobs.state === "error" ? jobs : applicants.state === "error" ? applicants : null;

  if (loading) {
    return (
      <EmployerLayout title="Dashboard">
        <Loading label="Loading your hiring dashboard…" />
      </EmployerLayout>
    );
  }

  if (failed) {
    return (
      <EmployerLayout title="Dashboard">
        <ErrorNotice message={failed.error} onRetry={failed.reload} />
      </EmployerLayout>
    );
  }

  const displayName =
    profile?.details?.shop_name || profile?.details?.business_name || profile?.full_name || "Employer";

  return (
    <EmployerLayout
      title="Dashboard"
      subtitle="Post work, review applicants and manage your hires"
      action={
        <Link
          to={EMPLOYER_ROUTES.post}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <PlusCircle className="h-3.5 w-3.5" /> Post a job
        </Link>
      }
    >
      {/* ── Welcome ── */}
      <section className="relative overflow-hidden rounded-xl2 bg-forest px-5 py-6 text-white sm:px-7">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 15%, #4ade80 0, transparent 45%), radial-gradient(circle at 60% 90%, #22c55e 0, transparent 40%)",
          }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">
              Hiring for your farm or business
            </p>
            <h2 className="mt-2 font-display text-[24px] font-extrabold leading-tight sm:text-[28px]">
              Namaskar, {displayName} 👋
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/80">
              Post agricultural work, review worker applications and confirm who is coming to work.
            </p>
          </div>
          <Link
            to={EMPLOYER_ROUTES.applicants}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-[13px] font-bold text-forest hover:bg-white/90"
          >
            <Users className="h-4 w-4" />
            {totals.pendingApplicants > 0
              ? `${totals.pendingApplicants} waiting for review`
              : "View applicants"}
          </Link>
        </div>
      </section>

      {/* ── KPIs ── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Briefcase} label="Open jobs" value={String(totals.openJobs)} hint="Accepting applicants" />
        <StatCard icon={Users} label="Applicants to review" value={String(totals.pendingApplicants)} hint="Awaiting your decision" tone="amber" />
        <StatCard icon={CheckCircle2} label="Workers hired" value={String(totals.hired)} hint="All jobs" />
        <StatCard icon={TrendingUp} label="Jobs posted" value={String(totals.totalJobs)} hint="Total listings" />
        <StatCard icon={Wallet} label="Filled jobs" value={String(totals.filledJobs)} hint="All seats taken" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Applicants waiting ── */}
        <Panel
          title="Applicants waiting"
          description="Decide who you want to hire"
          className="lg:col-span-2"
          action={
            <Link to={EMPLOYER_ROUTES.applicants} className="text-[11.5px] font-bold text-brand-700 hover:underline">
              View all
            </Link>
          }
        >
          {pending.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nobody is waiting right now"
              description="When a worker applies to one of your jobs, they appear here with their experience, rating and phone number."
              action={
                <Link
                  to={EMPLOYER_ROUTES.post}
                  className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                >
                  Post a job
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.slice(0, 5).map((row) => (
                <li key={row.application_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest text-[11px] font-bold text-white">
                    {(row.worker_name ?? "W").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-forest">
                      {row.worker_name ?? "Worker"}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {row.job_title} · {formatDate(row.created_at)}
                    </p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-1 text-[10.5px] text-slate-500 sm:flex">
                    <StarRating value={row.worker_rating} />
                  </div>
                  <Link
                    to={EMPLOYER_ROUTES.applicants}
                    className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 hover:bg-brand-100"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── My jobs ── */}
        <Panel
          title="Your jobs"
          description="Newest listings"
          action={
            <Link to={EMPLOYER_ROUTES.jobs} className="text-[11.5px] font-bold text-brand-700 hover:underline">
              Manage
            </Link>
          }
        >
          {jobList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No jobs posted yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {jobList.slice(0, 5).map((job) => (
                <li key={job.job_id} className="px-3.5 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[12px] font-semibold text-forest">{job.title}</p>
                    <span className="shrink-0 text-[11px] font-bold text-emerald-800">
                      {formatINR(Number(job.wage_inr))}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-500">
                    <span>{job.workers_hired}/{job.workers_needed} hired</span>
                    <span>·</span>
                    <span>{job.total_applications} applied</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Hired workers ── */}
      {completed.length > 0 && (
        <Panel title="Workers you hired" description="Confirmed for your jobs">
          <ul className="divide-y divide-slate-100">
            {completed.slice(0, 6).map((row) => (
              <li key={row.application_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-forest">
                    {row.worker_name ?? "Worker"}
                  </p>
                  <p className="truncate text-[10.5px] text-slate-500">
                    {row.job_title} · starts {formatDate(row.start_date)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Hired
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </EmployerLayout>
  );
}
