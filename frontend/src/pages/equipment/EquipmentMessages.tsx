import { useMemo, useState } from "react";
import { MessageSquare, Send, Tractor, UserRound } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { EmptyState, ErrorNotice, Loading, Panel, inputClass } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeEquipmentError,
  formatDateTime,
  listBookings,
  listMessages,
  sendMessage,
} from "@/lib/equipment";
import type { EquipmentBooking, EquipmentMessage } from "@/lib/equipment";

/**
 * Messages.
 *
 * Threads are derived from the owner's own bookings, so the people you can
 * message are the people you actually have a rental with. Each message stores a
 * direction, which is what makes the thread usable as a record in a dispute.
 */
export default function EquipmentMessages() {
  const D = describeEquipmentError;
  const messages = useWorkerData<EquipmentMessage[]>(() => listMessages(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const messageList = messages.data ?? [];
  const bookingList = bookings.data ?? [];

  const threads = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        role: string | null;
        bookingId: string | null;
        messages: EquipmentMessage[];
        lastAt: string;
      }
    >();

    for (const m of messageList) {
      const key = m.counterpart_id ?? `name:${m.counterpart_name}`;
      const existing = map.get(key);
      if (existing) {
        existing.messages.push(m);
        if (m.created_at > existing.lastAt) existing.lastAt = m.created_at;
        continue;
      }
      map.set(key, {
        id: key,
        name: m.counterpart_name,
        role: m.counterpart_role,
        bookingId: m.booking_id,
        messages: [m],
        lastAt: m.created_at,
      });
    }

    // Renters with a booking but no message yet still get a thread.
    for (const b of bookingList) {
      if (!b.renter_name) continue;
      if (map.has(b.renter_id)) continue;
      map.set(b.renter_id, {
        id: b.renter_id,
        name: b.renter_name,
        role: b.renter_role,
        bookingId: b.id,
        messages: [],
        lastAt: b.created_at,
      });
    }

    return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [messageList, bookingList]);

  const selected = threads.find((t) => t.id === selectedId) ?? threads[0] ?? null;

  async function handleSend() {
    if (!selected || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await sendMessage({
        counterpart_id: selected.id.startsWith("name:") ? null : selected.id,
        counterpart_name: selected.name,
        counterpart_role: selected.role,
        booking_id: selected.bookingId,
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

  if (messages.state === "loading") {
    return (
      <EquipmentLayout title="Messages">
        <Loading label="Loading messages…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout title="Messages" subtitle="Renters and CenAGRI support">
      {messages.state === "error" && <ErrorNotice message={messages.error} onRetry={messages.reload} />}
      {error && <ErrorNotice message={error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Conversations" description={`${threads.length} thread(s)`}>
          {threads.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No conversations"
              description="A thread appears once you have a booking with a renter. Messages are kept as a written record of what was agreed."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {threads.map((t) => {
                const last = t.messages[t.messages.length - 1];
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition hover:bg-slate-50 ${selected?.id === t.id ? "bg-brand-50" : ""
                        }`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-800">
                        <UserRound className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-forest">{t.name}</p>
                        <p className="truncate text-[10.5px] text-slate-500">
                          {last ? last.body : "No messages yet"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="lg:col-span-2">
          {!selected ? (
            <Panel title="Conversation">
              <div className="px-4 py-16 text-center text-[11.5px] text-slate-500">Select a conversation.</div>
            </Panel>
          ) : (
            <Panel
              title={selected.name}
              description={selected.role ?? "Renter"}
              action={
                selected.bookingId ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[9.5px] text-slate-600">
                    booking {selected.bookingId.slice(0, 8)}
                  </span>
                ) : undefined
              }
            >
              <div className="max-h-[52vh] min-h-[240px] space-y-2 overflow-y-auto p-4">
                {selected.messages.length === 0 ? (
                  <p className="py-12 text-center text-[11.5px] text-slate-500">
                    No messages yet — start the conversation.
                  </p>
                ) : (
                  selected.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-2 text-[11.5px] leading-relaxed ${m.direction === "out" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-800"
                          }`}
                      >
                        <p>{m.body}</p>
                        <p className={`mt-1 text-[9.5px] ${m.direction === "out" ? "text-white/70" : "text-slate-500"}`}>
                          {formatDateTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2 border-t border-slate-100 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Write a message…"
                  className={inputClass}
                  maxLength={4000}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={busy || !draft.trim()}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Send"}
                </button>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Why messages are stored" description="A written record protects both sides">
        <div className="flex items-start gap-2 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <Tractor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            Rentals go wrong over things nobody wrote down: who supplies fuel, what time the machine
            arrives, how many acres were actually worked. Agreeing it here means a later disagreement has a
            factual record. This is the same messaging system the other CenAGRI accounts use.
          </span>
        </div>
      </Panel>
    </EquipmentLayout>
  );
}
