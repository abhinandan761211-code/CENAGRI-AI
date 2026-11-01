import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Minus,
  PackagePlus,
  Plus,
  Warehouse,
} from "lucide-react";
import { Link } from "react-router-dom";
import RetailerLayout, { RETAILER_ROUTES } from "@/components/retailer/RetailerLayout";
import { Badge, EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { ProductThumb } from "@/components/retailer/ImageUploader";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  EXPIRY_LABEL,
  EXPIRY_STYLE,
  STOCK_STYLE,
  adjustStock,
  daysUntil,
  expiryState,
  formatDate,
  formatINR,
  formatQty,
  listProducts,
  needsExpiry,
  stockLevel,
} from "@/lib/retailer";
import type { RetailerProduct } from "@/lib/retailer";

type Filter = "all" | "low" | "expiring" | "expired";

/**
 * Inventory — available stock, the low-stock queue and expiry tracking for
 * fertiliser and pesticide batches.
 *
 * Restocking writes straight to `stock_qty`; a DB trigger raises the low-stock
 * notification when the value crosses the product's threshold, so the alert in
 * the header is generated server-side rather than by this page.
 */
export default function RetailerInventory() {
  const { data, setData, state, error, reload } = useRetailerData<RetailerProduct[]>(
    () => listProducts(),
    []
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const products = data ?? [];

  const stats = useMemo(() => {
    const low = products.filter((p) => stockLevel(p) !== "ok");
    const expiring = products.filter((p) => ["critical", "soon"].includes(expiryState(p)));
    const expired = products.filter((p) => expiryState(p) === "expired");
    const stockValue = products.reduce((sum, p) => sum + Number(p.price_inr) * Number(p.stock_qty), 0);
    return { low, expiring, expired, stockValue };
  }, [products]);

  const visible = useMemo(() => {
    if (filter === "low") return products.filter((p) => stockLevel(p) !== "ok");
    if (filter === "expiring") return products.filter((p) => ["critical", "soon"].includes(expiryState(p)));
    if (filter === "expired") return products.filter((p) => expiryState(p) === "expired");
    return products;
  }, [products, filter]);

  async function restock(product: RetailerProduct, delta: number) {
    setBusyId(product.id);
    setActionError("");
    try {
      const saved = await adjustStock(product, delta);
      setData(products.map((p) => (p.id === saved.id ? saved : p)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update stock.");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All stock", count: products.length },
    { key: "low", label: "Low stock", count: stats.low.length },
    { key: "expiring", label: "Expiring ≤ 90d", count: stats.expiring.length },
    { key: "expired", label: "Expired", count: stats.expired.length },
  ];

  return (
    <RetailerLayout title="Inventory" subtitle="Stock levels, low-stock alerts & expiry tracking">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stock value"
          value={state === "ready" ? formatINR(stats.stockValue) : "—"}
          icon={Warehouse}
          hint={`${products.length} product lines`}
        />
        <StatCard
          label="Low or out"
          value={state === "ready" ? stats.low.length : "—"}
          icon={AlertTriangle}
          tone="amber"
          hint="At or below the alert level"
        />
        <StatCard
          label="Expiring in 90 days"
          value={state === "ready" ? stats.expiring.length : "—"}
          icon={CalendarClock}
          tone="violet"
          hint="Fertiliser & pesticide batches"
        />
        <StatCard
          label="Expired"
          value={state === "ready" ? stats.expired.length : "—"}
          icon={Boxes}
          tone="rose"
          hint="Pull these off the shelf"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {tabs.map(({ key, label, count }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-slate-100 text-forest" : "text-slate-500 hover:bg-slate-50"
                }`}
            >
              {label}
              <span className="ml-1.5 text-[10px] text-slate-400">{count}</span>
            </button>
          );
        })}
      </div>

      {(actionError || state === "error") && (
        <div className="mt-4">
          <ErrorNotice message={actionError || error} onRetry={() => void reload()} />
        </div>
      )}

      <div className="mt-4">
        {state === "loading" && <Loading label="Loading stock…" />}

        {state === "ready" && visible.length === 0 && (
          <div className="card">
            <EmptyState
              icon={Warehouse}
              title={
                products.length === 0
                  ? "No stock recorded yet"
                  : filter === "low"
                    ? "No low-stock items"
                    : filter === "expired"
                      ? "No expired batches"
                      : "Nothing expiring in the next 90 days"
              }
              description={
                products.length === 0
                  ? "Add products to your catalogue and their stock, alert level and expiry date are tracked here."
                  : "Your shelves are in good shape for this filter."
              }
              action={
                products.length === 0 ? (
                  <Link to={RETAILER_ROUTES.products} className="btn-primary h-9 px-4 text-xs">
                    Add products
                  </Link>
                ) : undefined
              }
            />
          </div>
        )}

        {state === "ready" && visible.length > 0 && (
          <Panel title="Stock register" description="Adjust stock in place; a notification fires at the alert level.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 font-semibold">Stock</th>
                    <th className="px-4 py-2.5 font-semibold">Alert at</th>
                    <th className="px-4 py-2.5 font-semibold">Expiry</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((product) => {
                    const level = stockLevel(product);
                    const expiry = expiryState(product);
                    const days = daysUntil(product.expiry_date);
                    const busy = busyId === product.id;

                    return (
                      <tr key={product.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <ProductThumb url={product.image_url} size={36} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-forest">{product.name}</p>
                              <p className="truncate text-[11px] text-slate-500">
                                {product.brand ?? "Unbranded"}
                                {product.batch_no ? ` · Batch ${product.batch_no}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{product.category}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {formatQty(product.stock_qty, product.unit)}
                            </span>
                            <Badge className={STOCK_STYLE[level]}>
                              {level === "out" ? "Out" : level === "low" ? "Low" : "OK"}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatQty(product.low_stock_at, product.unit)}
                        </td>
                        <td className="px-4 py-3">
                          {product.expiry_date ? (
                            <div>
                              <p className="text-slate-700">{formatDate(product.expiry_date)}</p>
                              <Badge className={EXPIRY_STYLE[expiry]}>
                                {EXPIRY_LABEL[expiry]}
                                {days != null && (days >= 0 ? ` · ${days}d` : ` · ${Math.abs(days)}d ago`)}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-slate-400">
                              {needsExpiry(product.category) ? "Missing" : "Not applicable"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={busy || Number(product.stock_qty) <= 0}
                              onClick={() => void restock(product, -1)}
                              aria-label={`Reduce ${product.name} stock by 1`}
                              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void restock(product, 1)}
                              aria-label={`Add 1 ${product.unit} of ${product.name}`}
                              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                const raw = window.prompt(
                                  `How many ${product.unit} did you receive for ${product.name}?`,
                                  "10"
                                );
                                if (raw == null) return;
                                const n = Number(raw);
                                if (!Number.isFinite(n) || n === 0) return;
                                void restock(product, n);
                              }}
                              className="ml-1 inline-flex h-7 items-center gap-1 rounded border border-brand-200 bg-brand-50 px-2 text-[10px] font-bold text-brand-800 transition hover:bg-brand-100 disabled:opacity-50"
                            >
                              <PackagePlus className="h-3 w-3" />
                              Restock
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </RetailerLayout>
  );
}
