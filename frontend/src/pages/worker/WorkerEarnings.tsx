import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarRange,
  CheckCircle2,
  Clock,
  Download,
  IndianRupee,
  Info,
  TrendingUp,
  Wallet,
} from "lucide-react";
import WorkerLayout from "@/components/worker/WorkerLayout";
import { EarningStatusPill } from "@/components/worker/ui";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  EARNING_STATUSES,
  earningsTotals,
  formatDate,
  formatINR,
  listEarnings,
} from "@/lib/worker";
import type { EarningStatus, WorkerEarning } from "@/lib/worker";

/**
 * Earnings & payments.
 *
 * A figure only counts as "earned" when the row says `paid` — pending and
 * processing money is shown separately and is never added to the total. That is
 * the whole point of the earnings table being write-protected for workers.
 */
export default function WorkerEarnings() {
  const earnings = useWorkerData<WorkerEarning[]>(() => listEarnings());
  const [status, setStatus] = useState<EarningStatus | "all">("all");

  const rows = earnings.data ?? [];
  const totals = earningsTotals(rows);

  const visible = status === "all" ? rows : rows.filter((r) => r.status === status);

  /** Last 6 months of paid amounts, oldest first, for the little bar chart. */
  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleDateString("en-IN", { month: "short" });
      const total = rows
        .filter((r) => {
          if (r.status !== "paid") return false;
          const at = new Date(r.paid_on ?? r.created_at);
          return at.getFullYear() === d.getFullYear() && at.getMonth() === d.getMonth();
        })
        .reduce((sum, r) => sum + Number(r.amount_inr), 0);
      return { label, total };
    });
  }, [rows]);

  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  function exportCsv() {
    const header = ["Date", "Job", "Employer", "Amount (INR)", "Status", "Reference"];
    const lines = rows.map((r) =>
      [
        formatDate(r.paid_on ?? r.created_at),
        `"${r.job_title.replace(/"/g, "'")}"`,
        `"${(r.employer_name ?? "").replace(/"/g, "'")}"`,
        Number(r.amount_inr).toFixed(2),
        r.status,
        r.reference ?? "",
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cenagri-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <WorkerLayout
      title="Earnings"
      subtitle="Your payments, job by job"
      action={
        rows.length > 0 ? (
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        ) : undefined
      }
    >
      {earnings.state === "loading" && <Loading label="Loading earnings…" />}
      {earnings.state === "error" && <ErrorNotice message={earnings.error} onRetry={earnings.reload} />}

      {earnings.state === "ready" && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={IndianRupee}
              label="Total earnings"
              value={formatINR(totals.totalEarned)}
              hint="Confirmed payments only"
            />
            <StatCard
              icon={TrendingUp}
              label="This month"
              value={formatINR(totals.thisMonth)}
              hint="Paid this month"
            />
            <StatCard
              icon={Wallet}
              label="Pending payments"
              value={formatINR(totals.pending)}
              hint="Not paid yet"
              tone="amber"
            />
            <StatCard
              icon={CheckCircle2}
              label="Paid jobs"
              value={String(totals.jobsCount)}
              hint={totals.avgPerJob ? `Avg ${formatINR(totals.avgPerJob)}/job` : "No payments yet"}
            />
          </section>

          {/* Payment honesty note — the brief forbids showing a payment as
              successful before the backend confirms it. */}
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              An amount is added to <strong className="font-bold text-forest">Total earnings</strong> only
              after the payment is confirmed. Pending and processing amounts are never counted as paid.
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* ── Monthly chart ── */}
            <Panel title="Last 6 months" description="Paid earnings per month" className="lg:col-span-1">
              <div className="p-4">
                <div className="flex h-32 items-end gap-2">
                  {monthly.map((m) => (
                    <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[9.5px] font-bold text-slate-500">
                        {m.total > 0 ? formatINR(m.total) : ""}
                      </span>
                      <div
                        className="w-full rounded-t-md bg-brand-600 transition-[height]"
                        style={{ height: `${Math.max(2, (m.total / maxMonth) * 90)}px` }}
                        title={`${m.label}: ${formatINR(m.total)}`}
                      />
                      <span className="text-[10px] font-semibold text-slate-500">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* ── History ── */}
            <Panel
              title="Payment history"
              description={`${rows.length} record${rows.length === 1 ? "" : "s"}`}
              className="lg:col-span-2"
              action={
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EarningStatus | "all")}
                  aria-label="Filter by status"
                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-brand-500"
                >
                  <option value="all">All statuses</option>
                  {EARNING_STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              }
            >
              {visible.length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  title={rows.length === 0 ? "No payments yet" : "Nothing in this status"}
                  description={
                    rows.length === 0
                      ? "Payments appear here after you finish work and the employer confirms it. Attendance is verified first, so nothing is added early."
                      : "Try another status filter."
                  }
                />
              ) : (
                <>
                  {/* Table on wide screens */}
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full text-left text-[11.5px]">
                      <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-bold">Date</th>
                          <th className="px-4 py-2 font-bold">Job</th>
                          <th className="px-4 py-2 font-bold">Employer</th>
                          <th className="px-4 py-2 text-right font-bold">Amount</th>
                          <th className="px-4 py-2 font-bold">Status</th>
                          <th className="px-4 py-2 font-bold">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visible.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                              {formatDate(row.paid_on ?? row.created_at)}
                            </td>
                            <td className="max-w-[180px] truncate px-4 py-2.5 font-semibold text-forest">
                              {row.job_title}
                            </td>
                            <td className="max-w-[140px] truncate px-4 py-2.5 text-slate-600">
                              {row.employer_name ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-forest">
                              {formatINR(Number(row.amount_inr))}
                            </td>
                            <td className="px-4 py-2.5">
                              <EarningStatusPill status={row.status} />
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[10.5px] text-slate-500">
                              {row.reference ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards on phones */}
                  <ul className="divide-y divide-slate-100 sm:hidden">
                    {visible.map((row) => (
                      <li key={row.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold text-forest">
                              {row.job_title}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {row.employer_name ?? "—"} · {formatDate(row.paid_on ?? row.created_at)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[12.5px] font-bold text-forest">
                              {formatINR(Number(row.amount_inr))}
                            </p>
                            <EarningStatusPill status={row.status} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </div>

          {/* ── Job-wise breakdown ── */}
          {rows.length > 0 && (
            <Panel title="Job-wise earnings" description="Every job and what it paid">
              <ul className="divide-y divide-slate-100">
                {rows.slice(0, 10).map((row) => (
                  <li key={`breakdown-${row.id}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <CalendarRange className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-forest">{row.job_title}</p>
                      <p className="truncate text-[10.5px] text-slate-500">
                        {row.period_start && row.period_end
                          ? `${formatDate(row.period_start)} – ${formatDate(row.period_end)}`
                          : row.days_worked
                            ? `${row.days_worked} days`
                            : formatDate(row.created_at)}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      {row.status}
                    </span>
                    <span className="shrink-0 text-[12.5px] font-bold text-forest">
                      {formatINR(Number(row.amount_inr))}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </WorkerLayout>
  );
}
