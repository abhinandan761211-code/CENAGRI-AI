import { useMemo } from "react";
import {
  BadgeCheck,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  IndianRupee,
  MapPin,
  Pencil,
  Search,
  Wallet,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ShellHero, ShellQuickActions } from "@/components/account/AccountShell";
import WorkerLayout, { WORKER_ROUTES } from "@/components/worker/WorkerLayout";
import {
  AvailabilityBadge,
  CompletionRing,
  DemoNotice,
  JobCard,
  JobGrid,
  SectionHeading,
  VerificationBadge,
} from "@/components/worker/ui";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import { formatDate, formatINR, startLabel } from "@/lib/worker";
import type {
  JobApplication,
  JobListing,
  WorkerEarning,
  WorkerProfile,
  WorkerSkill,
  WorkAssignment,
} from "@/lib/worker";
import {
  dashboardTotals,
  ensureWorkerProfile,
  listApplications,
  listAssignments,
  listEarnings,
  listOpenJobs,
  listSkills,
  profileCompletion,
} from "@/lib/worker";

/**
 * Worker home.
 *
 * The six KPIs from the brief — available jobs, applied, active work,
 * completed, total earnings, pending payments — all derived from the worker's
 * own rows. A brand-new worker therefore sees zeros and empty states, never a
 * made-up number.
 */
