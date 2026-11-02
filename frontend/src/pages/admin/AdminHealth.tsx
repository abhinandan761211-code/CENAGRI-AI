import { Activity, Database, HardDrive, RefreshCw, Server, ShieldCheck } from "lucide-react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import { Badge, Button, ErrorNotice, Loading, NotAvailable, Panel, StatCard } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

type Health = {
  checked_at: string;
  checks: {
    database: { ok: boolean; latency_ms?: number; error?: string };
    admin_tables: { ok: boolean; error?: string };
  };
  integrations: {
    mandi: { configured: boolean };
    ai: { configured: boolean };
    storage: { configured: boolean };
  };
  settings: {
    mfa_required: boolean;
    session_max_minutes: number;
    rate_limit_per_minute: number;
    environment: string;
  };
  backup: { status: string; note: string };
};

/** System health: one read-only page an on-call admin can check first. */
export default function AdminHealth() {
  const { can } = useAdmin();
  const { data, loading, error, reload } = useAdminData<Health>(() => adminFetch<Health>("/system/health"), []);

  if (!can("system.health")) {
    return (
      <AdminLayout title="System health">
        <NoAccess module="system health" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="System health"
      subtitle={data ? `Checked ${new Date(data.checked_at).toLocaleString("en-IN")}` : "Checking services…"}
      action={
        <Button variant="ghost" icon={RefreshCw} onClick={reload}>
          Re-check
        </Button>
      }
    >
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Probing services…" />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Database"
              value={data.checks.database.ok ? "Reachable" : "Failing"}
              icon={Database}
              tone={data.checks.database.ok ? "green" : "rose"}
              hint={data.checks.database.latency_ms !== undefined ? `${data.checks.database.latency_ms} ms` : data.checks.database.error}
            />
            <StatCard
              label="Admin tables"
              value={data.checks.admin_tables.ok ? "Installed" : "Missing"}
              icon={HardDrive}
              tone={data.checks.admin_tables.ok ? "green" : "rose"}
              hint={data.checks.admin_tables.ok ? "admin.sql applied" : data.checks.admin_tables.error}
            />
            <StatCard
              label="API rate limit"
              value={`${data.settings.rate_limit_per_minute}/min`}
              icon={Activity}
              tone="sky"
              hint={`Session max ${data.settings.session_max_minutes} min`}
            />
            <StatCard
              label="Admin MFA"
              value={data.settings.mfa_required ? "Required" : "Optional"}
              icon={ShieldCheck}
              tone={data.settings.mfa_required ? "green" : "amber"}
              hint="Server-side policy"
            />
          </div>

          <Panel title="Integrations" description="Configuration only — credentials are never returned">
            <ul className="grid gap-2 sm:grid-cols-3">
              {Object.entries(data.integrations).map(([name, state]) => (
                <li key={name} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="text-[12px] capitalize text-slate-700">{name}</span>
                  <Badge tone={state.configured ? "green" : "amber"}>{state.configured ? "configured" : "not set"}</Badge>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Operational notes">
            <ul className="space-y-2 text-[11.5px] text-slate-600">
              <li className="flex items-start gap-2">
                <Server className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                Environment: <code className="text-slate-800">{data.settings.environment}</code>
              </li>
              <li className="flex items-start gap-2">
                <HardDrive className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                Backups: {data.backup.note}
              </li>
            </ul>
            {!data.checks.admin_tables.ok && (
              <div className="mt-3">
                <NotAvailable what="The admin schema" />
              </div>
            )}
            <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
              This page reports what the API can prove. It does not guess at infrastructure it cannot reach, such as the
              database provider's backup status.
            </p>
          </Panel>
        </>
      )}
    </AdminLayout>
  );
}
