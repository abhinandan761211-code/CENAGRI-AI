import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  MessageSquare,
  Phone,
  ShieldQuestion,
  Star,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import EmployerLayout, { EMPLOYER_ROUTES } from "@/components/employer/EmployerLayout";
import { ApplicationStatusPill, StarRating } from "@/components/worker/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  decideApplication,
  describeEmployerError,
  formatDate,
  formatINR,
  listApplicants,
  markUnderReview,
  replyToWorker,
} from "@/lib/employer";
import type { ApplicantRow } from "@/lib/employer";
import type { ApplicationStatus } from "@/lib/worker";

const TABS: { key: ApplicationStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "applied", label: "New" },
  { key: "under_review", label: "Reviewing" },
  { key: "accepted", label: "Hired" },
  { key: "rejected", label: "Not selected" },
];

/**
 * Applicants inbox.
 *
 * This is the employer's half of the worker lifecycle. Accepting is one
 * UPDATE — the database trigger creates the work assignment, fills the seat and
 * notifies the worker, so the two sides cannot disagree about who was hired.
 *
 * A worker is shown with the facts that matter for a hiring decision
 * (experience, rating, completed jobs, verification) and no more.
 */
export default function EmployerApplicants() {
  const navigate = useNavigate();
  const applicants = useWorkerData<ApplicantRow[]>(() => listApplicants(), [], describeEmployerError);

  const [tab, setTab] = useState<ApplicationStatus | "all">("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [messageFor, setMessageFor] = useState<ApplicantRow | null>(null);
  const [draft, setDraft] = useState("");
  const [msgError, setMsgError] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);

  const rows = applicants.data ?? [];

  const jobs = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.job_id, row.job_title);
    return Array.from(map.entries());
  }, [rows]);

  const counts = useMemo(() => {
    const map = new Map<string, number>([["all", rows.length]]);
    for (const row of rows) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const visible = rows.filter(
    (row) => (tab === "all" || row.status === tab) && (jobFilter === "all" || row.job_id === jobFilter)
  );

  async function decide(row: ApplicantRow, decision: "accepted" | "rejected") {
    setBusyId(row.application_id);
    setError("");
    try {
      await decideApplication(row.application_id, decision);
      applicants.reload();
    } catch (err) {
      setError(describeEmployerError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function review(row: ApplicantRow) {
    setBusyId(row.application_id);
    setError("");
    try {
      await markUnderReview(row.application_id);
      applicants.reload();
    } catch (err) {
      setError(describeEmployerError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function sendMessage() {
    if (!messageFor || !draft.trim()) return;
    setMsgBusy(true);
    setMsgError("");
    try {
      await replyToWorker({
        workerId: messageFor.worker_id,
        workerName: messageFor.worker_name ?? "Worker",
        workerRole: "Worker",
        jobId: messageFor.job_id,
        body: draft.trim(),
      });
      setMessageFor(null);
      setDraft("");
      navigate(EMPLOYER_ROUTES.messages);
    } catch (err) {
      setMsgError(describeEmployerError(err));
    } finally {
      setMsgBusy(false);
    }
  }

  return (
    <EmployerLayout
      title="Applicants"
      subtitle={`${counts.get("applied") ?? 0} new · ${counts.get("accepted") ?? 0} hired`}
    >
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${
                tab === key
                  ? "bg-brand-700 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
              <span className={`ml-1.5 text-[10px] ${tab === key ? "text-white/70" : "text-slate-400"}`}>
                {counts.get(key) ?? 0}
              </span>
            </button>
          ))}
        </div>
        {jobs.length > 1 && (
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            aria-label="Filter by job"
            className="ml-auto h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-brand-500"
          >
            <option value="all">All jobs</option>
            {jobs.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        )}
      </div>

      {applicants.state === "loading" && <Loading label="Loading applicants…" />}
      {applicants.state === "error" && (
        <ErrorNotice message={applicants.error} onRetry={applicants.reload} />
      )}

      {applicants.state === "ready" && visible.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Users}
            title={rows.length === 0 ? "No applicants yet" : "Nothing in this filter"}
            description={
              rows.length === 0
                ? "Once you publish a job, workers who apply will appear here with their experience and rating."
                : "Try another tab or choose a different job."
            }
          />
        </div>
      )}

      {applicants.state === "ready" && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((row) => {
            const open = row.status === "applied" || row.status === "under_review";
            return (
              <article key={row.application_id} className="card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest text-[12px] font-bold text-white">
                    {(row.worker_name ?? "W").slice(0, 2).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-[14.5px] font-bold text-forest">
                        {row.worker_name ?? "Worker"}
                      </h3>
                      <ApplicationStatusPill status={row.status} />
                      {row.worker_identity_status === "verified" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          <BadgeCheck className="h-3 w-3" /> Verified
                        </span>
                      )}
                      {row.worker_phone_verified && row.worker_identity_status !== "verified" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Phone verified
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-[11px] text-slate-500">
                      Applied for <strong className="font-semibold text-slate-700">{row.job_title}</strong> ·{" "}
                      {formatDate(row.created_at)}
                    </p>

                    <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-amber-400" />
                        {Number(row.worker_rating ?? 0).toFixed(1)}
                        <span className="text-slate-400">({row.worker_rating_count ?? 0})</span>
                      </span>
                      <span>{row.worker_completed_jobs ?? 0} jobs completed</span>
                      <span>{row.worker_experience ?? 0} yrs experience</span>
                      {row.worker_expected_wage ? (
                        <span>Expects {formatINR(Number(row.worker_expected_wage))}/day</span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {row.worker_phone ?? "No phone"}
                      </span>
                    </dl>

                    {row.message && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] leading-relaxed text-slate-700">
                        “{row.message}”
                      </p>
                    )}

                    {row.employer_note && (
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        Your note: <span className="font-medium text-slate-700">{row.employer_note}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                    {open ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === row.application_id}
                          onClick={() => void decide(row, "accepted")}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" /> Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.application_id}
                          onClick={() => void decide(row, "rejected")}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                        {row.status === "applied" && (
                          <button
                            type="button"
                            disabled={busyId === row.application_id}
                            onClick={() => void review(row)}
                            className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Reviewing
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-[10.5px] font-semibold text-slate-400">
                        {row.decided_at ? `Decided ${formatDate(row.decided_at)}` : "—"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMsgError("");
                        setDraft("");
                        setMessageFor(row);
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Message
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(messageFor)}
        onClose={() => setMessageFor(null)}
        title="Message worker"
        subtitle={messageFor?.worker_name ?? undefined}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <StarRating value={messageFor?.worker_rating ?? 0} />
            {messageFor?.job_title}
          </div>
          <Field label="Message" required>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={4000}
              className={`${inputClass} resize-none`}
              placeholder="e.g. Please come to the field at 8am on Monday. Bring gloves if you have them."
            />
          </Field>
          {msgError && <p className="text-[11.5px] font-semibold text-rose-600">{msgError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMessageFor(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={msgBusy || !draft.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <MessageSquare className="h-3.5 w-3.5" /> {msgBusy ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
      </Modal>

      {rows.length === 0 && applicants.state === "ready" && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldQuestion className="h-3.5 w-3.5" />
          A worker's phone and experience are shown to you only after they apply to your job.
        </p>
      )}
    </EmployerLayout>
  );
}
