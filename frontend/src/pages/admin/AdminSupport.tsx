import { Headphones, MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  inputClass,
  Loading,
  Pager,
  Panel,
  toneFor,
} from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";
import type { Page } from "@/lib/admin/api";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  contact_email: string | null;
  assigned_to: string | null;
  created_at: string;
};

type TicketDetail = {
  ticket: Ticket & { user?: { full_name: string | null; email: string | null; role: string | null } | null; resolution: string | null };
  messages: { id: string; author_kind: string; body: string; is_internal: boolean; created_at: string }[];
};

const STATUSES = ["open", "in_progress", "waiting_user", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

/** Support & complaints: queue, detail, replies and internal notes. */
export default function AdminSupport() {
  const { can } = useAdmin();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Ticket | null>(null);

  const { data, loading, error, reload } = useAdminData(
    () =>
      adminFetch<Page<Ticket>>("/ops/support/tickets", {
        query: { page, page_size: 25, status: status || undefined, priority: priority || undefined },
      }),
    [page, status, priority]
  );

  if (!can("support.view")) {
    return (
      <AdminLayout title="Support & complaints">
        <NoAccess module="support tickets" />
      </AdminLayout>
    );
  }

  const columns: Column<Ticket>[] = [
    {
      key: "subject",
      header: "Ticket",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-slate-800">{row.subject}</p>
          <p className="text-[10.5px] text-slate-500">{row.contact_email ?? "No contact email"}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (row) => <Badge tone="sky">{row.category}</Badge> },
    { key: "priority", header: "Priority", render: (row) => <Badge tone={toneFor(row.priority === "urgent" ? "urgent" : row.priority)}>{row.priority}</Badge> },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.status)}>{row.status.replace("_", " ")}</Badge> },
    {
      key: "created",
      header: "Opened",
      render: (row) => <span className="text-[11.5px]">{new Date(row.created_at).toLocaleDateString("en-IN")}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setOpen(row)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <AdminLayout title="Support & complaints" subtitle="Tickets from users, with assignment, replies and resolution notes">
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status">
            <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className={inputClass}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => { setPage(1); setPriority(e.target.value); }} className={inputClass}>
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>

      {error && <ErrorNotice message={error} onRetry={reload} />}

      <Panel title="Tickets" description={data ? `${data.total ?? "—"} matching` : "Loading…"} flush>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(row) => row.id}
              onRowClick={setOpen}
              empty={<Empty icon={Headphones} title="No tickets" description="Nothing is waiting in this queue." />}
            />
            {(data?.rows.length ?? 0) > 0 && <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />}
          </>
        )}
      </Panel>

      {open && (
        <TicketDialog
          ticket={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </AdminLayout>
  );
}

function TicketDialog({ ticket, onClose, onChanged }: { ticket: Ticket; onClose: () => void; onChanged: () => void }) {
  const { can } = useAdmin();
  const { data, loading, error, reload } = useAdminData<TicketDetail>(
    () => adminFetch<TicketDetail>(`/ops/support/tickets/${ticket.id}`),
    [ticket.id]
  );
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setSendError(null);
    try {
      await adminFetch(`/ops/support/tickets/${ticket.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), is_internal: internal }),
      });
      setBody("");
      setInternal(false);
      reload();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The message was not sent.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(next: string) {
    setBusy(true);
    try {
      await adminFetch(`/ops/support/tickets/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      onChanged();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title={ticket.subject} subtitle={`${ticket.category} · ${ticket.priority}`} onClose={onClose} wide>
      {error && <div className="mb-3"><ErrorNotice message={error} onRetry={reload} /></div>}
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={toneFor(data.ticket.status)}>{data.ticket.status.replace("_", " ")}</Badge>
              {data.ticket.user && (
                <span className="text-[11.5px] text-slate-600">
                  {data.ticket.user.full_name ?? data.ticket.user.email} · {data.ticket.user.role}
                </span>
              )}
            </div>

            <ul className="mb-4 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
              {data.messages.length === 0 && <li className="text-center text-[11px] text-slate-400">No messages yet.</li>}
              {data.messages.map((message) => (
                <li
                  key={message.id}
                  className={`rounded-lg px-3 py-2 text-[12px] ${message.is_internal
                      ? "border border-amber-200 bg-amber-50 text-amber-900"
                      : message.author_kind === "admin"
                        ? "bg-emerald-50 text-emerald-900"
                        : "bg-white text-slate-700"
                    }`}
                >
                  <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
                    <MessageSquare className="h-3 w-3" />
                    {message.author_kind}
                    {message.is_internal && " · internal note"}
                    <span className="ml-auto font-normal normal-case">{new Date(message.created_at).toLocaleString("en-IN")}</span>
                  </p>
                  {message.body}
                </li>
              ))}
            </ul>

            {can("support.manage") && (
              <>
                <Field label="Reply">
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={inputClass} maxLength={4000} />
                </Field>
                {sendError && <p className="mt-1 text-[11px] text-rose-600">{sendError}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-3.5 w-3.5" />
                    Internal note (never shown to the user)
                  </label>
                  <div className="ml-auto flex gap-2">
                    <select onChange={(e) => e.target.value && void setStatus(e.target.value)} defaultValue="" className={`${inputClass} h-9 w-auto py-0 text-[11.5px]`}>
                      <option value="">Set status…</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                    <Button icon={Send} disabled={busy || !body.trim()} onClick={() => void send()}>
                      {busy ? "Sending…" : internal ? "Save note" : "Send reply"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )
      )}
    </Dialog>
  );
}
