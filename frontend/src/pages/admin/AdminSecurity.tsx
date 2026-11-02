import { ScrollText, ShieldAlert } from "lucide-react";
import { useState } from "react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  DataTable,
  Empty,
  ErrorNotice,
  Field,
  inputClass,
  Loading,
  Pager,
  Panel,
} from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";
import type { Page } from "@/lib/admin/api";

type AuditRow = {
  id: number;
  admin_email: string | null;
  admin_role: string | null;
  action: string;
  module: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

const MODULES = [
  "users",
  "roles",
  "kyc",
  "content",
  "video_hub",
  "creators",
  "marketplace",
  "orders",
  "finance",
  "cenfriend",
  "agri_data",
  "settings",
  "cms",
  "notifications",
  "support",
  "analytics",
];

/**
 * Security & audit logs.
 *
 * Read-only by construction: there is no API route that edits or deletes an
 * audit row. An auditor can filter by module, action and date, and see the
 * before/after snapshot the backend recorded (already sanitised of secrets).
 */
export default function AdminSecurity() {
  const { can } = useAdmin();
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAdminData(
    () =>
      adminFetch<Page<AuditRow>>("/system/audit", {
        query: { page, page_size: 25, module: module || undefined, action: action || undefined, since: since || undefined },
      }),
    [page, module, action, since]
  );

  if (!can("security.audit")) {
    return (
      <AdminLayout title="Security & audit">
        <NoAccess module="the audit trail" />
      </AdminLayout>
    );
  }

  const columns: Column<AuditRow>[] = [
    {
      key: "when",
      header: "When",
      render: (row) => <span className="whitespace-nowrap text-[11px]">{new Date(row.created_at).toLocaleString("en-IN")}</span>,
    },
    {
      key: "admin",
      header: "Admin",
      render: (row) => (
        <div>
          <p className="text-[11.5px] font-semibold text-slate-800">{row.admin_email ?? "—"}</p>
          <p className="text-[10px] text-slate-500">{row.admin_role ?? ""}</p>
        </div>
      ),
    },
    { key: "action", header: "Action", render: (row) => <code className="text-[11px] text-slate-700">{row.action}</code> },
    { key: "module", header: "Module", render: (row) => <Badge tone="sky">{row.module}</Badge> },
    {
      key: "target",
      header: "Target",
      render: (row) => (
        <span className="text-[10.5px] text-slate-600">
          {row.target_type ?? "—"}
          {row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ""}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => <span className="line-clamp-2 max-w-[240px] text-[11px] text-slate-600">{row.reason ?? "—"}</span>,
    },
    {
      key: "change",
      header: "Change",
      render: (row) =>
        row.before_state || row.after_state ? (
          <details className="text-[10.5px]">
            <summary className="cursor-pointer font-semibold text-emerald-700">view</summary>
            <pre className="mt-1 max-w-[280px] whitespace-pre-wrap rounded bg-slate-50 p-1.5 text-[10px] text-slate-600">
              {JSON.stringify({ before: row.before_state, after: row.after_state }, null, 1)}
            </pre>
          </details>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  return (
    <AdminLayout title="Security & audit" subtitle="Append-only record of every consequential admin action">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Module">
            <select value={module} onChange={(e) => { setPage(1); setModule(e.target.value); }} className={inputClass}>
              <option value="">All modules</option>
              {MODULES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Action contains">
            <input value={action} onChange={(e) => setAction(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setPage(1)} className={inputClass} placeholder="e.g. users.status" />
          </Field>
          <Field label="Since">
            <input type="date" value={since} onChange={(e) => { setPage(1); setSince(e.target.value); }} className={inputClass} />
          </Field>
        </div>
      </Panel>

      {error && <ErrorNotice message={error} onRetry={reload} />}

      <Panel title="Audit trail" description={data ? `${data.total ?? "—"} entries` : "Loading…"} flush>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(row) => String(row.id)}
              empty={<Empty icon={ScrollText} title="No audit entries" description="Actions will appear here as they happen." />}
            />
            {(data?.rows.length ?? 0) > 0 && <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />}
          </>
        )}
      </Panel>

      <p className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
        <ShieldAlert className="h-3 w-3" />
        Audit rows cannot be edited or deleted from the panel. Secrets and identity documents are stripped before storage.
      </p>
    </AdminLayout>
  );
}
