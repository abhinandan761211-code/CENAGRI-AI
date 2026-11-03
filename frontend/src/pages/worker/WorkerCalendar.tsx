import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
} from "lucide-react";
import WorkerLayout from "@/components/worker/WorkerLayout";
import { AssignmentStatusPill } from "@/components/worker/ui";
import { EmptyState, ErrorNotice, Loading, Modal, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  assignmentsOn,
  describeWorkerError,
  formatDate,
  listAssignments,
  listAvailability,
  setDayAvailability,
  todayISO,
} from "@/lib/worker";
import type { WorkAssignment, WorkerAvailability } from "@/lib/worker";

type View = "month" | "week" | "day";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Work calendar + availability.
 *
 * Day/month/week views over the worker's own assignments. Turning a day off is
 * one click; if that day already holds work the dialog says so plainly and
 * asks for confirmation instead of silently blocking.
 */
export default function WorkerCalendar() {
  const assignments = useWorkerData<WorkAssignment[]>(() => listAssignments());
  const availability = useWorkerData<WorkerAvailability[]>(() => listAvailability());

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(todayISO());

  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = assignments.data ?? [];
  const days = useMemo(() => {
    const map = new Map<string, WorkerAvailability>();
    for (const row of availability.data ?? []) map.set(row.day, row);
    return map;
  }, [availability.data]);

  const loading = assignments.state === "loading" || availability.state === "loading";
  const failed = assignments.state === "error" ? assignments : availability.state === "error" ? availability : null;

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    // Monday-first grid.
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - lead);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const base = new Date(cursor);
    const lead = (base.getDay() + 6) % 7;
    const start = new Date(base);
    start.setDate(base.getDate() - lead);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function shift(delta: number) {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(cursor.getMonth() + delta);
    else if (view === "week") next.setDate(cursor.getDate() + delta * 7);
    else next.setDate(cursor.getDate() + delta);
    setCursor(next);
    setSelected(iso(next));
  }

  async function markDay(day: string, available: boolean) {
    setBusy(true);
    setError("");
    try {
      await setDayAvailability(day, available);
      setPendingDay(null);
      availability.reload();
    } catch (err) {
      setError(describeWorkerError(err));
    } finally {
      setBusy(false);
    }
  }

  function requestToggle(day: string) {
    const blocking = assignmentsOn(rows, day).filter((a) => a.status !== "completed");
    if (blocking.length > 0) {
      // Conflict: never silently block a day that already holds work.
      setPendingDay(day);
      return;
    }
    void markDay(day, !days.get(day)?.available ? true : false);
  }

  const conflicts = pendingDay ? assignmentsOn(rows, pendingDay) : [];
  const selectedJobs = selected ? assignmentsOn(rows, selected) : [];
  const monthLabel = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <WorkerLayout
      title="Work Calendar"
      subtitle="Your schedule, availability and reminders"
      action={
        <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-0.5">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${view === v ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
            >
              {v}
            </button>
          ))}
        </div>
      }
    >
      {loading && <Loading label="Loading calendar…" />}
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {!loading && !failed && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Panel
            title={view === "day" ? formatDate(iso(cursor)) : monthLabel}
            action={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shift(-1)}
                  aria-label="Previous"
                  className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCursor(new Date());
                    setSelected(todayISO());
                  }}
                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => shift(1)}
                  aria-label="Next"
                  className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            }
          >
            <div className="p-3 sm:p-4">
              {view === "month" && (
                <div>
                  <div className="mb-1 grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((d) => (
                      <p key={d} className="text-center text-[10px] font-bold uppercase text-slate-400">
                        {d}
                      </p>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthDays.map((day) => {
                      const key = iso(day);
                      const inMonth = day.getMonth() === cursor.getMonth();
                      const jobs = assignmentsOn(rows, key);
                      const isOff = days.get(key)?.available === false;
                      const isToday = key === todayISO();
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelected(key)}
                          className={`relative flex min-h-[54px] flex-col rounded-lg border p-1.5 text-left transition ${selected === key
                              ? "border-brand-700 bg-brand-50"
                              : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
                            } ${inMonth ? "" : "opacity-40"}`}
                        >
                          <span
                            className={`text-[11px] font-bold ${isToday ? "text-white" : "text-slate-700"
                              } ${isToday ? "rounded-full bg-brand-700 px-1.5 w-fit" : ""}`}
                          >
                            {day.getDate()}
                          </span>
                          <span className="mt-auto flex flex-wrap gap-0.5">
                            {jobs.slice(0, 2).map((j) => (
                              <span
                                key={j.id}
                                className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                aria-hidden="true"
                              />
                            ))}
                            {isOff && (
                              <CircleSlash className="h-2.5 w-2.5 text-slate-400" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Scheduled work
                    </span>
                    <span className="flex items-center gap-1">
                      <CircleSlash className="h-3 w-3 text-slate-400" /> Marked unavailable
                    </span>
                  </div>
                </div>
              )}

              {view === "week" && (
                <div className="grid gap-1.5 sm:grid-cols-7">
                  {weekDays.map((day) => {
                    const key = iso(day);
                    const jobs = assignmentsOn(rows, key);
                    const isOff = days.get(key)?.available === false;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelected(key)}
                        className={`rounded-lg border p-2 text-left transition ${selected === key
                            ? "border-brand-700 bg-brand-50"
                            : "border-slate-200 hover:border-brand-300"
                          }`}
                      >
                        <p className="text-[10px] font-bold uppercase text-slate-400">
                          {WEEKDAYS[(day.getDay() + 6) % 7]}
                        </p>
                        <p className="text-[13px] font-extrabold text-forest">{day.getDate()}</p>
                        {jobs.length > 0 ? (
                          <p className="mt-1 truncate text-[10px] font-semibold text-emerald-700">
                            {jobs.length} job{jobs.length > 1 ? "s" : ""}
                          </p>
                        ) : isOff ? (
                          <p className="mt-1 text-[10px] font-semibold text-slate-400">Unavailable</p>
                        ) : (
                          <p className="mt-1 text-[10px] text-slate-400">Free</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {view === "day" && (
                <div className="space-y-2">
                  {selectedJobs.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-[12px] text-slate-500">
                      No work scheduled on {formatDate(iso(cursor))}.
                    </p>
                  ) : (
                    selectedJobs.map((job) => (
                      <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold text-forest">{job.title}</p>
                            <p className="text-[11px] text-slate-500">{job.employer_name}</p>
                          </div>
                          <AssignmentStatusPill status={job.status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </Panel>

          {/* ── Selected day ── */}
          <aside className="space-y-4">
            <Panel title="Selected day" description={selected ? formatDate(selected) : "Pick a date"}>
              <div className="space-y-3 p-4">
                {selected && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] text-slate-600">Availability</span>
                      <button
                        type="button"
                        onClick={() => requestToggle(selected)}
                        className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold transition ${days.get(selected)?.available === false
                            ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          }`}
                      >
                        {days.get(selected)?.available === false ? "Unavailable" : "Available"}
                      </button>
                    </div>

                    {selectedJobs.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                        No work on this day.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {selectedJobs.map((job) => (
                          <li key={job.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                            <p className="truncate text-[11.5px] font-semibold text-forest">{job.title}</p>
                            <p className="truncate text-[10.5px] text-slate-500">{job.employer_name}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </Panel>

            <Panel title="Reminders" description="Upcoming scheduled work">
              <div className="divide-y divide-slate-100">
                {rows
                  .filter((a) => a.status === "scheduled" || a.status === "in_progress")
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .slice(0, 4)
                  .map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3.5 py-2.5">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-brand-700" />
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-semibold text-forest">{a.title}</p>
                        <p className="text-[10.5px] text-slate-500">{formatDate(a.start_date)}</p>
                      </div>
                    </div>
                  ))}
                {rows.filter((a) => a.status === "scheduled" || a.status === "in_progress").length === 0 && (
                  <div className="px-3.5 py-6 text-center text-[11px] text-slate-500">
                    No upcoming work scheduled.
                  </div>
                )}
              </div>
            </Panel>
          </aside>
        </div>
      )}

      {failed === null && assignments.state === "ready" && rows.length === 0 && !loading && (
        <div className="card">
          <EmptyState
            icon={CalendarDays}
            title="Your calendar is empty"
            description="Scheduled jobs and the days you mark unavailable will show up on this calendar."
          />
        </div>
      )}

      {/* Conflict confirmation — never block a day silently. */}
      <Modal
        open={Boolean(pendingDay)}
        onClose={() => setPendingDay(null)}
        title="You already have work this day"
        subtitle={pendingDay ? formatDate(pendingDay) : undefined}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Marking this day unavailable does <strong>not</strong> cancel the job below. Tell your
              employer separately if you cannot work.
            </span>
          </div>
          <ul className="space-y-1.5">
            {conflicts.map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-semibold text-forest">{job.title}</p>
                  <p className="truncate text-[10.5px] text-slate-500">{job.employer_name}</p>
                </div>
                <AssignmentStatusPill status={job.status} />
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPendingDay(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !pendingDay}
              onClick={() => pendingDay && void markDay(pendingDay, !days.get(pendingDay)?.available)}
              className="inline-flex h-9 items-center rounded-lg bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Mark unavailable anyway"}
            </button>
          </div>
        </div>
      </Modal>
    </WorkerLayout>
  );
}
