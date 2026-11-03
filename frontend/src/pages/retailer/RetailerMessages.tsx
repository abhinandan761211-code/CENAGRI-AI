import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import { EmptyState, ErrorNotice, Loading } from "@/components/retailer/ui";
import { useRetailerData } from "@/hooks/useRetailerData";
import { formatDateTime, listMessages, sendMessage } from "@/lib/retailer";
import type { RetailerMessage } from "@/lib/retailer";

type Thread = {
  key: string;
  name: string;
  role: string | null;
  counterpartId: string | null;
  messages: RetailerMessage[];
  lastAt: string;
  unread: number;
};

/**
 * Messages — conversations with farmers and customers.
 *
 * Threads are derived from `retailer_messages` (one row per message, `direction`
 * in/out). A thread is keyed by counterpart id, falling back to the name for
 * messages from people who are not signed-in accounts.
 */
export default function RetailerMessages() {
  const { data, setData, state, error, reload } = useRetailerData<RetailerMessage[]>(
    () => listMessages(),
    []
  );

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const messages = data ?? [];

  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Thread>();
    for (const message of messages) {
      const key = message.counterpart_id ?? `name:${message.counterpart_name}`;
      const thread =
        map.get(key) ??
        ({
          key,
          name: message.counterpart_name,
          role: message.counterpart_role,
          counterpartId: message.counterpart_id,
          messages: [],
          lastAt: message.created_at,
          unread: 0,
        } satisfies Thread);
      thread.messages.push(message);
      if (message.created_at > thread.lastAt) thread.lastAt = message.created_at;
      if (message.direction === "in" && !message.read_at) thread.unread += 1;
      map.set(key, thread);
    }
    return Array.from(map.values())
      .map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [messages]);

  const active = threads.find((t) => t.key === activeKey) ?? threads[0] ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [active?.key, active?.messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const created = await sendMessage({
        counterpart_id: active.counterpartId,
        counterpart_name: active.name,
        counterpart_role: active.role,
        body: draft.trim(),
      });
      setData([...messages, created]);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <RetailerLayout
      title="Messages"
      subtitle={`${threads.length} conversation${threads.length === 1 ? "" : "s"}`}
    >
      {state === "loading" && <Loading label="Loading conversations…" />}
      {state === "error" && <ErrorNotice message={error} onRetry={() => void reload()} />}

      {state === "ready" && threads.length === 0 && (
        <div className="card">
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            description="Messages from farmers and customers appear here. You can also start one from an order or a procurement request."
          />
        </div>
      )}

      {state === "ready" && threads.length > 0 && active && (
        <div className="card grid overflow-hidden md:grid-cols-[260px_1fr]">
          {/* Thread list */}
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto border-b border-slate-100 md:max-h-[70vh] md:border-b-0 md:border-r">
            {threads.map((thread) => {
              const selected = thread.key === active.key;
              return (
                <li key={thread.key}>
                  <button
                    type="button"
                    onClick={() => setActiveKey(thread.key)}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${selected ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-800">
                      {thread.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-forest">{thread.name}</span>
                        {thread.unread > 0 && (
                          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-700 px-1 text-[9px] font-bold text-white">
                            {thread.unread}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {thread.messages[thread.messages.length - 1]?.body}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Conversation */}
          <div className="flex min-h-[50vh] flex-col">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[13px] font-bold text-forest">{active.name}</p>
                <p className="text-[11px] text-slate-500">
                  {active.role ?? "Customer"} · {active.messages.length} messages
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
              {active.messages.map((message) => {
                const mine = message.direction === "out";
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${mine
                          ? "rounded-br-sm bg-brand-700 text-white"
                          : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                        }`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p className={`mt-1 text-[9px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                        {formatDateTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="border-t border-slate-100 p-3">
              {sendError && <p className="mb-2 text-[11px] text-red-600">{sendError}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend(e);
                    }
                  }}
                  placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)"
                  className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </RetailerLayout>
  );
}
