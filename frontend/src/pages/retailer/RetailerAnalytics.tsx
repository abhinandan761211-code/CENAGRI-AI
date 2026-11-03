import { useMemo, useState } from "react";
import { ChartNoAxesCombined, IndianRupee, ShoppingCart, TrendingUp } from "lucide-react";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  PRODUCT_CATEGORIES,
  formatINR,
  formatQty,
  listOrders,
  listProducts,
  orderProfit,
  salesByCategory,
  salesSeries,
  topProducts,
} from "@/lib/retailer";
import type { Period, RetailerOrder, RetailerProduct, SalesPoint } from "@/lib/retailer";

const PERIODS: { key: Period; label: string; buckets: number; hint: string }[] = [
  { key: "day", label: "Daily", buckets: 14, hint: "Last 14 days" },
  { key: "week", label: "Weekly", buckets: 8, hint: "Last 8 weeks" },
  { key: "month", label: "Monthly", buckets: 6, hint: "Last 6 months" },
];

/**
 * Sales Analytics — daily, weekly and monthly sales and profit reports.
 *
 * Everything is computed from the retailer's own orders in the selected
 * window. The chart is a hand-rolled SVG so the module adds no dependency.
 */
export default function RetailerAnalytics() {
  const orders = useRetailerData<RetailerOrder[]>(() => listOrders(180), []);
  const products = useRetailerData<RetailerProduct[]>(() => listProducts(), []);

  const [period, setPeriod] = useState<Period>("day");

  const orderList = orders.data ?? [];
  const productList = products.data ?? [];
  const loading = orders.state === "loading" || products.state === "loading";
  const failed = orders.state === "error" ? orders : products.state === "error" ? products : null;

  const config = PERIODS.find((p) => p.key === period)!;
  const series = useMemo(
    () => salesSeries(orderList, period, config.buckets),
    [orderList, period, config.buckets]
  );

  const windowStart = series[0]?.key;
  const inWindow = useMemo(
    () =>
      orderList.filter((o) => {
        if (o.status === "cancelled") return false;
        if (!windowStart) return true;
        const at = new Date(o.placed_at);
        if (period === "month") return at.toISOString().slice(0, 7) >= windowStart;
        if (period === "week") return at.toISOString().slice(0, 10) >= windowStart;
        return at.toISOString().slice(0, 10) >= windowStart;
      }),
    [orderList, windowStart, period]
  );

  const totalSales = inWindow.reduce((s, o) => s + Number(o.amount_inr), 0);
  const totalProfit = inWindow.reduce((s, o) => s + orderProfit(o), 0);
  const avgOrder = inWindow.length ? totalSales / inWindow.length : 0;
  const margin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

  const categories = salesByCategory(inWindow, productList);
  const best = topProducts(inWindow, 5);
  const maxCategorySales = Math.max(1, ...categories.map((c) => c.sales));

  return (
    <RetailerLayout title="Sales Analytics" subtitle={config.hint}>
      {failed && (
        <div className="mb-4">
          <ErrorNotice message={failed.error} onRetry={() => void failed.reload()} />
        </div>
      )}

      {/* Period switch */}
      <div className="flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1.5 sm:w-auto sm:max-w-md">
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => setPeriod(p.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-slate-100 text-forest" : "text-slate-500 hover:bg-slate-50"
                }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales"
          value={loading ? "—" : formatINR(totalSales)}
          icon={IndianRupee}
          hint={config.hint}
        />
        <StatCard
          label="Profit"
          value={loading ? "—" : formatINR(totalProfit)}
          icon={TrendingUp}
          tone="amber"
          hint={`${margin.toFixed(1)}% margin`}
        />
        <StatCard
          label="Orders"
          value={loading ? "—" : inWindow.length.toLocaleString("en-IN")}
          icon={ShoppingCart}
          tone="violet"
          hint={config.hint}
        />
        <StatCard
          label="Average order"
          value={loading ? "—" : formatINR(avgOrder)}
          icon={ChartNoAxesCombined}
          hint="Per billed order"
        />
      </div>

      <div className="mt-4 space-y-4">
        <Panel
          title={`${config.label} sales`}
          description="Bars are sales; the line is profit."
        >
          {loading ? (
            <Loading label="Building the report…" />
          ) : inWindow.length === 0 ? (
            <EmptyState
              icon={ChartNoAxesCombined}
              title="No sales in this period"
              description="Once orders are recorded for this window the daily, weekly and monthly trend appears here."
            />
          ) : (
            <div className="p-4 sm:p-5">
              <SalesChart points={series} />
              <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Sales
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-amber-500" /> Profit
                </span>
              </div>
            </div>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Sales by category" description="Where the money comes from">
            {loading ? (
              <Loading label="Calculating…" />
            ) : categories.every((c) => c.sales === 0) ? (
              <EmptyState
                icon={ChartNoAxesCombined}
                title="No category data yet"
                description="Sales are attributed to a category through the product they were billed under."
              />
            ) : (
              <ul className="space-y-3 p-4 sm:p-5">
                {PRODUCT_CATEGORIES.map((category) => {
                  const row = categories.find((c) => c.category === category);
                  const sales = row?.sales ?? 0;
                  const pct = (sales / maxCategorySales) * 100;
                  return (
                    <li key={category}>
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="font-semibold text-slate-700">{category}</span>
                        <span className="text-slate-500">
                          {formatINR(sales)}
                          <span className="ml-1.5 text-slate-400">{row?.orders ?? 0} orders</span>
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Best-selling products" description="By revenue in this window">
            {loading ? (
              <Loading label="Ranking products…" />
            ) : best.length === 0 ? (
              <EmptyState
                icon={ChartNoAxesCombined}
                title="No sales yet"
                description="Your top products by revenue will be ranked here."
              />
            ) : (
              <ol className="divide-y divide-slate-100">
                {best.map((row, index) => (
                  <li key={row.name} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-forest">{row.name}</p>
                      <p className="text-[11px] text-slate-500">{formatQty(row.qty, "units")} sold</p>
                    </div>
                    <span className="font-display text-[13px] font-bold text-forest">
                      {formatINR(row.sales)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </RetailerLayout>
  );
}

/** Responsive bar + line chart drawn with plain SVG. */
function SalesChart({ points }: { points: SalesPoint[] }) {
  const width = 720;
  const height = 220;
  const padX = 8;
  const padTop = 12;
  const padBottom = 28;
  const innerH = height - padTop - padBottom;
  const max = Math.max(1, ...points.map((p) => Math.max(p.sales, p.profit)));
  const slot = (width - padX * 2) / Math.max(points.length, 1);
  const barW = Math.min(38, slot * 0.56);

  const y = (value: number) => padTop + innerH - (value / max) * innerH;
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${padX + slot * i + slot / 2} ${y(p.profit)}`)
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Sales and profit trend"
        className="h-56 w-full min-w-[560px]"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <line
            key={tick}
            x1={0}
            x2={width}
            y1={padTop + innerH * tick}
            y2={padTop + innerH * tick}
            stroke="#e2e8f0"
            strokeDasharray="3 3"
          />
        ))}

        {points.map((point, i) => {
          const centerX = padX + slot * i + slot / 2;
          const barH = (point.sales / max) * innerH;
          return (
            <g key={point.key}>
              <rect
                x={centerX - barW / 2}
                y={padTop + innerH - barH}
                width={barW}
                height={Math.max(barH, point.sales > 0 ? 2 : 0)}
                rx={4}
                fill="#15803d"
                fillOpacity={0.85}
              >
                <title>
                  {point.label}: {formatINR(point.sales)} sales · {formatINR(point.profit)} profit
                </title>
              </rect>
              <text
                x={centerX}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {point.label}
              </text>
            </g>
          );
        })}

        <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" />
        {points.map((point, i) => (
          <circle
            key={`dot-${point.key}`}
            cx={padX + slot * i + slot / 2}
            cy={y(point.profit)}
            r={2}
            fill="#f59e0b"
          />
        ))}
      </svg>
    </div>
  );
}
