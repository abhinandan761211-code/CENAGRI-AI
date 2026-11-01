import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  IndianRupee,
  Megaphone,
  Package,
  PackagePlus,
  ShoppingCart,
  Sprout,
  Store,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ShellHero, ShellQuickActions } from "@/components/account/AccountShell";
import RetailerLayout, { RETAILER_ROUTES } from "@/components/retailer/RetailerLayout";
import { Badge, EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  EXPIRY_LABEL,
  EXPIRY_STYLE,
  dashboardTotals,
  expiryState,
  formatDate,
  formatINR,
  formatQty,
  listOrders,
  listProducts,
  orderProfit,
  stockLevel,
  STOCK_STYLE,
} from "@/lib/retailer";
import type { RetailerOrder, RetailerProduct } from "@/lib/retailer";

/**
 * Retailer home — the four KPIs from the brief (total orders, total sales,
 * products listed, monthly profit) plus the three alerts that matter for an
 * input shop: low stock, expiring fertiliser/pesticide and open orders.
 *
 * Every number is derived from `retailer_orders` and `retailer_products`; an
 * empty shop shows zeros and the empty state, never sample data.
 */
export default function RetailerHome() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const products = useRetailerData<RetailerProduct[]>(() => listProducts());
  const orders = useRetailerData<RetailerOrder[]>(() => listOrders(90));

  const loading = products.state === "loading" || orders.state === "loading";
  const failed = products.state === "error" ? products : orders.state === "error" ? orders : null;

  const productList = products.data ?? [];
  const orderList = orders.data ?? [];
  const totals = dashboardTotals(orderList, productList);

  const lowStock = productList.filter((p) => stockLevel(p) !== "ok" && p.status === "active");
  const expiring = productList
    .filter((p) => ["expired", "critical", "soon"].includes(expiryState(p)))
    .sort((a, b) => (a.expiry_date ?? "").localeCompare(b.expiry_date ?? ""));
  const openOrders = orderList.filter((o) => o.status === "processing" || o.status === "shipped");

  const shopName = profile?.details?.shop_name;
  const locationLine =
    [profile?.details?.district, profile?.details?.state].filter(Boolean).join(", ") ||
    "Location not set";

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Suprabhat";
    if (h < 17) return "Namaskar";
    return "Shubho Sandhya";
  })();

  return (
    <RetailerLayout title="Home" subtitle="Business overview">
      <ShellHero
        locationLine={locationLine}
        greeting={`${greeting}${shopName ? `, ${shopName}` : ""}! 🌾`}
        subtitle="Aaj ki dukaan ka poora hisaab — sales, stock aur orders ek jagah."
        aside={
          <div className="rounded-xl bg-white/10 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              Today
            </p>
            <p className="mt-1.5 font-display text-2xl font-extrabold">
              {loading ? "—" : formatINR(totals.monthlyProfit)}
            </p>
            <p className="mt-1 text-[11px] text-white/70">
              Profit this month · {totals.ordersThisMonth} orders
            </p>
          </div>
        }
      />

      <ShellQuickActions
        actions={[
          {
            label: "Add Product",
            icon: PackagePlus,
            onClick: () => navigate(RETAILER_ROUTES.products),
          },
          {
            label: "Orders",
            icon: ShoppingCart,
            onClick: () => navigate(RETAILER_ROUTES.orders),
          },
          {
            label: "Stock",
            icon: Warehouse,
            onClick: () => navigate(RETAILER_ROUTES.inventory),
          },
          {
            label: "Offers",
            icon: Megaphone,
            onClick: () => navigate(RETAILER_ROUTES.offers),
          },
          {
            label: "Buy Produce",
            icon: Sprout,
            onClick: () => navigate(RETAILER_ROUTES.buy),
          },
        ]}
      />

      {failed && (
        <ErrorNotice message={failed.error} onRetry={() => void failed.reload()} />
      )}

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Orders"
          value={loading ? "—" : totals.totalOrders.toLocaleString("en-IN")}
          icon={ShoppingCart}
          hint={`${openOrders.length} waiting to be shipped`}
        />
        <StatCard
          label="Total Sales"
          value={loading ? "—" : formatINR(totals.totalSales)}
          icon={IndianRupee}
          trend={{ value: totals.salesChangePct, period: "vs last month" }}
        />
        <StatCard
          label="Products Listed"
          value={loading ? "—" : totals.productsListed.toLocaleString("en-IN")}
          icon={Package}
          tone="violet"
          hint={`${productList.length} products in catalogue`}
        />
        <StatCard
          label="Monthly Profit"
          value={loading ? "—" : formatINR(totals.monthlyProfit)}
          icon={TrendingUp}
          tone="amber"
          hint={
            totals.ordersThisMonth > 0
              ? `From ${totals.ordersThisMonth} orders this month`
              : "No orders this month yet"
          }
        />
      </div>

      {/* Alerts */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Panel
          title="Low stock"
          description="Re-order before the shelf runs out"
          action={
            <Link to={RETAILER_ROUTES.inventory} className="text-[11px] font-bold text-brand-700 hover:underline">
              Manage
            </Link>
          }
        >
          {loading ? (
            <Loading label="Checking stock…" />
          ) : lowStock.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="Stock levels are healthy"
              description="Products drop below their threshold will appear here automatically."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.slice(0, 5).map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-forest">{product.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatQty(product.stock_qty, product.unit)} left · alert at{" "}
                      {formatQty(product.low_stock_at, product.unit)}
                    </p>
                  </div>
                  <Badge className={STOCK_STYLE[stockLevel(product)]}>
                    {stockLevel(product) === "out" ? "Out" : "Low"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Expiry tracking"
          description="Fertilisers & pesticides expiring"
          action={
            <Link to={RETAILER_ROUTES.inventory} className="text-[11px] font-bold text-brand-700 hover:underline">
              Review
            </Link>
          }
        >
          {loading ? (
            <Loading label="Checking batches…" />
          ) : expiring.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No batches expiring soon"
              description="Fertiliser and pesticide batches with a date within 90 days are listed here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {expiring.slice(0, 5).map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-forest">{product.name}</p>
                    <p className="text-[11px] text-slate-500">
                      Batch {product.batch_no ?? "—"} · {formatDate(product.expiry_date)}
                    </p>
                  </div>
                  <Badge className={EXPIRY_STYLE[expiryState(product)]}>
                    {EXPIRY_LABEL[expiryState(product)]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Orders to fulfil"
          description="Processing and shipped"
          action={
            <Link to={RETAILER_ROUTES.orders} className="text-[11px] font-bold text-brand-700 hover:underline">
              All orders
            </Link>
          }
        >
          {loading ? (
            <Loading label="Loading orders…" />
          ) : openOrders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Nothing pending"
              description="New customer orders appear here with the product and amount."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {openOrders.slice(0, 5).map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-forest">{order.product_name}</p>
                    <p className="text-[11px] text-slate-500">
                      {order.customer_name} · {formatQty(order.quantity, order.unit)}
                    </p>
                  </div>
                  <span className="text-right">
                    <span className="block text-[12px] font-bold text-forest">
                      {formatINR(order.amount_inr)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {order.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Shop status strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            to: RETAILER_ROUTES.products,
            icon: Package,
            title: "Catalogue",
            body: "Seed, fertiliser, pesticide, tool & irrigation.",
          },
          {
            to: RETAILER_ROUTES.buy,
            icon: Sprout,
            title: "Buy from farmers",
            body: "Procure produce and eligible inputs directly.",
          },
          {
            to: RETAILER_ROUTES.offers,
            icon: Megaphone,
            title: "Offers",
            body: "Festival and seasonal coupons for customers.",
          },
          {
            to: RETAILER_ROUTES.analytics,
            icon: TrendingUp,
            title: "Sales analytics",
            body: "Daily, weekly and monthly sales and profit.",
          },
        ].map(({ to, icon: Icon, title, body }) => (
          <Link key={to} to={to} className="card flex items-start gap-3 p-4 transition hover:border-brand-300 hover:shadow-card-hover">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-forest">{title}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{body}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      <div>
        <Panel title="Recent sales" description="Latest customer orders with profit per line">
          {loading ? (
            <Loading label="Loading sales…" />
          ) : orderList.length === 0 ? (
            <EmptyState
              icon={IndianRupee}
              title="No sales recorded yet"
              description="Once a customer order is logged against your shop it appears here."
              action={
                <Link to={RETAILER_ROUTES.orders} className="btn-primary h-9 px-4 text-xs">
                  Go to orders
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Product</th>
                    <th className="px-4 py-2 font-semibold">Customer</th>
                    <th className="px-4 py-2 font-semibold">Qty</th>
                    <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2 text-right font-semibold">Profit</th>
                    <th className="px-4 py-2 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orderList.slice(0, 8).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-semibold text-forest">{order.product_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{order.customer_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {formatQty(order.quantity, order.unit)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-forest">
                        {formatINR(order.amount_inr)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">
                        {formatINR(orderProfit(order))}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(order.placed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </RetailerLayout>
  );
}
