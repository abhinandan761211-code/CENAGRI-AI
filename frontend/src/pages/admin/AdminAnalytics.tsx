import { Download, TrendingUp, Video, Users, ShoppingBag } from "lucide-react";
import { useState } from "react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Button,
  ErrorNotice,
  Field,
  Loading,
  Num,
  Panel,
  Sparkbars,
  StatCard,
  inputClass,
} from "@/components/admin/ui";
import { adminDownload, adminFetch } from "@/lib/admin/api";

type Analytics = {
  range: { start: string; end: string };
  users: { in_range: number | null; by_role: Record<string, number> | null; growth: { day: string; count: number }[] | null };
  content: { videos: number | null; shorts: number | null; comments: number | null; views_total: number | null };
  marketplace: { orders: number | null; sales_inr: number | null };
  note: string;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Analytics & reports with a date window and an authorised CSV export. */
export default function AdminAnalytics() {
  const { can } = useAdmin();
  const [start, setStart] = useState(iso(new Date(Date.now() - 30 * 86_400_000)));
  const [end, setEnd] = useState(iso(new Date()));
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useAdminData<Analytics>(
    () => adminFetch<Analytics>("/system/analytics", { query: { start, end } }),
    [start, end]
  );

  if (!can("analytics.view")) {
    return (
      <AdminLayout title="Analytics & reports">
        <NoAccess module="analytics" />
      </AdminLayout>
    );
  }

  async function exportCsv() {
    try {
      await adminDownload("/system/analytics/export", `cenagri-analytics-${start}_${end}.csv`, { start, end });
      setNotice("Export downloaded. The export is recorded in the audit log.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The export failed.");
    }
  }

  return (
    <AdminLayout
      title="Analytics & reports"
      subtitle="Verified counts from platform tables — no estimated figures are mixed in"
      action={
        can("analytics.export") ? (
          <Button variant="ghost" icon={Download} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        ) : undefined
      }
    >
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">{notice}</div>}

      <Panel title="Date range">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </Field>
          <Field label="To">
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </Field>
          <Button onClick={reload}>Refresh</Button>
          <Badge tone="neutral">
            {data ? `${data.range.start} → ${data.range.end}` : "…"}
          </Badge>
        </div>
      </Panel>

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Building the report…" />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Signups in range" value={<Num value={data.users.in_range} />} icon={Users} hint="Real registrations" />
            <StatCard label="Videos" value={<Num value={data.content.videos} />} icon={Video} tone="violet" hint={`${data.content.shorts ?? "—"} Shorts`} />
            <StatCard label="Video views" value={<Num value={data.content.views_total} />} icon={TrendingUp} tone="sky" hint="Recorded view events" />
            <StatCard
              label="Sales (₹)"
              value={data.marketplace.sales_inr === null ? "—" : `₹${Math.round(data.marketplace.sales_inr).toLocaleString("en-IN")}`}
              icon={ShoppingBag}
              tone="amber"
              hint={`${data.marketplace.orders ?? "—"} orders`}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Daily signups" description={`${data.range.start} → ${data.range.end}`}>
              {data.users.growth ? <Sparkbars points={data.users.growth} /> : <p className="py-8 text-center text-[11px] text-slate-400">No growth series available.</p>}
            </Panel>
            <Panel title="Signups by account type">
              {data.users.by_role && Object.keys(data.users.by_role).length > 0 ? (
                <ul className="space-y-1.5">
                  {Object.entries(data.users.by_role)
                    .sort((a, b) => b[1] - a[1])
                    .map(([role, count]) => (
                      <li key={role} className="flex items-center justify-between text-[11.5px]">
                        <span className="text-slate-600">{role}</span>
                        <span className="font-semibold text-slate-800">{count.toLocaleString("en-IN")}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-[11px] text-slate-400">No signups in this window.</p>
              )}
            </Panel>
          </div>

          <p className="text-[10.5px] leading-relaxed text-slate-400">{data.note}</p>
        </>
      )}
    </AdminLayout>
  );
}
