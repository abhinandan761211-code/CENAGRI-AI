import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CloudSun, Clock, MessageSquare, Package, Send, TrendingUp } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  LoadingRows,
  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  Stat,
  Textarea,
  Toast,
  useToast,
  shortDate,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  farmerError,
  listMyMessages,
  markThreadRead,
  sendMessage,
} from "@/lib/farmer";
import type { FarmerMessage } from "@/lib/farmer";

/**
 * Messages — support-style threads between the farmer and other accounts.
 *
 * A thread is a group of `farmer_messages` rows sharing `thread_id`. Starting a
 * new conversation needs the other person's account email (the marketplace,
 * labour and booking screens start threads for you from a real context).
 */

type Thread = {
  id: string;
  peerId: string;
  peerName: string | null;
  messages: FarmerMessage[];
  unread: number;
  last: FarmerMessage;
};

export default function MessagesPage({ inCenFriend = false }: { inCenFriend?: boolean }) {
  const { user } = useAuth();
  const { toast, showToast } = useToast();
  /**
   * Two shells, one page.
   *
   * Opened from CenFriend's rail, the page must keep CenFriend's rail — that is
   * the whole point of the fix: Messages used to jump out to the app shell and
   * the community navigation disappeared mid-journey. Opened from anywhere
   * else it keeps the farmer shell it has always had. The logic, the data and
   * the layout are identical either way; only the chrome differs.
   */
  const Shell = inCenFriend ? CenFriendShell : FarmerShell;

  const [messages, setMessages] = useState<FarmerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ email: "", body: "" });
  const [composeError, setComposeError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listMyMessages();
      const peerIds = [...new Set(rows.map((m) => (m.sender_id === user.id ? m.recipient_id : m.sender_id)))];
      let names = new Map<string, string>();
      if (peerIds.length > 0 && supabase) {
        const { data } = await supabase.from("profiles").select("id, full_name").in("id", peerIds);
        names = new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "Kalika user"]));
      }
      setMessages(rows.map((m) => ({ ...m })));
      setPeers(names);
    } catch (err) {
      setError(farmerError(err, "Could not load your messages."));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const [peers, setPeers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void load();
  }, [load]);

  const threads = useMemo<Thread[]>(() => {
    if (!user) return [];
    const map = new Map<string, FarmerMessage[]>();
    for (const message of messages) {
      const list = map.get(message.thread_id) ?? [];
      list.push(message);
      map.set(message.thread_id, list);
    }
    return [...map.entries()]
      .map(([id, list]) => {
        const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const last = sorted[sorted.length - 1];
        const peerId = last.sender_id === user.id ? last.recipient_id : last.sender_id;
        return {
          id,
          peerId,
          peerName: peers.get(peerId) ?? null,
          messages: sorted,
          unread: sorted.filter((m) => m.recipient_id === user.id && !m.read_at).length,
          last,
        };
      })
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [messages, user, peers]);

  const active = threads.find((t) => t.id === activeId) ?? threads[0] ?? null;

  useEffect(() => {
    if (active && active.unread > 0) {
      void markThreadRead(active.id)
        .then(() => load())
        .catch(() => {
          /* read receipts are best-effort */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!active || !body.trim()) return;
    setSending(true);
    try {
      await sendMessage({ recipient_id: active.peerId, body, thread_id: active.id });
      setBody("");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not send the message."));
    } finally {
      setSending(false);
    }
  }

  async function startConversation(e: FormEvent) {
    e.preventDefault();
    if (!compose.email.trim() || !compose.body.trim() || !supabase) return;
    setComposeError("");
    try {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", compose.email.trim().toLowerCase())
        .maybeSingle();
      if (err) throw err;
      if (!data) {
        setComposeError("No Kalika account uses that email.");
        return;
      }
      await sendMessage({ recipient_id: data.id as string, body: compose.body, context_type: "general" });
      setCompose({ email: "", body: "" });
      setComposeOpen(false);
      showToast("Message sent");
      await load();
    } catch (err) {
      setComposeError(farmerError(err, "Could not start the conversation."));
    }
  }

  return (
    // `activeOverride="messages"` keeps the rail's Messages item highlighted.
    <Shell {...(inCenFriend ? { activeOverride: "messages" as const } : { title: "Messages" })}>
      <PageHeader
        icon={MessageSquare}
        title="Messages"
        description="Conversations with buyers, workers, transporters and advisors. Messages about an order, booking or listing are grouped with that context."
        actions={
          <PrimaryButton onClick={() => setComposeOpen((v) => !v)}>
            <Send className="h-3.5 w-3.5" /> New message
          </PrimaryButton>
        }
      />

      {composeOpen && (
        <Panel title="Start a conversation" icon={Send}>
          <form onSubmit={startConversation} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Their account email
              </span>
              <input
                type="email"
                value={compose.email}
                onChange={(e) => setCompose({ ...compose, email: e.target.value })}
                placeholder="name@example.com"
                required
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Message</span>
              <input
                value={compose.body}
                onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                placeholder="Hello, I would like to…"
                required
                maxLength={2000}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            </label>
            <PrimaryButton type="submit">Send</PrimaryButton>
            {composeError && (
              <p role="alert" className="text-[11px] text-rose-700 sm:col-span-3">
                {composeError}
              </p>
            )}
          </form>
        </Panel>
      )}

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Panel flush>
          <div className="border-b border-slate-200 px-4 py-2.5">
            <p className="text-xs font-bold text-forest">Conversations</p>
          </div>
          {loading ? (
            <LoadingRows rows={4} />
          ) : threads.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No messages yet"
              body="When you contact a seller, send a work request or receive one, the conversation appears here."
            />
          ) : (
            <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(thread.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${active?.id === thread.id ? "bg-brand-50/70" : ""
                      }`}
                  >
                    <p className="flex items-center justify-between gap-2 text-xs font-bold text-forest">
                      <span className="truncate">{thread.peerName ?? "Kalika user"}</span>
                      {thread.unread > 0 && (
                        <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                          {thread.unread}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {thread.last.sender_id === user?.id ? "You: " : ""}
                      {thread.last.body}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{shortDate(thread.last.created_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={active ? active.peerName ?? "Conversation" : "Conversation"}
          icon={MessageSquare}
          description={active?.last.context_type ? `Related to a ${active.last.context_type}` : undefined}
        >
          {!active ? (
            <EmptyState icon={MessageSquare} title="No conversation selected" body="Pick a conversation on the left." />
          ) : (
            <>
              <ul className="max-h-[400px] min-h-[220px] space-y-2 overflow-y-auto p-4">
                {active.messages.map((message) => {
                  const mine = message.sender_id === user?.id;
                  return (
                    <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${mine
                            ? "rounded-br-sm bg-brand-700 text-white"
                            : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                          }`}
                      >
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p className={`mt-1 text-[9px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                          {new Date(message.created_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {mine && message.read_at ? " · read" : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <form onSubmit={send} className="border-t border-slate-200 p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={1}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write a message…"
                    maxLength={2000}
                    aria-label="Your message"
                    className="min-h-[40px]"
                  />
                  <PrimaryButton type="submit" disabled={sending || !body.trim()} className="h-10 shrink-0">
                    <Send className="h-3.5 w-3.5" />
                  </PrimaryButton>
                </div>
              </form>
            </>
          )}
        </Panel>
      </div>

      <Toast message={toast} />
    </Shell>
  );
}

/* ── Notifications page ───────────────────────────────────────────────── */

type Notice = {
  id: string;
  title: string;
  body: string;
  kind: "weather" | "market" | "community" | "booking" | "ai";
  at: string;
  to?: string;
};

const KIND_META: Record<Notice["kind"], { icon: typeof Bell; tone: "green" | "amber" | "blue" | "slate" | "teal" }> = {
  weather: { icon: CloudSun, tone: "amber" },
  market: { icon: TrendingUp, tone: "green" },
  community: { icon: MessageSquare, tone: "blue" },
  booking: { icon: Package, tone: "teal" },
  ai: { icon: Bell, tone: "slate" },
};

/**
 * Notifications — the farmer's alert centre.
 *
 * The list is derived from real state: live weather warnings, the top mandi
 * move for the district, unread messages and today's due tasks. If the weather
 * feed is not configured nothing is invented in its place.
 */
export function NotificationsPage() {
  const { user, profile } = useAuth();
  const details = profile?.details ?? {};
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | Notice["kind"]>("all");
  const [read, setRead] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    const out: Notice[] = [];

    try {
      // Weather alerts (live forecast only).
      const { getWeather, deriveAlerts, isWeatherConfigured } = await import("@/lib/weather");
      if (details.district && isWeatherConfigured) {
        const weather = await getWeather(details.district, details.state, details.village).catch(() => null);
        for (const alert of deriveAlerts(weather)) {
          out.push({
            id: alert.id,
            title: alert.title,
            body: alert.body,
            kind: "weather",
            at: new Date().toISOString(),
            to: "/weather",
          });
        }
      }
    } catch {
      /* weather is optional */
    }

    try {
      // Mandi movement for the farmer's district.
      const { getMandiPrices, rowsForTab } = await import("@/lib/mandi");
      const result = await getMandiPrices({ district: details.district, state: details.state, limit: 40 }).catch(() => null);
      if (result) {
        const top = rowsForTab(result.records, "Top Commodities")[0];
        if (top?.modal_price != null) {
          out.push({
            id: `mandi-${top.commodity}-${top.market}`,
            title: `${top.commodity} at ₹${top.modal_price.toLocaleString("en-IN")} in ${top.market}`,
            body: "Today's modal price at the mandi nearest your district profile.",
            kind: "market",
            at: result.records[0]?.arrival_date ?? new Date().toISOString(),
            to: "/mandi",
          });
        }
      }
    } catch {
      /* mandi is optional */
    }

    try {
      // Unread messages.
      const { listMyMessages } = await import("@/lib/farmer");
      const messages = await listMyMessages(60);
      const unread = messages.filter((m) => m.recipient_id === user.id && !m.read_at);
      if (unread.length > 0) {
        out.push({
          id: "messages-unread",
          title: `${unread.length} unread message${unread.length > 1 ? "s" : ""}`,
          body: "Open Messages to reply.",
          kind: "community",
          at: unread[0].created_at,
          to: "/messages",
        });
      }
    } catch {
      /* messaging may not be set up */
    }

    try {
      // Tasks due today or overdue.
      const { listTasks } = await import("@/lib/farmer");
      const tasks = await listTasks();
      const today = new Date().toISOString().slice(0, 10);
      const due = tasks.filter((t) => !t.done && t.due_on <= today);
      for (const task of due.slice(0, 5)) {
        out.push({
          id: `task-${task.id}`,
          title: task.title,
          body: task.due_on < today ? "This task is overdue." : "Due today on your crop calendar.",
          kind: "ai",
          at: `${task.due_on}T00:00:00`,
          to: "/calendar",
        });
      }
    } catch {
      /* tasks may not be set up */
    }

    setNotices(out.sort((a, b) => b.at.localeCompare(a.at)));
    setLoading(false);
  }, [user, details.district, details.state, details.village]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = notices.filter((n) => filter === "all" || n.kind === filter);

  return (
    <FarmerShell title="Notifications">
      <PageHeader
        icon={Bell}
        title="Notifications"
        description="Weather warnings, mandi movement, task reminders and unread messages — all built from your own account's live data."
        actions={
          <button
            type="button"
            onClick={() => setRead(notices.map((n) => n.id))}
            className="creator-btn-ghost h-9 px-3.5 text-xs"
          >
            <Check className="h-3.5 w-3.5" /> Mark all read
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="All alerts" value={notices.length} icon={Bell} hint="From live data" />
        <Stat label="Weather" value={notices.filter((n) => n.kind === "weather").length} icon={CloudSun} tone="amber" hint="Forecast derived" />
        <Stat label="Market" value={notices.filter((n) => n.kind === "market").length} icon={TrendingUp} tone="green" hint="Mandi prices" />
        <Stat label="Unread" value={notices.filter((n) => !read.includes(n.id)).length} icon={Clock} tone="blue" hint="New since you last looked" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", "weather", "market", "community", "ai"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            aria-pressed={filter === option}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize ${filter === option ? "bg-forest text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            {option}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <Panel flush>
        {loading ? (
          <LoadingRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing to show"
            body="Alerts appear when there is a weather warning, a mandi price move, a task due or an unread message."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((notice) => {
              const meta = KIND_META[notice.kind];
              const Icon = meta.icon;
              const isRead = read.includes(notice.id);
              const content = (
                <>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 ${isRead ? "opacity-60" : ""}`}>
                    <Icon className="h-4 w-4 text-brand-700" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold ${isRead ? "text-slate-500" : "text-forest"}`}>{notice.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{notice.body}</p>
                  </div>
                  <Chip tone={meta.tone}>{notice.kind}</Chip>
                </>
              );
              return (
                <li key={notice.id}>
                  {notice.to ? (
                    <Link to={notice.to} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="text-[10px] leading-relaxed text-slate-400">
        How these reach you is set in{" "}
        <Link to="/account/notifications" className="font-semibold text-brand-700 hover:underline">
          Notification Settings
        </Link>
        . Push alerts also need the browser's permission.
      </p>
    </FarmerShell>
  );
}

export { Select };
