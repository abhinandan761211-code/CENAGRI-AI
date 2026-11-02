import { useMemo, useState } from "react";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Trash2,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import WorkerLayout, { WORKER_ROUTES } from "@/components/worker/WorkerLayout";
import { ApplicationStatusPill } from "@/components/worker/ui";
import { EmptyState, ErrorNotice, Loading, Modal, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  APPLICATION_STATUS_LABEL,
  describeWorkerError,
  formatDate,
  formatINR,
  listApplications,
  withdrawApplication,
} from "@/lib/worker";
import type { ApplicationStatus, JobApplication } from "@/lib/worker";

const TABS: { key: ApplicationStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "applied", label: "Applied" },
  { key: "under_review", label: "Under review" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Not selected" },
  { key: "withdrawn", label: "Withdrawn" },
];

/**
 * My Applications.
 *
 * Lifecycle shown plainly: Applied → Under review → Accepted / Not selected →
 * Work scheduled. Withdrawing is only offered while the employer has not
 * decided, which the database also enforces.
 */
export default function WorkerApplications() {
  const apps = useWorkerData<JobApplication[]>(() => listApplications());
  const [tab, setTab] = useState<ApplicationStatus | "all">("all");
  const [confirming, setConfirming] = useState<JobApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = apps.data ?? [];

  const counts = useMemo(() => {
    const map = new Map<ApplicationStatus | "all", number>([["all", rows.length]]);
    for (const row of rows) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const visible = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  async function handleWithdraw() {
    if (!confirming) return;
    setBusy(true);
    setError("");
    try {
      await withdrawApplication(confirming.id);
      setConfirming(null);
      apps.reload();
    } catch (err) {
      setError(describeWorkerError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkerLayout
      title="My Applications"
      subtitle={`${rows.length} application${rows.length === 1 ? "" : "s"} in total`}
      action={
        <Link
          to={WORKER_ROUTES.jobs}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Briefcase className="h-3.5 w-3.5" /> Find more jobs
        </Link>
      }
    >
      {/* Lifecycle strip */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <LifecycleStep label="Applied" done />
          <ArrowRight className="h-3 w-3 text-slate-300" />
          <LifecycleStep label="Under review" done={rows.some((r) => r.status === "under_review" || r.status === "accepted" || r.status === "rejected")} />
          <ArrowRight className="h-3 w-3 text-slate-300" />
          <LifecycleStep label="Accepted / Not selected" done={rows.some((r) => r.status === "accepted" || r.status === "rejected")} />
          <ArrowRight className="h-3 w-3 text-slate-300" />
          <LifecycleStep label="Work scheduled" done={rows.some((r) => r.status === "accepted")} />
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(({ key, label }) => {
          const count = counts.get(key) ?? 0;
          return (
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
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {apps.state === "loading" && <Loading label="Loading applications…" />}
      {apps.state === "error" && <ErrorNotice message={apps.error} onRetry={apps.reload} />}

      {apps.state === "ready" && visible.length === 0 && (
        <div className="card">
          <EmptyState
            icon={FileText}
            title={rows.length === 0 ? "You have not applied to any job yet" : "Nothing in this tab"}
            description={
              rows.length === 0
                ? "Find farm work near you and apply — your applications and their status will be listed here."
                : "Try another tab above to see your other applications."
            }
            action={
              rows.length === 0 ? (
                <Link
                  to={WORKER_ROUTES.jobs}
                  className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                >
                  Find jobs
                </Link>
              ) : undefined
            }
          />
        </div>
      )}

      {apps.state === "ready" && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((app) => (
            <Panel
              key={app.id}
              title={app.job?.title ?? "Job no longer available"}
              description={
                app.job
                  ? `${app.job.employer_name} · ${app.job.category}`
                  : "The employer removed this listing"
              }
              action={<ApplicationStatusPill status={app.status} />}
            >
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-3 text-[11.5px] sm:grid-cols-4">
                  <Info
                    icon={MapPin}
                    label="Location"
                    value={
                      app.job
                        ? [app.job.village, app.job.district].filter(Boolean).join(", ")
                        : "—"
                    }
                  />
                  <Info
                    icon={CalendarDays}
                    label="Starts"
                    value={app.job ? formatDate(app.job.start_date) : "—"}
                  />
                  <Info
                    icon={Clock}
                    label="Pay"
                    value={
                      app.job
                        ? `${formatINR(Number(app.job.wage_inr))}${app.job.pay_type === "daily" ? "/day" : ""}`
                        : "—"
                    }
                  />
                  <Info icon={FileText} label="Applied on" value={formatDate(app.created_at)} />
                </div>

                {app.message && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Your message
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{app.message}</p>
                  </div>
                )}

                {app.employer_note && (
                  <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                      Note from employer
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-blue-900">{app.employer_note}</p>
                  </div>
                )}

                {app.status === "accepted" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                    <p className="text-[11.5px] font-semibold text-emerald-900">
                      You were selected. Your work is scheduled — open Active Work for details.
                    </p>
                    <Link
                      to={WORKER_ROUTES.active}
                      className="ml-auto inline-flex h-7 items-center rounded-lg bg-emerald-700 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-800"
                    >
                      Open
                    </Link>
                  </div>
                )}

                {app.status === "rejected" && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                    <XCircle className="h-4 w-4 shrink-0 text-slate-500" />
                    <p className="text-[11.5px] text-slate-600">
                      The employer chose another worker for this job. Your profile is still visible to
                      other employers.
                    </p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {app.job && (
                    <Link
                      to={`/worker/jobs/${app.job.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View job
                    </Link>
                  )}
                  {(app.status === "applied" || app.status === "under_review") && (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setConfirming(app);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Withdraw application
                    </button>
                  )}
                  <span className="ml-auto self-center text-[10.5px] font-semibold text-slate-400">
                    {APPLICATION_STATUS_LABEL[app.status]}
                  </span>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title="Withdraw this application?"
        subtitle={confirming?.job?.title}
      >
        <p className="text-[12px] leading-relaxed text-slate-600">
          The employer will no longer see you for this job. You can apply again later if the job is
          still open.
        </p>
        {error && <p className="mt-2 text-[11.5px] font-semibold text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => void handleWithdraw()}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      </Modal>
    </WorkerLayout>
  );
}

function LifecycleStep({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 ${
        done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-400"
      }`}
    >
      {label}
    </span>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-0.5 truncate font-semibold text-forest">{value}</p>
    </div>
  );
}
