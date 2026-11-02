import { Activity, Bot, Gauge, Timer } from "lucide-react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import { Badge, ErrorNotice, Loading, Num, Panel, StatCard } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

type AiStatus = {
  configured: boolean;
  provider: string;
  model: string | null;
  latency_ms: number | null;
  healthy: boolean | null;
  http_status: number | null;
  requests_recorded: number | null;
  last_request_at: string | null;
  checked_at: string;
};

/**
 * AI services.
 *
 * Shows whether a provider is configured and how fast it answers. The API key
 * never reaches this page — the backend reports `configured: true/false` only.
 */
export default function AdminAiServices() {
  const { can } = useAdmin();
  const { data, loading, error, reload } = useAdminData<AiStatus>(() => adminFetch<AiStatus>("/ops/ai/status"), []);

  if (!can("ai.view")) {
    return (
      <AdminLayout title="AI services">
        <NoAccess module="AI service management" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="AI services"
      subtitle="Provider health and usage for crop advisory"
      action={
        <button
          type="button"
          onClick={reload}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Activity className="h-3.5 w-3.5" />
          Re-check
        </button>
      }
    >
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Probing the AI provider…" />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Provider"
              value={data.configured ? "Configured" : "Not configured"}
              icon={Bot}
              tone={data.configured ? "green" : "amber"}
              hint={data.configured ? `${data.provider} · ${data.model ?? "model not set"}` : "Rule-based guidance is used instead"}
            />
            <StatCard
              label="Latency"
              value={data.latency_ms !== null ? `${data.latency_ms} ms` : "—"}
              icon={Timer}
              tone="sky"
              hint="Round trip to the provider's models endpoint"
            />
            <StatCard
              label="Health"
              value={data.healthy === null ? "Unknown" : data.healthy ? "Healthy" : "Unreachable"}
              icon={Activity}
              tone={data.healthy === null ? "neutral" : data.healthy ? "green" : "rose"}
              hint={data.http_status ? `HTTP ${data.http_status}` : "No probe ran"}
            />
            <StatCard
              label="Requests recorded"
              value={<Num value={data.requests_recorded} />}
              icon={Gauge}
              tone="violet"
              hint={data.last_request_at ? `Last ${new Date(data.last_request_at).toLocaleString("en-IN")}` : "No request log table"}
            />
          </div>

          <Panel title="What this panel can and cannot see">
            <ul className="space-y-1.5 text-[11.5px] text-slate-600">
              <li className="flex items-center gap-1.5">
                <Badge tone="green">visible</Badge>
                Provider, model name, latency, availability, error counts.
              </li>
              <li className="flex items-center gap-1.5">
                <Badge tone="rose">never shown</Badge>
                API keys, tokens and provider request bodies. These stay in the server environment.
              </li>
              <li className="flex items-center gap-1.5">
                <Badge tone="amber">limits</Badge>
                Rate limits and usage caps are configured server-side; changing them needs a deployment.
              </li>
            </ul>
            <p className="mt-3 text-[10.5px] text-slate-400">Checked {new Date(data.checked_at).toLocaleString("en-IN")}</p>
          </Panel>
        </>
      )}
    </AdminLayout>
  );
}
