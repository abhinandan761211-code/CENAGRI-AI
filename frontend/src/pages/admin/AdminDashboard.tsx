import {
  Activity,
  AlertTriangle,
  Bot,
  Database,
  Eye,
  FileText,
  Headphones,
  Package,
  ShoppingBag,
  Sprout,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Empty,
  ErrorNotice,
  Loading,
  Num,
  Panel,
  Sparkbars,
  StatCard,
  toneFor,
} from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";
import type { DashboardData } from "@/lib/admin/api";

/**
 * The central overview.
 *
 * Every figure comes from `/admin/dashboard` — real counts over real tables.
 * A `null` renders as an em dash, never as zero, because "this table is not
 * installed" and "there are no users" are different facts and an administrator
 * must be able to tell them apart.
 */
export default function AdminDashboard() {
  const { can } = useAdmin();
  const { data, loading, error, reload } = useAdminData<DashboardData>(
    () => adminFetch<DashboardData>("/dashboard", { query: { days: 30 } }),
    []
  );

  const accounts: { key: string; label: string; icon: typeof Users }[] = [
    { key: "farmers", label: "Farmers", icon: Sprout },
    { key: "buyers", label: "Buyers", icon: ShoppingBag },
    { key: "retailers", label: "Retailers", icon: Package },
    { key: "workers", label: "Workers", icon: Users },
    { key: "transporters", label: "Transporters", icon: Package },
    { key: "equipment_owners", label: "Equipment owners", icon: Package },
    { key: "warehouse_owners", label: "Warehouse owners", icon: Package },
    { key: "content_creators", label: "Content creators", icon: Video },
  ];

  const totalAccounts = data ? Object.values(data.accounts).reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;

  return (
    <AdminLayout
      title="Platform overview"
      subtitle={
        data
          ? `Live snapshot · generated ${new Date(data.generated_at).toLocaleString("en-IN")}`
          : "Loading the platform snapshot…"
      }
      action={
        <div className="flex gap-2">
          <Link
            to="/admin/analytics"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Analytics
          </Link>
          {can("users.view") && (
            <Link
              to="/admin/users"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Users className="h-3.5 w-3.5" />
              Manage users
            </Link>
          )}
        </div>
      }
      badges={{
        kyc: data?.queues.pending_kyc,
        reports: data?.queues.pending_reports,
        tickets: data?.queues.open_tickets,
      }}
    >
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Reading platform tables…" />}

      {data && (
        <>
          {/* ── Headline numbers ── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Registered users"
              value={<Num value={data.users.total} />}
              icon={Users}
              hint={`${data.users.new_30d ?? "—"} new in the last 30 days`}
            />
            <StatCard
              label="Active accounts"
              value={<Num value={data.users.active} />}
              icon={UserCheck}
              tone="green"
              hint={
                data.users.suspended !== null || data.users.blocked !== null
                  ? `${data.users.suspended ?? 0} suspended · ${data.users.blocked ?? 0} blocked`
                  : "Status counters unavailable"
              }
            />
            <StatCard
              label="Daily active users"
              value={<Num value={data.users.dau} />}
              icon={Activity}
              tone="sky"
              hint={data.users.dau === null ? "Activity tracking not enabled" : "Seen in the last 24 hours"}
            />
            <StatCard
              label="Monthly active users"
              value={<Num value={data.users.mau} />}
              icon={TrendingUp}
              tone="violet"
              hint={data.users.mau === null ? "Activity tracking not enabled" : "Seen in the last 30 days"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="New registrations" value={<Num value={data.users.new_30d} />} icon={UserPlus} tone="green" hint="Last 30 days" />
            <StatCard label="Videos" value={<Num value={data.content.videos} />} icon={Video} tone="violet" hint={`${data.content.shorts ?? "—"} Shorts · ${data.content.published_videos ?? "—"} published`} />
            <StatCard label="Posts" value={<Num value={data.content.posts} />} icon={FileText} tone="sky" hint="Community and creator posts" />
            <StatCard label="Video views" value={<Num value={data.content.views_30d} />} icon={Eye} tone="green" hint="Last 30 days" />
            <StatCard label="Products" value={<Num value={data.marketplace.products} />} icon={Package} tone="amber" hint="Marketplace + shop listings" />
            <StatCard label="Orders" value={<Num value={data.marketplace.orders} />} icon={ShoppingBag} tone="violet" hint="All order sources" />
            <StatCard label="Pending KYC" value={<Num value={data.queues.pending_kyc} />} icon={UserCheck} tone="amber" hint="Waiting for a reviewer" />
            <StatCard label="Pending reports" value={<Num value={data.queues.pending_reports} />} icon={AlertTriangle} tone="rose" hint="Content reports and tickets" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {/* ── Growth ── */}
            <div className="lg:col-span-2">
              <Panel title="User growth" description="New registrations per day, last 30 days" flush>
                <div className="p-4">
                  {data.growth === null ? (
                    <p className="py-6 text-center text-[11px] text-slate-400">
                      The profiles table is not readable — run the admin migration.
                    </p>
                  ) : (
                    <Sparkbars points={data.growth} />
                  )}
                </div>
              </Panel>
            </div>

            {/* ── Account mix ── */}
            <Panel title="Account types" description="Distribution across the platform">
              {totalAccounts === null || totalAccounts === 0 ? (
                <p className="py-6 text-center text-[11px] text-slate-400">No accounts yet.</p>
              ) : (
                <ul className="space-y-2">
                  {accounts.map(({ key, label, icon: Icon }) => {
                    const value = data.accounts[key];
                    const pct = value && totalAccounts ? Math.round((value / totalAccounts) * 100) : 0;
                    return (
                      <li key={key}>
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Icon className="h-3.5 w-3.5 text-slate-400" />
                            {label}
                          </span>
                          <span className="font-semibold text-slate-800">
                            <Num value={value} />
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {/* ── Pending admin tasks ── */}
            <Panel title="Pending admin tasks" description="Queues that need a decision">
              <ul className="space-y-2">
                {[
                  { label: "KYC requests", value: data.queues.pending_kyc, to: "/admin/kyc", icon: UserCheck },
                  { label: "Content reports", value: data.queues.pending_reports, to: "/admin/content", icon: AlertTriangle },
                  { label: "Support tickets", value: data.queues.open_tickets, to: "/admin/support", icon: Headphones },
                  { label: "Deletion requests", value: data.queues.pending_deletions, to: "/admin/users", icon: Users },
                ].map(({ label, value, to, icon: Icon }) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-[11.5px] hover:border-slate-200 hover:bg-slate-50"
                    >
                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                      <span className="flex-1 text-slate-600">{label}</span>
                      <span className="font-bold text-slate-800">
                        <Num value={value} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>

            {/* ── Service health ── */}
            <Panel title="API service health" description="Integration configuration">
              <ul className="space-y-2">
                <li className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
                    <Database className="h-3.5 w-3.5 text-slate-400" />
                    Mandi feed · {data.services.mandi.source}
                  </span>
                  <Badge tone={data.services.mandi.configured ? "green" : "amber"}>
                    {data.services.mandi.configured ? "configured" : "no key"}
                  </Badge>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
                    <Bot className="h-3.5 w-3.5 text-slate-400" />
                    AI advisory
                  </span>
                  <Badge tone={data.services.ai.configured ? "green" : "amber"}>
                    {data.services.ai.configured ? "configured" : "rule-based"}
                  </Badge>
                </li>
              </ul>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                Configuration state only. Credentials never leave the server.
              </p>
            </Panel>

            {/* ── Recent activity ── */}
            <Panel title="Recent activity" description="Admin actions and new accounts">
              {data.activity.length === 0 ? (
                <Empty icon={Activity} title="Nothing yet" description="Admin actions and signups appear here." />
              ) : (
                <ul className="space-y-2">
                  {data.activity.slice(0, 7).map((item, index) => (
                    <li key={`${item.at}-${index}`} className="flex items-start gap-2">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${item.kind === "admin" ? "bg-emerald-500" : "bg-sky-400"
                          }`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-medium text-slate-700">{item.title}</p>
                        <p className="truncate text-[10px] text-slate-400">
                          {item.detail ? `${item.detail} · ` : ""}
                          {item.at ? new Date(item.at).toLocaleString("en-IN") : ""}
                        </p>
                      </div>
                      <Badge tone={toneFor(item.kind === "admin" ? "pending" : "active")}>{item.kind}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