export default function WorkerHome() {
  const { profile: account } = useAuth();
  const navigate = useNavigate();

  const workerProfile = useWorkerData<WorkerProfile>(() =>
    ensureWorkerProfile({
      full_name: account?.full_name,
      phone: account?.phone,
      district: account?.details?.district,
      state: account?.details?.state,
      village: account?.details?.village,
      expected_wage: account?.details?.daily_wage,
      availability: account?.details?.availability,
    })
  );
  const skills = useWorkerData<WorkerSkill[]>(() => listSkills());
  const jobs = useWorkerData<JobListing[]>(() => listOpenJobs({ availableOnly: true }));
  const applications = useWorkerData<JobApplication[]>(() => listApplications());
  const assignments = useWorkerData<WorkAssignment[]>(() => listAssignments());
  const earnings = useWorkerData<WorkerEarning[]>(() => listEarnings());

  const me = workerProfile.data;
  const jobList = jobs.data ?? [];
  const appList = applications.data ?? [];
  const assignmentList = assignments.data ?? [];
  const earningList = earnings.data ?? [];
  const skillList = skills.data ?? [];

  const totals = dashboardTotals({
    jobs: jobList,
    applications: appList,
    assignments: assignmentList,
    earnings: earningList,
  });

  const completion = profileCompletion(me, skillList);

  const failed =
    workerProfile.state === "error"
      ? workerProfile
      : jobs.state === "error"
        ? jobs
        : applications.state === "error"
          ? applications
          : null;

  const loading = workerProfile.state === "loading";

  /**
   * "Recommended" is a real match, not a random sample: same district as the
   * worker, open, and still short of workers. Sorted by pay, highest first.
   */
  const recommended = useMemo(() => {
    const district = me?.district ?? account?.details?.district;
    const sameArea = district ? jobList.filter((j) => j.district === district) : jobList;
    const pool = (sameArea.length ? sameArea : jobList).filter(
      (j) => j.status === "open" && j.workers_hired < j.workers_needed
    );
    return [...pool].sort((a, b) => Number(b.wage_inr) - Number(a.wage_inr)).slice(0, 3);
  }, [jobList, me?.district, account?.details?.district]);

  /** The next job the worker has to show up for. */
  const nextWork = useMemo(() => {
    const upcoming = assignmentList
      .filter((a) => a.status === "scheduled" || a.status === "in_progress")
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return upcoming[0] ?? null;
  }, [assignmentList]);

  const home = [me?.village, me?.district, me?.state].filter(Boolean).join(", ") ||
    [account?.details?.village, account?.details?.district, account?.details?.state]
      .filter(Boolean)
      .join(", ") ||
    "Set your location";

  const firstName = (me?.full_name ?? account?.full_name ?? account?.email ?? "Worker")
    .split(" ")
    .filter(Boolean)[0];

  if (loading) {
    return (
      <WorkerLayout title="Dashboard">
        <Loading label="Loading your dashboard…" />
      </WorkerLayout>
    );
  }

  if (failed) {
    return (
      <WorkerLayout title="Dashboard">
        <ErrorNotice message={failed.error} onRetry={failed.reload} />
      </WorkerLayout>
    );
  }

  return (
    <WorkerLayout
      title="Dashboard"
      action={
        <Link
          to={WORKER_ROUTES.profile}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit Profile
        </Link>
      }
    >
      {/* ── Welcome ── */}
      <ShellHero
        locationLine={home}
        greeting={`Namaste, ${firstName} 👋`}
        subtitle="Find agricultural jobs, manage your work, and grow your income with CenAGRI AI."
        aside={
          <div className="rounded-xl bg-white/12 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <CompletionRing value={completion} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                  Profile complete
                </p>
                <p className="mt-0.5 text-[13px] font-semibold leading-snug text-white">
                  {completion >= 100
                    ? "All set — you are ready for work"
                    : "Finish your profile to get more jobs"}
                </p>
                <Link
                  to={WORKER_ROUTES.profile}
                  className="mt-1.5 inline-block text-[11px] font-bold text-emerald-200 underline-offset-2 hover:underline"
                >
                  Complete now →
                </Link>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <VerificationBadge profile={me} />
              <AvailabilityBadge profile={me} />
            </div>
          </div>
        }
      />

      {/* ── KPIs ── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Briefcase}
          label="Available jobs"
          value={String(totals.availableJobs)}
          hint="Open near you"
        />
        <StatCard
          icon={FileText}
          label="Applied jobs"
          value={String(totals.appliedJobs)}
          hint="Awaiting or accepted"
        />
        <StatCard
          icon={Clock}
          label="Active work"
          value={String(totals.activeWork)}
          hint="Scheduled or running"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed jobs"
          value={String(totals.completedJobs)}
          hint="All time"
        />
        <StatCard
          icon={IndianRupee}
          label="Total earnings"
          value={formatINR(totals.totalEarnings)}
          hint="Confirmed payments only"
        />
        <StatCard
          icon={Wallet}
          label="Pending payments"
          value={formatINR(totals.pendingPayments)}
          hint="Not paid yet"
        />
      </section>

      {/* ── Quick actions ── */}
      <ShellQuickActions
        title="Quick Actions"
        actions={[
          { label: "Find Jobs", icon: Search, onClick: () => navigate(WORKER_ROUTES.jobs) },
          { label: "My Applications", icon: FileText, onClick: () => navigate(WORKER_ROUTES.applications) },
          { label: "Active Work", icon: CheckCircle2, onClick: () => navigate(WORKER_ROUTES.active) },
          { label: "Calendar", icon: CalendarDays, onClick: () => navigate(WORKER_ROUTES.calendar) },
          { label: "Earnings", icon: IndianRupee, onClick: () => navigate(WORKER_ROUTES.earnings) },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Next work / applications ── */}
        <div className="lg:col-span-2 space-y-4">
          <Panel title="Upcoming work" description="Your next scheduled job">
            {nextWork ? (
              <div className="rounded-lg border border-slate-200 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold text-forest">
                      {nextWork.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-slate-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {[nextWork.work_village, nextWork.work_district].filter(Boolean).join(", ") ||
                        "Location not set"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800">
                    {startLabel(nextWork.start_date)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 text-[11px]">
                  <div>
                    <p className="text-slate-400">Date</p>
                    <p className="font-semibold text-forest">{formatDate(nextWork.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Employer</p>
                    <p className="truncate font-semibold text-forest">{nextWork.employer_name}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Pay</p>
                    <p className="font-semibold text-forest">
                      {nextWork.daily_wage
                        ? `${formatINR(Number(nextWork.daily_wage))}/day`
                        : formatINR(Number(nextWork.total_pay ?? 0))}
                    </p>
                  </div>
                </div>
                <Link
                  to={WORKER_ROUTES.active}
                  className="mt-3 inline-flex h-8 items-center rounded-lg bg-brand-700 px-3 text-[11.5px] font-semibold text-white hover:bg-brand-800"
                >
                  Open active work
                </Link>
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No scheduled work yet"
                description="Apply for a job and it will appear here once an employer accepts you."
                action={
                  <Link
                    to={WORKER_ROUTES.jobs}
                    className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                  >
                    Find jobs
                  </Link>
                }
              />
            )}
          </Panel>

          <Panel
            title="Recent applications"
            description="Where your applications stand"
            action={
              <Link to={WORKER_ROUTES.applications} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                View all
              </Link>
            }
          >
            {appList.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No applications yet"
                description="When you apply for a job, its status shows up here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {appList.slice(0, 4).map((app) => (
                  <li key={app.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-forest">
                        {app.job?.title ?? "Job"}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {app.job?.employer_name ?? "—"} · {formatDate(app.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-slate-600">
                      {formatINR(Number(app.job?.wage_inr ?? 0))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── Recommended ── */}
        <div className="space-y-4">
          <Panel
            title="Jobs for you"
            description="Best paying in your area"
            action={
              <Link to={WORKER_ROUTES.jobs} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                See all
              </Link>
            }
          >
            {jobs.state === "ready" && recommended.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No open jobs right now"
                description="New work is posted throughout the season — check back soon."
              />
            ) : (
              <div className="space-y-2.5">
                {recommended.map((job) => (
                  <Link
                    key={job.id}
                    to={`/worker/jobs/${job.id}`}
                    className="block rounded-lg border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[12.5px] font-bold text-forest">{job.title}</p>
                      <span className="shrink-0 text-[12px] font-extrabold text-emerald-800">
                        {formatINR(Number(job.wage_inr))}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                      <MapPin className="h-3 w-3" /> {job.district}
                      {job.employer_verified && (
                        <BadgeCheck className="ml-1 h-3 w-3 text-emerald-600" aria-label="Verified" />
                      )}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Your skills" description="Shown to employers">
            {skillList.length === 0 ? (
              <div className="text-[11.5px] text-slate-500">
                No skills added yet.{" "}
                <Link to={WORKER_ROUTES.profile} className="font-bold text-brand-700 hover:underline">
                  Add skills
                </Link>{" "}
                to match more jobs.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skillList.slice(0, 8).map((skill) => (
                  <span
                    key={skill.id}
                    className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800"
                  >
                    {skill.skill}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Newly posted jobs, in the same card style as the discovery page. */}
      <section>
        <SectionHeading
          icon={Briefcase}
          title="Newly posted"
          hint="Fresh work from verified and unverified employers"
          action={
            <Link to={WORKER_ROUTES.jobs} className="text-[11.5px] font-bold text-brand-700 hover:underline">
              Browse all jobs
            </Link>
          }
        />
        {jobs.state === "ready" && jobList.length === 0 ? (
          <div className="space-y-3">
            <DemoNotice what="No employer has posted a job yet" />
            <EmptyState
              icon={Briefcase}
              title="No jobs posted yet"
              description="Once farmers and businesses post work, their listings appear here with pay, location and duration."
            />
          </div>
        ) : (
          <JobGrid>
            {jobList.slice(0, 6).map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </JobGrid>
        )}
      </section>
    </WorkerLayout>
  );
}
