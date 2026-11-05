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
import { useLang } from "@/i18n/LanguageContext";
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

  const { t, tf } = useLang();
  const shopName = profile?.details?.shop_name;
  const locationLine =
    [profile?.details?.district, profile?.details?.state].filter(Boolean).join(", ") ||
    t("r.home.locationNotSet");

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Suprabhat";
    if (h < 17) return "Namaskar";
    return "Shubho Sandhya";
  })();

  return (
    <RetailerLayout title={t("r.home.title")} subtitle={t("r.home.subtitle")}>
      <ShellHero
        locationLine={locationLine}
        greeting={`${greeting}${shopName ? `, ${shopName}` : ""}! 🌾`}
        subtitle={t("r.home.heroSub")}
        aside={
          <div className="rounded-xl bg-white/10 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              {t("r.home.today")}
            </p>
            <p className="mt-1.5 font-display text-2xl font-extrabold">
              {loading ? "—" : formatINR(totals.monthlyProfit)}
            </p>
            <p className="mt-1 text-[11px] text-white/70">
              {tf("r.home.profitMonth", { count: totals.ordersThisMonth })}
            </p>
          </div>
        }
      />

      <ShellQuickActions
        actions={[
          {
            label: t("r.home.addProduct"),
            icon: PackagePlus,
            onClick: () => navigate(RETAILER_ROUTES.products),
          },
          {
            label: t("r.home.orders"),
            icon: ShoppingCart,
            onClick: () => navigate(RETAILER_ROUTES.orders),
          },
          {
            label: t("r.home.stock"),
            icon: Warehouse,
            onClick: () => navigate(RETAILER_ROUTES.inventory),
          },
          {
            label: t("r.home.offers"),
            icon: Megaphone,
            onClick: () => navigate(RETAILER_ROUTES.offers),
          },
          {
            label: t("r.home.buyProduce"),
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
          label={t("r.home.totalOrders")}
          value={loading ? "—" : totals.totalOrders.toLocaleString("en-IN")}
          icon={ShoppingCart}
          hint={tf("r.home.waitingShip", { count: openOrders.length })}
        />
        <StatCard
          label={t("r.home.totalSales")}
          value={loading ? "—" : formatINR(totals.totalSales)}
          icon={IndianRupee}
          trend={{ value: totals.salesChangePct, period: t("r.home.vsLastMonth") }}
        />
        <StatCard
          label={t("r.home.productsListed")}
          value={loading ? "—" : totals.productsListed.toLocaleString("en-IN")}
          icon={Package}
          tone="violet"
          hint={tf("r.home.inCatalogue", { count: productList.length })}
        />
        <StatCard
          label={t("r.home.monthlyProfit")}
          value={loading ? "—" : formatINR(totals.monthlyProfit)}
          icon={TrendingUp}
          tone="amber"
          hint={
            totals.ordersThisMonth > 0
              ? tf("r.home.fromOrders", { count: totals.ordersThisMonth })
              : t("r.home.noOrdersMonth")
          }
        />
      </div>

      {/* Alerts */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Panel
          title={t("r.home.lowStock")}
          description={t("r.home.lowStockDesc")}
          action={
            <Link to={RETAILER_ROUTES.inventory} className="text-[11px] font-bold text-brand-700 hover:underline">
              {t("r.home.manage")}
            </Link>
          }
        >
          {loading ? (
            <Loading label={t("r.home.checkingStock")} />
          ) : lowStock.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title={t("r.home.stockHealthy")}
              description={t("r.home.stockHealthyDesc")}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.slice(0, 5).map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-forest">{product.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {tf("r.home.leftAlertAt", {
                        left: formatQty(product.stock_qty, product.unit),
                        at: formatQty(product.low_stock_at, product.unit),
                      })}
                    </p>
                  </div>
                  <Badge className={STOCK_STYLE[stockLevel(product)]}>
                    {stockLevel(product) === "out" ? t("r.home.out") : t("r.home.low")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={t("r.home.expiryTracking")}
          description={t("r.home.expiryDesc")}
          action={
            <Link to={RETAILER_ROUTES.inventory} className="text-[11px] font-bold text-brand-700 hover:underline">
              {t("r.home.review")}
            </Link>
          }
        >
          {loading ? (
            <Loading label={t("r.home.checkingBatches")} />
          ) : expiring.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t("r.home.noExpiry")}
              description={t("r.home.noExpiryDesc")}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {expiring.slice(0, 5).map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-forest">{product.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {tf("r.home.batch", {
                        batch: product.batch_no ?? "—",
                        date: formatDate(product.expiry_date),
                      })}
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
          title={t("r.home.ordersToFulfil")}
          description={t("r.home.processingShipped")}
          action={
            <Link to={RETAILER_ROUTES.orders} className="text-[11px] font-bold text-brand-700 hover:underline">
              {t("r.home.allOrders")}
            </Link>
          }
        >
          {loading ? (
            <Loading label={t("r.home.loadingOrders")} />
          ) : openOrders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={t("r.home.nothingPending")}
              description={t("r.home.nothingPendingDesc")}
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
            title: t("r.home.catalogue"),
            body: t("r.home.catalogueBody"),
          },
          {
            to: RETAILER_ROUTES.buy,
            icon: Sprout,
            title: t("r.home.buyFromFarmers"),
            body: t("r.home.buyFarmersBody"),
          },
          {
            to: RETAILER_ROUTES.offers,
            icon: Megaphone,
            title: t("r.home.offers"),
            body: t("r.home.offersBody"),
          },
          {
            to: RETAILER_ROUTES.analytics,
            icon: TrendingUp,
            title: t("r.home.analytics"),
            body: t("r.home.analyticsBody"),
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
        <Panel title={t("r.home.recentSales")} description={t("r.home.recentSalesDesc")}>
          {loading ? (
            <Loading label={t("r.home.loadingSales")} />
          ) : orderList.length === 0 ? (
            <EmptyState
              icon={IndianRupee}
              title={t("r.home.noSales")}
              description={t("r.home.noSalesDesc")}
              action={
                <Link to={RETAILER_ROUTES.orders} className="btn-primary h-9 px-4 text-xs">
                  {t("r.home.goOrders")}
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t("r.home.colProduct")}</th>
                    <th className="px-4 py-2 font-semibold">{t("r.home.colCustomer")}</th>
                    <th className="px-4 py-2 font-semibold">{t("r.home.colQty")}</th>
                    <th className="px-4 py-2 text-right font-semibold">{t("r.home.colAmount")}</th>
                    <th className="px-4 py-2 text-right font-semibold">{t("r.home.colProfit")}</th>
                    <th className="px-4 py-2 font-semibold">{t("r.home.colDate")}</th>
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
