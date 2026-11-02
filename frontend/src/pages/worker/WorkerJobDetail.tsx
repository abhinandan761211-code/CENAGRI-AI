import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flag,
  Info,
  MapPin,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import WorkerLayout, { WORKER_ROUTES } from "@/components/worker/WorkerLayout";
import { StarRating } from "@/components/worker/ui";
import {
  ErrorNotice,
  Loading,
  Modal,
  Panel,
  Field,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  REPORT_REASONS,
  WORK_TYPE_LABEL,
  applyToJob,
  appliedJobIds,
  describeWorkerError,
  durationLabel,
  formatDate,
  formatINR,
  getJob,
  listApplications,
  reportJob,
  startLabel,
} from "@/lib/worker";
import type { JobApplication, JobListing } from "@/lib/worker";

/**
 * One job, in full, with the apply flow.
 *
 * Applying is guarded three ways: the button is disabled if the worker already
 * applied, the database has a unique (job_id, worker_id) constraint, and RLS
 * only permits an insert against an `open` listing. A duplicate therefore
 * cannot be created from any direction.
 */
export default function WorkerJobDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const job = useWorkerData<JobListing | null>(() => getJob(id), [id]);
  const applications = useWorkerData<JobApplication[]>(() => listApplications(), []);
  const applied = useWorkerData<Set<string>>(() => appliedJobIds(), []);

  const [applyOpen, setApplyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [appliedOk, setAppliedOk] = useState(false);

  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0].value);
  const [reportDetails, setReportDetails] = useState("");
  const [reportOk, setReportOk] = useState(false);

  const current = job.data;
  const alreadyApplied =
    appliedOk ||
    Boolean(applied.data?.has(id)) ||
    (applications.data ?? []).some((a) => a.job_id === id && a.status !== "withdrawn");

  const existing = (applications.data ?? []).find(
    (a) => a.job_id === id && a.status !== "withdrawn"
  );

  async function handleApply() {
    if (!current) return;
    setBusy(true);
    setFormError("");
    try {
      await applyToJob(current, message.trim() || null);
      setAppliedOk(true);
      setApplyOpen(false);
      setMessage("");
      applied.reload();
      applications.reload();
    } catch (err) {
      setFormError(describeWorkerError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReport() {
    if (!current) return;
    setBusy(true);
    setFormError("");
    try {
      await reportJob(current.id, reportReason, reportDetails.trim() || null);
      setReportOk(true);
      setReportOpen(false);
      setReportDetails("");
    } catch (err) {
      setFormError(describeWorkerError(err));
    } finally {
      setBusy(false);
    }
  }

  if (job.state === "loading") {
    return (
      <WorkerLayout title="Job details">
        <Loading label="Loading job…" />
      </WorkerLayout>
    );
  }

  if (job.state === "error") {
    return (
      <WorkerLayout title="Job details">
        <ErrorNotice message={job.error} onRetry={job.reload} />
      </WorkerLayout>
    );
  }

  if (!current) {
    return (
      <WorkerLayout title="Job not found">
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-forest">This job is no longer available</p>
          <p className="mt-1 text-xs text-slate-500">
            It may have been filled or removed by the employer.
          </p>
          <Link
            to={WORKER_ROUTES.jobs}
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
          >
            Browse other jobs
          </Link>
        </div>
      </WorkerLayout>
    );
  }

  const slotsLeft = Math.max(0, current.workers_needed - current.workers_hired);
  const isFull = slotsLeft === 0 || current.status === "filled";

  return (
    <WorkerLayout
      title={current.title}
      subtitle={`${current.category} · ${[current.village, current.district].filter(Boolean).join(", ")}`}
      action={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Main ── */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Job details">
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800">
                  {current.category}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {WORK_TYPE_LABEL[current.work_type]}
                </span>
                {isFull ? (
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800">
                    All positions filled
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                    {slotsLeft} of {current.workers_needed} positions open
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Pay" value={formatINR(Number(current.wage_inr))} sub={current.pay_type === "daily" ? "per day" : "fixed total"} icon={Banknote} />
                <Stat label="Duration" value={durationLabel(current)} sub={current.end_date ? `Ends ${formatDate(current.end_date)}` : "One-off"} icon={Clock} />
                <Stat label="Starts" value={formatDate(current.start_date)} sub={startLabel(current.start_date)} icon={CalendarDays} />
                <Stat label="Workers" value={`${slotsLeft} left`} sub={`of ${current.workers_needed} needed`} icon={Users} />
              </dl>

              {current.description && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    About this work
                  </h3>
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700">
                    {current.description}
                  </p>
                </div>
              )}

              {current.required_skills.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Skills needed
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {current.required_skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Experience required
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-forest">
                    {current.experience_required === 0
                      ? "No experience needed"
                      : `${current.experience_required}+ years`}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Work location
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-forest">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {[current.village, current.district, current.state].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Safety first" description="Before you accept any farm work">
            <ul className="space-y-2 p-4 text-[12px] leading-relaxed text-slate-600 sm:p-5">
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Never pay a fee to get a job. A genuine employer does not ask for money.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Confirm the daily wage and working hours before you start.
              </li>
              <li className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                For spraying or machine work, ask what protective equipment is provided.
              </li>
            </ul>
          </Panel>
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-4">
          <Panel title="Employer">
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest text-sm font-bold text-white">
                  {current.employer_name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-forest">
                    {current.employer_name}
                    {current.employer_verified && (
                      <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {current.employer_verified ? "Verified employer" : "Not yet verified"}
                  </p>
                </div>
              </div>
              {!current.employer_verified && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This employer has not completed CenAGRI verification yet. Take normal precautions.
                </p>
              )}
            </div>
          </Panel>

          <div className="card p-4 sm:p-5">
            {appliedOk ? (
              <div className="text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <p className="mt-2 text-sm font-bold text-forest">Application sent</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                  The employer will review it. You can track the status in My Applications.
                </p>
                <Link
                  to={WORKER_ROUTES.applications}
                  className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                >
                  My applications
                </Link>
              </div>
            ) : alreadyApplied ? (
              <div className="text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-blue-100 text-blue-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <p className="mt-2 text-sm font-bold text-forest">Already applied</p>
                <p className="mt-1 text-[11.5px] text-slate-500">
                  {existing?.status === "accepted"
                    ? "You were selected for this job."
                    : "Your application is with the employer."}
                </p>
                <Link
                  to={WORKER_ROUTES.applications}
                  className="mt-3 inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View application
                </Link>
              </div>
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  You will earn
                </p>
                <p className="mt-1 font-display text-2xl font-extrabold text-forest">
                  {formatINR(Number(current.wage_inr))}
                  {current.pay_type === "daily" && (
                    <span className="ml-1 text-xs font-semibold text-slate-500">/ day</span>
                  )}
                </p>
                <button
                  type="button"
                  disabled={isFull || current.status !== "open"}
                  onClick={() => setApplyOpen(true)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Send className="h-4 w-4" />
                  {isFull ? "All positions filled" : current.status !== "open" ? "Not accepting applications" : "Apply for this job"}
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-rose-600"
                >
                  <Flag className="h-3.5 w-3.5" /> Report suspicious job
                </button>
              </>
            )}
            {reportOk && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800">
                Thanks — our team will review this job.
              </p>
            )}
          </div>

          <Panel title="Your rating" description="How employers see you">
            <div className="flex items-center gap-3 p-4">
              <StarRating value={0} size="md" />
              <Link to={WORKER_ROUTES.reviews} className="text-[11.5px] font-bold text-brand-700 hover:underline">
                View reviews
              </Link>
            </div>
          </Panel>
        </aside>
      </div>

      {/* ── Apply modal ── */}
      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Apply for this job">
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[12.5px] font-bold text-forest">{current.title}</p>
            <p className="text-[11px] text-slate-500">
              {current.employer_name} · {formatINR(Number(current.wage_inr))}
              {current.pay_type === "daily" ? "/day" : " fixed"}
            </p>
          </div>
          <Field label="Message to employer (optional)">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Tell the employer about your experience, availability or questions."
              className={`${inputClass} resize-none`}
            />
          </Field>
          {formError && <p className="text-[11.5px] font-semibold text-rose-600">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setApplyOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {busy ? "Sending…" : "Send application"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Report modal ── */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this job">
        <div className="space-y-3">
          <Field label="What is wrong?">
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className={inputClass}
            >
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Details (optional)">
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Anything the review team should know."
              className={`${inputClass} resize-none`}
            />
          </Field>
          {formError && <p className="text-[11.5px] font-semibold text-rose-600">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleReport()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              <Flag className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Report job"}
            </button>
          </div>
        </div>
      </Modal>
    </WorkerLayout>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Banknote;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 text-[13.5px] font-extrabold text-forest">{value}</p>
      <p className="text-[10.5px] text-slate-500">{sub}</p>
    </div>
  );
}
