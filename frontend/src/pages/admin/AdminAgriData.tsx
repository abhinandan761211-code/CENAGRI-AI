import { Cloud, Database, RefreshCw, Wheat } from "lucide-react";
import { useState } from "react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  NotAvailable,
  Num,
  Panel,
  StatCard,
  inputClass,
} from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

/**
 * Mandi data management.
 *
 * Honest by construction: the app fetches mandi prices live and caches them in
 * memory — it does not keep a historical table. This screen therefore reports
 * configuration and the *live* provider response, and says plainly that no
 * stored copy exists. An admin should never mistake an empty table for "the
 * government published nothing".
 */

type MandiStatus = {
  configured: boolean;
  source: string;
  base_url: string;
  storage: { table: string; available: boolean; rows: number | null; last_at: string | null };
  note: string | null;
  generated_at: string;
};

type MandiRow = {
  commodity?: string;
  district?: string;
  market?: string;
  state?: string;
  modal_price?: number | string;
  min_price?: number | string;
  max_price?: number | string;
};

export default function AdminAgriData() {
  const { can } = useAdmin();
  const [query, setQuery] = useState("");
  const [sample, setSample] = useState<MandiRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const status = useAdminData<MandiStatus>(() => adminFetch<MandiStatus>("/agri/mandi/status"), []);

  if (!can("agri_data.view")) {
    return (
      <AdminLayout title="Mandi data">
        <NoAccess module="agricultural data" />
      </AdminLayout>
    );
  }

  async function fetchSample() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await adminFetch<{ rows: MandiRow[] }>("/agri/mandi/sample", { query: { query, limit: 15 } });
      setSample(res.rows ?? []);
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : "The provider request failed." });
      setSample(null);
    } finally {
      setBusy(false);
    }
  }

  async function clearCache() {
    setBusy(true);
    try {
      await adminFetch("/agri/mandi/cache/clear", { method: "POST" });
      setNotice({ tone: "ok", text: "Cache cleared. The next app request fetches fresh prices." });
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : "Could not clear the cache." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      title="Mandi data"
      subtitle="Government price feed: configuration, live check and storage state"
      action={
        can("agri_data.manage") ? (
          <Button variant="ghost" icon={RefreshCw} onClick={() => void clearCache()} disabled={busy}>
            Clear cache
          </Button>
        ) : undefined
      }
    >
      {notice && (
        <div
          className={`rounded-lg border px-3 py-2 text-[11.5px] ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
        >
          {notice.text}
        </div>
      )}

      {status.error && <ErrorNotice message={status.error} onRetry={status.reload} />}
      {status.loading && !status.data && <Loading />}

      {status.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Provider"
              value={status.data.source}
              icon={Database}
              hint={status.data.base_url}
            />
            <StatCard
              label="API key"
              value={status.data.configured ? "Configured" : "Missing"}
              icon={Database}
              tone={status.data.configured ? "green" : "rose"}
              hint="Read from the server environment"
            />
            <StatCard
              label="Stored price rows"
              value={<Num value={status.data.storage.rows} />}
              icon={Database}
              tone="amber"
              hint={status.data.storage.available ? "Persisted in mandi_prices" : "No stored copy"}
            />
            <StatCard
              label="Last stored update"
              value={
                status.data.storage.last_at ? new Date(status.data.storage.last_at).toLocaleString("en-IN") : "—"
              }
              icon={RefreshCw}
              tone="violet"
              hint="Falls back to the live cache"
            />
          </div>

          {status.data.note && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
              {status.data.note}
            </div>
          )}

          <Panel title="Live provider check" description="Fetched through the same service the farmer screens use">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Commodity or district
                </label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void fetchSample()}
                  placeholder="e.g. tomato, Raipur"
                  className={inputClass}
                />
              </div>
              <Button icon={RefreshCw} onClick={() => void fetchSample()} disabled={busy || !status.data.configured}>
                {busy ? "Fetching…" : "Fetch sample"}
              </Button>
            </div>

            <div className="mt-4">
              {!status.data.configured ? (
                <NotAvailable what="The data.gov.in feed" />
              ) : sample === null ? (
                <p className="py-6 text-center text-[11px] text-slate-400">
                  Fetch a sample to confirm the provider is answering.
                </p>
              ) : sample.length === 0 ? (
                <Empty icon={Wheat} title="No rows returned" description="Try a broader commodity or district name." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Commodity</th>
                        <th className="py-2 pr-3">Market</th>
                        <th className="py-2 pr-3">District</th>
                        <th className="py-2 pr-3">Min</th>
                        <th className="py-2 pr-3">Max</th>
                        <th className="py-2">Modal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sample.map((row, index) => (
                        <tr key={`${row.commodity}-${row.market}-${index}`} className="border-b border-slate-100 text-[12px]">
                          <td className="py-1.5 pr-3 font-medium">{String(row.commodity ?? "—")}</td>
                          <td className="py-1.5 pr-3">{String(row.market ?? "—")}</td>
                          <td className="py-1.5 pr-3">{String(row.district ?? "—")}</td>
                          <td className="py-1.5 pr-3">{String(row.min_price ?? "—")}</td>
                          <td className="py-1.5 pr-3">{String(row.max_price ?? "—")}</td>
                          <td className="py-1.5 font-semibold">{String(row.modal_price ?? "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Panel>

          <p className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
            <Cloud className="mr-1 inline h-3 w-3" />
            Official figures are never edited by hand. Any stored copy keeps its source and fetched_at timestamp.
            <Badge tone="neutral">read-only feed</Badge>
          </p>
        </>
      )}
    </AdminLayout>
  );
}
