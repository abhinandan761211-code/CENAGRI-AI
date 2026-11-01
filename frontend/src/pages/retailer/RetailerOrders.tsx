import { useMemo, useState } from "react";
import { ChevronDown, MessageSquare, ShoppingCart, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import RetailerLayout, { RETAILER_ROUTES } from "@/components/retailer/RetailerLayout";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Loading,
  Panel,
} from "@/components/retailer/ui";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  ORDER_STATUSES,
  ORDER_STATUS_STYLE,
  formatDate,
  formatINR,
  formatQty,
  listOrders,
  orderProfit,
  setOrderStatus,
} from "@/lib/retailer";
import type { RetailerOrder, RetailerOrderStatus } from "@/lib/retailer";

/** The next step a shopkeeper can take on an order, and its button label. */
const NEXT_ACTION: Partial<Record<RetailerOrderStatus, { to: RetailerOrderStatus; label: string }>> = {
  processing: { to: "shipped", label: "Mark shipped" },
  shipped: { to: "delivered", label: "Mark delivered" },
};

export const RETAILER_ORDER_TABS = ["all", ...ORDER_STATUSES] as const;
type Tab = (typeof RETAILER_ORDER_TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  all: "All orders",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Orders — customer orders against the shop, moving through processing →
 * shipped → delivered. Cancelling is allowed until delivery.
 *
 * The status change is a single UPDATE; the page patches that one row rather
 * than refetching, and the DB stamps the shipped/delivered timestamp.
 */
export default function RetailerOrders() {
  const { data, setData, state, error, reload } = useRetailerData<RetailerOrder[]>(
    () => listOrders(180),
    []
  );

  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "amount">("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const orders = data ?? [];

  const counts = useMemo(() => {
    const base = { all: orders.length } as Record<Tab, number>;
    for (const status of ORDER_STATUSES) {
      base[status] = orders.filter((o) => o.status === status).length;
    }
    return base;
  }, [orders]);

  const visible = useMemo(() => {
    const rows = tab === "all" ? orders : orders.filter((o) => o.status === tab);
    const copy = [...rows];
    if (sort === "oldest") copy.sort((a, b) => a.placed_at.localeCompare(b.placed_at));
    else if (sort === "amount") copy.sort((a, b) => Number(b.amount_inr) - Number(a.amount_inr));
    else copy.sort((a, b) => b.placed_at.localeCompare(a.placed_at));
    return copy;
  }, [orders, tab, sort]);

  async function changeStatus(order: RetailerOrder, status: RetailerOrderStatus) {
    setBusyId(order.id);
    setActionError("");
    try {
      const saved = await setOrderStatus(order.id, status);
      setData(orders.map((o) => (o.id === saved.id ? saved : o)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the order.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <RetailerLayout title="Orders" subtitle="Customer orders, processing, shipped & delivered">
      {/* Tabs + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 scrollbar-none sm:w-auto"
          role="tablist"
        >
          {RETAILER_ORDER_TABS.map((key) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  active ? "bg-slate-100 text-forest" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {key !== "all" && (
                  <span className={`h-1.5 w-1.5 rounded-full ${ORDER_STATUS_STYLE[key].dot}`} />
                )}
                {TAB_LABEL[key]}
                <span className={active ? "text-forest" : "text-slate-400"}>{counts[key]}</span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {sort === "newest" ? "Newest first" : sort === "oldest" ? "Oldest first" : "Amount: high to low"}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {sortOpen && (
            <ul
              role="listbox"
              className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              {(
                [
                  ["newest", "Newest first"],
                  ["oldest", "Oldest first"],
                  ["amount", "Amount: high to low"],
                ] as const
              ).map(([value, label]) => (
                <li key={value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sort === value}
                    onClick={() => {
                      setSort(value);
                      setSortOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${
                      sort === value ? "font-semibold text-forest" : "text-slate-600"
                    }`}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(actionError || state === "error") && (
        <div className="mt-4">
          <ErrorNotice message={actionError || error} onRetry={() => void reload()} />
        </div>
      )}

      {state === "loading" && <Loading label="Loading orders…" />}

      {state === "ready" && visible.length === 0 && (
        <div className="card mt-4">
          <EmptyState
            icon={ShoppingCart}
            title={orders.length === 0 ? "No customer orders yet" : `Nothing in “${TAB_LABEL[tab]}”`}
            description={
              orders.length === 0
                ? "Orders placed by farmers against your shop appear here with the customer, amount and delivery status."
                : "Switch tabs to see the rest of your orders."
            }
            action={
              <Link to={RETAILER_ROUTES.products} className="btn-primary h-9 px-4 text-xs">
                Manage products
              </Link>
            }
          />
        </div>
      )}

      {state === "ready" && visible.length > 0 && (
        <ul className="mt-4 space-y-3">
          {visible.map((order) => {
            const next = NEXT_ACTION[order.status];
            const canCancel = order.status === "processing" || order.status === "shipped";
            const busy = busyId === order.id;

            return (
              <li key={order.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-[15px] font-bold text-forest">{order.product_name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {order.customer_name}
                      {order.customer_phone && <> · {order.customer_phone}</>} ·{" "}
                      {formatDate(order.placed_at)}
                    </p>
                  </div>
                  <Badge className={ORDER_STATUS_STYLE[order.status].badge}>{order.status}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-4">
                    <div>
                      <dt className="text-slate-400">Quantity</dt>
                      <dd className="font-semibold text-slate-700">
                        {formatQty(order.quantity, order.unit)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Amount</dt>
                      <dd className="font-bold text-forest">{formatINR(order.amount_inr)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Profit</dt>
                      <dd className="text-emerald-700">{formatINR(orderProfit(order))}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Payment</dt>
                      <dd className="uppercase text-slate-600">{order.payment_mode}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2">
                    {order.customer_id && (
                      <Link
                        to={RETAILER_ROUTES.messages}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                        aria-label={`Message ${order.customer_name}`}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {next && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(order, next.to)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-[11px] font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
                      >
                        <Truck className="h-3 w-3" />
                        {busy ? "Saving…" : next.label}
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Cancel the order for ${order.product_name}?`)) {
                            void changeStatus(order, "cancelled");
                          }
                        }}
                        className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {state === "ready" && orders.length > 0 && (
        <div className="mt-4">
          <Panel title="How order status works">
            <p className="p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
              <strong className="text-forest">Processing</strong> — payment confirmed, packing the
              order. <strong className="text-forest">Shipped</strong> — handed to the transporter, a
              timestamp is stamped automatically. <strong className="text-forest">Delivered</strong>{" "}
              — received by the farmer; the sale and its profit are counted in Sales Analytics.
              Cancelled orders are kept for the record but never counted as sales.
            </p>
          </Panel>
        </div>
      )}
    </RetailerLayout>
  );
}
