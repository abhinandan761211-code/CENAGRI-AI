import { useMemo, useState } from "react";
import { MessageSquare, Send, Store, Truck, UserRound } from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import { EmptyState, ErrorNotice, Loading, Panel, inputClass } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeWarehouseError,
  formatDateTime,
  listMessages,
  listStorageBookings,
  sendMessage,
} from "@/lib/warehouse";
import type { StorageBooking, WarehouseMessage } from "@/lib/warehouse";

/**
 * Messages.
 *
 * One thread per counterpart, derived from the owner's own bookings — so the
 * people you can message are the people you actually have a relationship with.
 * Every message is stored with a direction, which is what makes it usable as a
 * record in a later dispute.
 */
export default function WarehouseMessages() {
  const D = describeWarehouseError;
  const messages = useWorkerData<WarehouseMessage[]>(() => listMessages(), [], D);
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const messageList = messages.data ?? [];
  const bookingList = bookings.data ?? [];

  /** Counterparties come from bookings: depositors you actually deal with. */
  const threads = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        role: string | null;
        bookingId: string | null;
        messages: WarehouseMessage[];
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

    // Depositors with a booking but no message yet still get a thread.
    for (const b of bookingList) {
      if (!b.depositor_name) continue;
      const key = b.farmer_id;
      if (map.has(key)) continue;
      map.set(key, {
        id: key,
        name: b.depositor_name,
        role: b.depositor_role,
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
      const isBookingId = selected.bookingId != null;
      await sendMessage({
        counterpart_id: selected.id.startsWith("name:") ? null : selected.id,
        counterpart_name: selected.name,
        counterpart_role: selected.role,
        booking_id: isBookingId ? selected.bookingId : null,
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
      <WarehouseLayout title="Messages">
        <Loading label="Loading messages…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout title="Messages" subtitle="Depositors, transporters and Kalika support">
      {messages.state === "error" && <ErrorNotice message={messages.error} onRetry={messages.reload} />}
      {error && <ErrorNotice message={error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Conversations" description={`${threads.length} thread(s)`}>
          {threads.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No conversations"
              description="A thread appears once you have a booking with a depositor. Messages are kept as a written record, which helps if a dispute arises."
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
                        {t.role === "Transporter" ? <Truck className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
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
              <div className="px-4 py-16 text-center text-[11.5px] text-slate-500">
                Select a conversation.
              </div>
            </Panel>
          ) : (
            <Panel
              title={selected.name}
              description={selected.role ?? "Depositor"}
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
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-2 text-[11.5px] leading-relaxed ${m.direction === "out"
                            ? "bg-brand-700 text-white"
                            : "bg-slate-100 text-slate-800"
                          }`}
                      >
                        <p>{m.body}</p>
                        <p
                          className={`mt-1 text-[9.5px] ${m.direction === "out" ? "text-white/70" : "text-slate-500"
                            }`}
                        >
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
          <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            Agreeing on weights, gate timings or condition in writing means a later disagreement has a
            factual record. This is the same messaging system the other account types use — nothing here is
            a separate chat product.
          </span>
        </div>
      </Panel>
    </WarehouseLayout>
  );
}
