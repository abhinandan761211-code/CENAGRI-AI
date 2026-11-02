import { useMemo, useState } from "react";
import { MessageSquare, Send, ShieldCheck } from "lucide-react";
import EmployerLayout from "@/components/employer/EmployerLayout";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeEmployerError,
  listEmployerThreads,
  replyToWorker,
} from "@/lib/employer";
import type { EmployerThreadMessage } from "@/lib/employer";
import { formatDateTime } from "@/lib/worker";

/**
 * Employer messages.
 *
 * Threads are grouped by worker, so every job conversation with the same person
 * stays in one place. Sending writes a real row into `worker_messages` that the
 * worker sees immediately in their own inbox — one table, two readers.
 */
export default function EmployerMessages() {
  const threads = useWorkerData<EmployerThreadMessage[]>(() => listEmployerThreads(), [], describeEmployerError);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = threads.data ?? [];

  /** Group by the worker (`worker_id` is the other party from here). */
  const grouped = useMemo(() => {
    const map = new Map<string, { id: string; name: string; rows: EmployerThreadMessage[] }>();
    for (const row of rows) {
      const thread = map.get(row.worker_id) ?? {
        id: row.worker_id,
        name: row.counterpart_name || "Worker",
        rows: [],
      };
      thread.rows.push(row);
      map.set(row.worker_id, thread);
    }
    return Array.from(map.values()).sort((a, b) => {
      const lastA = a.rows[a.rows.length - 1]?.created_at ?? "";
      const lastB = b.rows[b.rows.length - 1]?.created_at ?? "";
      return lastB.localeCompare(lastA);
    });
  }, [rows]);

  const active = grouped.find((t) => t.id === activeId) ?? grouped[0] ?? null;

  async function handleSend() {
    if (!active || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const last = active.rows[active.rows.length - 1];
      await replyToWorker({
        workerId: active.id,
        workerName: active.name,
        workerRole: "Worker",
        jobId: last?.job_id ?? null,
        body: draft.trim(),
      });
      setDraft("");
      threads.reload();
    } catch (err) {
      setError(describeEmployerError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EmployerLayout title="Messages" subtitle="Conversations with workers">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          Keep hiring conversations inside CenAGRI. Never ask a worker for money to secure a job.
        </span>
      </div>

      {threads.state === "loading" && <Loading label="Loading messages…" />}
      {threads.state === "error" && (
        <ErrorNotice message={threads.error} onRetry={threads.reload} />
      )}

      {threads.state === "ready" && grouped.length === 0 && (
        <div className="card">
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            description="Message a worker from the Applicants page, or reply when a worker writes to you about a job."
          />
        </div>
      )}

      {threads.state === "ready" && grouped.length > 0 && active && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Panel title="Workers" className="h-fit">
            <ul className="divide-y divide-slate-100">
              {grouped.map((thread) => {
                const last = thread.rows[thread.rows.length - 1];
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(thread.id)}
                      className={`flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition ${
                        active.id === thread.id ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate text-[12px] font-semibold text-forest">{thread.name}</span>
                      <span className="truncate text-[10.5px] text-slate-500">{last?.body ?? ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title={active.name} description="Worker">
            <div className="flex h-[420px] flex-col">
              <ul className="flex-1 space-y-2.5 overflow-y-auto p-4">
                {active.rows.map((row) => (
                  <li key={row.id} className={`flex ${row.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                        row.direction === "out"
                          ? "bg-brand-700 text-white"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      <p className="whitespace-pre-line">{row.body}</p>
                      <p
                        className={`mt-1 text-[9.5px] ${
                          row.direction === "out" ? "text-white/60" : "text-slate-400"
                        }`}
                      >
                        {formatDateTime(row.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {error && <p className="px-4 pb-1 text-[11.5px] font-semibold text-rose-600">{error}</p>}

              <div className="flex items-end gap-2 border-t border-slate-100 p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  placeholder="Write a message…"
                  className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] text-slate-800 outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={busy || !draft.trim()}
                  aria-label="Send message"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </EmployerLayout>
  );
}
