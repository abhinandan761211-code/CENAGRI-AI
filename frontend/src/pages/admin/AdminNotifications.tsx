import { Megaphone, Send, XCircle } from "lucide-react";
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

type Campaign = {
  id: string;
  title: string;
  body: string;
  channel: string;
  audience_roles: string[];
  audience_states: string[];
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number | null;
  created_at: string;
};

const ROLES = ["Farmer", "Buyer", "Retailer", "Worker", "Transporter", "Equipment", "Warehouse", "Content Creator"];

/**
 * Notifications & announcements.
 *
 * Campaigns are created as drafts (or scheduled). Sending is a background job,
 * not a request — the panel never tries to fan out to a crore of users inside a
 * single HTTP call.
 */
export default function AdminNotifications() {
  const { can } = useAdmin();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useAdminData(
    () => adminFetch<Page<Campaign>>("/ops/campaigns", { query: { page, page_size: 25 } }),
    [page]
  );

  if (!can("notifications.view")) {
    return (
      <AdminLayout title="Notifications & announcements">
        <NoAccess module="announcements" />
      </AdminLayout>
    );
  }

  const columns: Column<Campaign>[] = [
    {
      key: "title",
      header: "Announcement",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-slate-800">{row.title}</p>
          <p className="line-clamp-1 text-[10.5px] text-slate-500">{row.body}</p>
        </div>
      ),
    },
    { key: "channel", header: "Channel", render: (row) => <Badge tone="sky">{row.channel}</Badge> },
    {
      key: "audience",
      header: "Audience",
      render: (row) => (
        <span className="text-[11px] text-slate-600">
          {row.audience_roles.length === 0 ? "Everyone" : row.audience_roles.join(", ")}
          {row.audience_states.length > 0 ? ` · ${row.audience_states.join(", ")}` : ""}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.status)}>{row.status}</Badge> },
    {
      key: "when",
      header: "When",
      render: (row) => (
        <span className="text-[11.5px]">
          {row.sent_at
            ? `sent ${new Date(row.sent_at).toLocaleDateString("en-IN")}`
            : row.scheduled_at
              ? `for ${new Date(row.scheduled_at).toLocaleString("en-IN")}`
              : "draft"}
        </span>
      ),
    },
  ];

  async function cancel(row: Campaign) {
    const reason = window.prompt("Reason for cancelling this announcement:", "");
    if (!reason || reason.trim().length < 3) return;
    try {
      await adminFetch(`/ops/campaigns/${row.id}/cancel`, { method: "POST", query: { reason: reason.trim() } });
      setNotice(`"${row.title}" cancelled.`);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not cancel.");
    }
  }

  return (
    <AdminLayout
      title="Notifications & announcements"
      subtitle="Targeted in-app announcements to accounts by role or state"
      badges={{ tickets: null }}
      action={
        can("notifications.manage") ? (
          <Button icon={Megaphone} onClick={() => setCreating(true)}>
            New announcement
          </Button>
        ) : undefined
      }
    >
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">{notice}</div>}
      {error && <ErrorNotice message={error} onRetry={reload} />}

      <Panel title="Campaigns" flush>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(row) => row.id}
              empty={<Empty icon={Megaphone} title="No announcements yet" description="Create one to reach a targeted group." />}
            />
            {(data?.rows.length ?? 0) > 0 && <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />}
          </>
        )}
      </Panel>

      {data?.rows.some((row) => row.status !== "sent" && row.status !== "cancelled") && (
        <Panel title="Cancel a draft or scheduled announcement">
          <div className="flex flex-wrap gap-2">
            {data.rows
              .filter((row) => row.status !== "sent" && row.status !== "cancelled")
              .map((row) => (
                <Button key={row.id} variant="ghost" icon={XCircle} onClick={() => void cancel(row)}>
                  {row.title}
                </Button>
              ))}
          </div>
        </Panel>
      )}

      {creating && (
        <ComposeDialog
          onClose={() => setCreating(false)}
          onDone={(text) => {
            setCreating(false);
            setNotice(text);
            reload();
          }}
        />
      )}
    </AdminLayout>
  );
}

function ComposeDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("in_app");
  const [roles, setRoles] = useState<string[]>([]);
  const [states, setStates] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = title.trim().length >= 3 && body.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await adminFetch("/ops/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          channel,
          audience_roles: roles,
          audience_states: states.split(",").map((s) => s.trim()).filter(Boolean),
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      onDone(`Announcement "${title.trim()}" saved as ${scheduledAt ? "scheduled" : "draft"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the announcement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title="New announcement"
      subtitle="Saved as a draft unless a schedule is set. Delivery is a background job."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={Send} disabled={!ready || busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save announcement"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={160} />
      </Field>
      <div className="mt-3">
        <Field label="Message">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={inputClass} maxLength={2000} />
        </Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClass}>
            <option value="in_app">In-app</option>
            <option value="email">Email</option>
            <option value="push">Push</option>
          </select>
        </Field>
        <Field label="Schedule (optional)" hint="Leave empty to keep as a draft.">
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Audience roles" hint="None selected = every account.">
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((role) => {
              const on = roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoles(on ? roles.filter((r) => r !== role) : [...roles, role])}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    on ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {role}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="States (comma separated)" hint="Leave empty for all regions.">
          <input value={states} onChange={(e) => setStates(e.target.value)} className={inputClass} placeholder="Chhattisgarh, Odisha" />
        </Field>
      </div>
    </Dialog>
  );
}
