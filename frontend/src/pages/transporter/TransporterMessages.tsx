import { useMemo, useState } from "react";
import { MessageSquare, Send, ShieldCheck } from "lucide-react";
import TransporterLayout from "@/components/transporter/TransporterLayout";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeTransporterError,
  formatDateTime,
  listMessages,
  sendMessage,
} from "@/lib/transporter";
import type { TransporterMessage } from "@/lib/transporter";

/**
 * Messages with requesters.
 *
 * Threads are grouped by the other party so a conversation about two trips with
 * the same farmer stays in one place. Sending is a real insert — there is no
 * fake delivery state.
 */
export default function TransporterMessages() {
  const D = describeTransporterError;
  const messages = useWorkerData<TransporterMessage[]>(() => listMessages(), [], D);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = messages.data ?? [];

  const threads = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string | null; rows: TransporterMessage[] }>();
    for (const row of rows) {
      const key = row.counterpart_id ?? row.counterpart_name;
      const thread = map.get(key) ?? {
        id: key,
        name: row.counterpart_name,
        role: row.counterpart_role,
        rows: [],
      };
      thread.rows.push(row);
      map.set(key, thread);
    }
    return Array.from(map.values()).sort((a, b) => {
      const lastA = a.rows[a.rows.length - 1]?.created_at ?? "";
      const lastB = b.rows[b.rows.length - 1]?.created_at ?? "";
      return lastB.localeCompare(lastA);
    });
  }, [rows]);

  const active = threads.find((t) => t.id === activeId) ?? threads[0] ?? null;

  async function handleSend() {
    if (!active || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const last = active.rows[active.rows.length - 1];
      await sendMessage({
        counterpart_id: active.rows[active.rows.length - 1]?.counterpart_id ?? null,
        counterpart_name: active.name,
        counterpart_role: active.role,
        booking_id: last?.booking_id ?? null,
        body: draft.trim(),
      });
      setDraft("");
      messages.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TransporterLayout title="Messages" subtitle="Talk to requesters about pickups and delivery">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>Keep contact inside Kalika. Never share OTPs, bank details or vehicle keys with anyone.</span>
      </div>

      {messages.state === "loading" && <Loading label="Loading messages…" />}
      {messages.state === "error" && <ErrorNotice message={messages.error} onRetry={messages.reload} />}

      {messages.state === "ready" && threads.length === 0 && (
        <div className="card">
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="When a requester replies to your quote, the conversation appears here. You can also message them from a trip."
          />
        </div>
      )}

      {messages.state === "ready" && threads.length > 0 && active && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Panel title="Conversations" className="h-fit">
            <ul className="divide-y divide-slate-100">
              {threads.map((thread) => {
                const last = thread.rows[thread.rows.length - 1];
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(thread.id)}
                      className={`flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition ${active.id === thread.id ? "bg-brand-50" : "hover:bg-slate-50"
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

          <Panel title={active.name} description={active.role ?? "Requester"}>
            <div className="flex h-[420px] flex-col">
              <ul className="flex-1 space-y-2.5 overflow-y-auto p-4">
                {active.rows.map((row) => (
                  <li key={row.id} className={`flex ${row.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-[12px] leading-relaxed ${row.direction === "out"
                          ? "bg-brand-700 text-white"
                          : "bg-slate-100 text-slate-800"
                        }`}
                    >
                      <p className="whitespace-pre-line">{row.body}</p>
                      <p
                        className={`mt-1 text-[9.5px] ${row.direction === "out" ? "text-white/60" : "text-slate-400"
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
    </TransporterLayout>
  );
}
