import { useCallback, useState } from "react";
import {
  Download,
  Filter,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
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
import { adminDownload, adminFetch } from "@/lib/admin/api";
import type { AdminUser, Page } from "@/lib/admin/api";

/**
 * User management.
 *
 * Suspending, blocking or reactivating is a *confirmed* action: the dialog asks
 * for the account's email to be typed, and a reason. That pair is forwarded to
 * the API, which re-checks the email against the record before writing — an
 * approved click in a stale tab still cannot hit the wrong account.
 */

const ROLE_OPTIONS = [
  "Farmer",
  "Buyer",
  "Retailer",
  "Shop",
  "Worker",
  "Equipment",
  "Transporter",
  "Warehouse",
  "Content Creator",
];

const STATUS_OPTIONS = ["active", "pending", "suspended", "blocked"];

type Filters = {
  q: string;
  role: string;
  status: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { q: "", role: "", status: "", from: "", to: "" };

export default function AdminUsers() {
  const { can, me } = useAdmin();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const loader = useCallback(
    () =>
      adminFetch<Page<AdminUser>>("/users", {
        query: {
          page,
          page_size: pageSize,
          q: filters.q || undefined,
          role: filters.role || undefined,
          status: filters.status || undefined,
          created_from: filters.from || undefined,
          created_to: filters.to || undefined,
        },
      }),
    [page, filters]
  );
  const { data, loading, error, reload } = useAdminData(loader, [loader]);

  function applyFilters() {
    setFilters(draft);
    setPage(1);
  }

  async function exportCsv() {
    try {
      setNotice(null);
      await adminDownload("/users/export", "kalika-users.csv", {
        q: filters.q || undefined,
        role: filters.role || undefined,
        status: filters.status || undefined,
      });
      setNotice({ tone: "ok", text: "Export downloaded. The action was recorded in the audit log." });
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : "Export failed." });
    }
  }

  const columns: Column<AdminUser>[] = [
    {
      key: "name",
      header: "Account",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-slate-800">{row.full_name ?? "Unnamed account"}</p>
          <p className="truncate text-[11px] text-slate-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Type",
      render: (row) => (row.role ? <Badge tone="sky">{row.role}</Badge> : <span className="text-slate-400">—</span>),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={toneFor(row.account_status)}>{row.account_status}</Badge>,
    },
    {
      key: "location",
      header: "Region",
      render: (row) => (
        <span className="text-[11.5px] text-slate-600">
          {[row.location.district, row.location.state].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Joined",
      render: (row) => (
        <span className="text-[11.5px] text-slate-600">
          {row.created_at ? new Date(row.created_at).toLocaleDateString("en-IN") : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setSelected(row)}>
            View
          </Button>
          {can("users.moderate") && (
            <Button
              variant={row.account_status === "active" ? "ghost" : "subtle"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setActionUser(row)}
            >
              {row.account_status === "active" ? "Suspend" : "Reactivate"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="User management"
      subtitle="Every account on the platform, with its status and region"
      action={
        <div className="flex gap-2">
          {can("users.export") && (
            <Button variant="ghost" icon={Download} onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          )}
          <Button variant="subtle" icon={Filter} onClick={() => setDraft(EMPTY_FILTERS)}>
            Reset filters
          </Button>
        </div>
      }
    >
      {notice && (
        <div
          className={`rounded-lg border px-3 py-2 text-[11.5px] font-medium ${
            notice.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {notice.text}
        </div>
      )}

      <Panel title="Filters" description="Search by name, email or phone; narrow by type, status and join date">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={draft.q}
                onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="Name, email or phone"
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>
          <Field label="Account type">
            <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={inputClass}>
              <option value="">All types</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={inputClass}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </Field>
          <Field label="Registered from">
            <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Registered to">
            <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputClass} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={applyFilters}>Apply filters</Button>
        </div>
      </Panel>

      {error && <ErrorNotice message={error} onRetry={reload} />}

      <Panel
        title="Accounts"
        description={data ? `${data.total?.toLocaleString("en-IN") ?? "—"} matching accounts` : "Loading…"}
        flush
      >
        {loading && !data ? (
          <Loading label="Loading accounts…" />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(row) => row.id}
              onRowClick={setSelected}
              empty={
                <Empty
                  icon={Users}
                  title="No accounts match"
                  description="Adjust the filters, or clear them to see every account."
                  action={<Button variant="ghost" onClick={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); }}>Clear filters</Button>}
                />
              }
            />
            {(data?.rows.length ?? 0) > 0 && (
              <Pager page={page} pageSize={pageSize} total={data?.total ?? null} onPage={setPage} />
            )}
          </>
        )}
      </Panel>

      <ProfileDrawer user={selected} onClose={() => setSelected(null)} onChanged={reload} />

      {actionUser && (
        <StatusDialog
          user={actionUser}
          onClose={() => setActionUser(null)}
          onDone={(text) => {
            setActionUser(null);
            setNotice({ tone: "ok", text });
            reload();
          }}
        />
      )}

      <p className="text-[10.5px] leading-relaxed text-slate-400">
        Signed in as {me?.email} · {me?.role_label}. Accounts are never hard-deleted from this panel; use the
        controlled deletion workflow instead.
      </p>
    </AdminLayout>
  );
}

// ── profile drawer ────────────────────────────────────────────────────────

function ProfileDrawer({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  if (!user) return null;
  return (
    <Dialog open title={user.full_name ?? "Account"} subtitle={user.email ?? "No email on file"} onClose={onClose} wide>
      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <Item label="Account type" value={user.role ?? "—"} />
        <Item label="Status" value={<Badge tone={toneFor(user.account_status)}>{user.account_status}</Badge>} />
        <Item label="Phone" value={user.phone ?? "—"} />
        <Item label="Joined" value={user.created_at ? new Date(user.created_at).toLocaleString("en-IN") : "—"} />
        <Item label="Last active" value={user.last_active_at ? new Date(user.last_active_at).toLocaleString("en-IN") : "Not tracked"} />
        <Item label="Region" value={[user.location.district, user.location.state].filter(Boolean).join(", ") || "—"} />
      </dl>
      {user.status_reason && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <span className="font-semibold">Last status note:</span> {user.status_reason}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={() => { onClose(); onChanged(); }}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{value}</dd>
    </div>
  );
}

// ── status change with typed confirmation ─────────────────────────────────

function StatusDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const isRestoring = user.account_status !== "active";
  const [status, setStatus] = useState<"active" | "suspended" | "blocked">(isRestoring ? "active" : "suspended");
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = reason.trim().length >= 3 && confirmEmail.trim().toLowerCase() === (user.email ?? "").toLowerCase();

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/users/${user.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, reason: reason.trim(), confirm_email: confirmEmail.trim() }),
      });
      onDone(`Account ${user.email} is now ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change was not applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={isRestoring ? "Reactivate account" : "Restrict account"}
      subtitle="This writes an audit entry with you, the reason and the previous status."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={status === "active" ? "primary" : "danger"}
            icon={status === "active" ? UserCheck : ShieldAlert}
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Applying…" : status === "active" ? "Reactivate" : `Set ${status}`}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}

      <Field label="New status">
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputClass}>
          <option value="active">active — full access</option>
          <option value="suspended">suspended — temporary lock</option>
          <option value="blocked">blocked — policy violation</option>
        </select>
      </Field>

      <div className="mt-3">
        <Field label="Reason" hint="Shown to the account holder and stored in the audit log.">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className={inputClass}
            placeholder="e.g. Repeated spam in marketplace listings"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field
          label="Type the account email to confirm"
          hint={`Expected: ${user.email ?? "—"}`}
          error={confirmEmail && !ready ? "The email does not match." : undefined}
        >
          <input
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
      </div>
    </Dialog>
  );
}
