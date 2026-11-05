import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Info,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import WorkerLayout, { WORKER_ROUTES } from "@/components/worker/WorkerLayout";
import { AssignmentStatusPill } from "@/components/worker/ui";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  ATTENDANCE_LABEL,
  formatDate,
  formatINR,
  listAssignments,
  listAttendance,
  updateAssignmentProgress,
} from "@/lib/worker";
import type { AttendanceRow, WorkAssignment } from "@/lib/worker";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Active Work.
 *
 * Attendance is read-only here on purpose: it is written by the employer (or
 * the backend) and RLS gives a worker no INSERT/UPDATE policy on
 * `work_attendance`. Marking yourself present from the browser is exactly the
 * abuse this closes off.
 *
 * Progress is the one thing the worker may change, because only they know how
 * far the task has got.
 */
export default function WorkerActiveWork() {
  const { t } = useLang();
  const assignments = useWorkerData<WorkAssignment[]>(() => listAssignments());
  const attendance = useWorkerData<AttendanceRow[]>(() => listAttendance());

  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rows = assignments.data ?? [];
  const active = useMemo(
    () => rows.filter((a) => a.status === "scheduled" || a.status === "in_progress"),
    [rows]
  );
  const done = useMemo(() => rows.filter((a) => a.status === "completed"), [rows]);

  const attendanceByAssignment = useMemo(() => {
    const map = new Map<string, AttendanceRow[]>();
    for (const row of attendance.data ?? []) {
      const list = map.get(row.assignment_id) ?? [];
      list.push(row);
      map.set(row.assignment_id, list);
    }
    return map;
  }, [attendance.data]);

  async function setProgress(assignment: WorkAssignment, progress: number) {
    setSavingId(assignment.id);
    setError("");
    try {
      await updateAssignmentProgress(assignment.id, progress);
      assignments.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update progress.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <WorkerLayout
      title={t("wk.w.title")}
      subtitle={`${active.length} ongoing · ${done.length} completed`}
    >
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          <strong className="font-bold text-forest">Attendance is marked by the employer.</strong> You
          can see your record here but cannot change it — this protects your pay history.
        </span>
      </div>

      {(assignments.state === "loading" || attendance.state === "loading") && (
        <Loading label={t("wk.c.loadingWork")} />
      )}
      {assignments.state === "error" && (
        <ErrorNotice message={assignments.error} onRetry={assignments.reload} />
      )}

      {assignments.state === "ready" && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title={t("wk.w.none")}
            description={t("wk.w.noneDesc")}
            action={
              <Link
                to={WORKER_ROUTES.jobs}
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Find jobs
              </Link>
            }
          />
        </div>
      )}

      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {assignments.state === "ready" && active.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-[15px] font-bold text-forest">Current jobs</h2>
          {active.map((assignment) => {
            const records = attendanceByAssignment.get(assignment.id) ?? [];
            const present = records.filter((r) => r.status === "present").length;
            return (
              <Panel
                key={assignment.id}
                title={assignment.title}
                description={`${assignment.employer_name}${assignment.work_district ? ` · ${assignment.work_district}` : ""
                  }`}
                action={<AssignmentStatusPill status={assignment.status} />}
              >
                <div className="space-y-4 p-4 sm:p-5">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Cell label={t("wk.w.start")} value={formatDate(assignment.start_date)} />
                    <Cell
                      label="End"
                      value={assignment.end_date ? formatDate(assignment.end_date) : "Open-ended"}
                    />
                    <Cell
                      label="Pay"
                      value={
                        assignment.daily_wage
                          ? `${formatINR(Number(assignment.daily_wage))}/day`
                          : formatINR(Number(assignment.total_pay ?? 0))
                      }
                    />
                    <Cell label={t("wk.w.daysPresent")} value={`${present} of ${records.length}`} />
                  </dl>

                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                      <MapPin className="h-3 w-3" /> Work location
                    </p>
                    <p className="text-[12.5px] font-semibold text-forest">
                      {[assignment.work_village, assignment.work_district].filter(Boolean).join(", ") ||
                        "Not specified"}
                    </p>
                  </div>

                  {assignment.instructions && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                        <Info className="h-3 w-3" /> Work instructions
                      </p>
                      <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-700">
                        {assignment.instructions}
                      </p>
                    </div>
                  )}

                  {/* Progress the worker controls */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                        <TrendingUp className="h-3 w-3" /> Work progress
                      </p>
                      <span className="text-[12px] font-extrabold text-forest">
                        {assignment.progress_pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                        style={{ width: `${assignment.progress_pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[0, 25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          disabled={savingId === assignment.id || pct === assignment.progress_pct}
                          onClick={() => void setProgress(assignment, pct)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed ${pct === assignment.progress_pct
                              ? "border-brand-700 bg-brand-700 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800 disabled:opacity-50"
                            }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10.5px] text-slate-400">
                      Marking 100% lets the employer confirm the job as completed.
                    </p>
                  </div>

                  {/* Attendance (read-only) */}
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                      <CalendarClock className="h-3 w-3" /> Attendance
                    </p>
                    {records.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[11.5px] text-slate-500">
                        No attendance recorded yet. Your employer marks this each working day.
                      </p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                        <table className="w-full text-left text-[11.5px]">
                          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-1.5 font-bold">Date</th>
                              <th className="px-3 py-1.5 font-bold">Status</th>
                              <th className="px-3 py-1.5 font-bold">Hours</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {records.map((row) => (
                              <tr key={row.id}>
                                <td className="px-3 py-1.5 text-slate-600">{formatDate(row.day)}</td>
                                <td className="px-3 py-1.5">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.status === "present"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : row.status === "half_day"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-slate-100 text-slate-600"
                                      }`}
                                  >
                                    {ATTENDANCE_LABEL[row.status]}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-slate-600">
                                  {row.hours_worked ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {assignment.employer_phone ? (
                      <a
                        href={`tel:${assignment.employer_phone.replace(/[^0-9+]/g, "")}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Phone className="h-3.5 w-3.5" /> Call employer
                      </a>
                    ) : (
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-50 px-3 text-[11.5px] font-semibold text-slate-400">
                        <Phone className="h-3.5 w-3.5" /> No phone shared
                      </span>
                    )}
                    <Link
                      to={WORKER_ROUTES.messages}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Message employer
                    </Link>
                  </div>
                </div>
              </Panel>
            );
          })}
        </section>
      )}

      {assignments.state === "ready" && done.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-[15px] font-bold text-forest">Completed jobs</h2>
          <div className="card divide-y divide-slate-100">
            {done.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-forest">{assignment.title}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {assignment.employer_name} · finished {formatDate(assignment.end_date ?? assignment.start_date)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[12px] font-bold text-emerald-800">
                    {formatINR(Number(assignment.total_pay ?? 0))}
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </WorkerLayout>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  const { t } = useLang();
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 p-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-[12.5px] font-semibold text-forest">{value}</dd>
    </div>
  );
}
