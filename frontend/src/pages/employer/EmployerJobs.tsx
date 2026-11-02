import { useState } from "react";
import {
  Briefcase,
  CalendarDays,
  MapPin,
  PlusCircle,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import EmployerLayout, { EMPLOYER_ROUTES } from "@/components/employer/EmployerLayout";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeEmployerError,
  formatDate,
  formatINR,
  listMyJobs,
  setJobStatus,
} from "@/lib/employer";
import type { EmployerJobStat } from "@/lib/employer";
import { WORK_TYPE_LABEL } from "@/lib/worker";

const STATUS_LABEL: Record<EmployerJobStat["status"], string> = {
  draft: "Draft",
  open: "Open",
  filled: "Filled",
  closed: "Closed",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<EmployerJobStat["status"], string> = {
  draft: "bg-slate-100 text-slate-600",
  open: "bg-emerald-100 text-emerald-800",
  filled: "bg-blue-100 text-blue-800",
  closed: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-100 text-rose-800",
};

/**
 * My Jobs.
 *
 * One card per listing, with the numbers that matter — how many applied, how
 * many were hired — and the two state changes an employer actually needs:
 * close it (stop new applications) or reopen it.
 */
export default function EmployerJobs() {
  const jobs = useWorkerData<EmployerJobStat[]>(() => listMyJobs(), [], describeEmployerError);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rows = jobs.data ?? [];

  async function toggle(job: EmployerJobStat) {
    setBusyId(job.job_id);
    setError("");
    try {
      await setJobStatus(job.job_id, job.status === "open" || job.status === "filled" ? "closed" : "open");
      jobs.reload();
    } catch (err) {
      setError(describeEmployerError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <EmployerLayout
      title="My Jobs"
      subtitle={`${rows.length} listing${rows.length === 1 ? "" : "s"}`}
      action={
        <Link
          to={EMPLOYER_ROUTES.post}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <PlusCircle className="h-3.5 w-3.5" /> Post a job
        </Link>
      }
    >
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
      {jobs.state === "loading" && <Loading label="Loading your jobs…" />}
      {jobs.state === "error" && <ErrorNotice message={jobs.error} onRetry={jobs.reload} />}

      {jobs.state === "ready" && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Briefcase}
            title="You have not posted a job yet"
            description="Post your first agricultural job — workers nearby will see it immediately with the pay, dates and location."
            action={
              <Link
                to={EMPLOYER_ROUTES.post}
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Post a job
              </Link>
            }
          />
        </div>
      )}

      {jobs.state === "ready" && rows.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((job) => {
            const seatsLeft = Math.max(0, Number(job.workers_needed) - Number(job.workers_hired));
            return (
              <Panel
                key={job.job_id}
                title={job.title}
                description={`${job.category} · ${[job.start_date, job.end_date].filter(Boolean).map(formatDate).join(" – ")}`}
                action={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[job.status]}`}
                  >
                    {STATUS_LABEL[job.status]}
                  </span>
                }
              >
                <div className="space-y-3 p-4 sm:p-5">
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <dt className="text-[9.5px] font-bold uppercase text-slate-500">Applied</dt>
                      <dd className="text-[15px] font-extrabold text-forest">{job.total_applications}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <dt className="text-[9.5px] font-bold uppercase text-slate-500">Waiting</dt>
                      <dd className="text-[15px] font-extrabold text-amber-700">{job.pending_applications}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <dt className="text-[9.5px] font-bold uppercase text-slate-500">Hired</dt>
                      <dd className="text-[15px] font-extrabold text-emerald-700">
                        {job.workers_hired}/{job.workers_needed}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {job.district}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {formatDate(job.start_date)}
                    </span>
                    <span className="font-bold text-emerald-800">
                      {formatINR(Number(job.wage_inr))}
                      {job.pay_type === "daily" ? "/day" : " fixed"}
                    </span>
                    <span>{WORK_TYPE_LABEL[job.work_type]}</span>
                  </div>

                  {seatsLeft === 0 && job.status !== "draft" && (
                    <p className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-800">
                      All positions are filled. Close the job to stop new applications.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <Link
                      to={EMPLOYER_ROUTES.applicants}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-[11.5px] font-semibold text-white hover:bg-brand-800"
                    >
                      <Users className="h-3.5 w-3.5" /> Review applicants
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === job.job_id || job.status === "draft"}
                      onClick={() => void toggle(job)}
                      className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busyId === job.job_id
                        ? "Saving…"
                        : job.status === "open" || job.status === "filled"
                          ? "Close job"
                          : "Reopen job"}
                    </button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </EmployerLayout>
  );
}
