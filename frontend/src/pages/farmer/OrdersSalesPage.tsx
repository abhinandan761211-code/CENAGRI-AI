import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  IndianRupee,
  Package,
  ShoppingBag,
  Store,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  inr,
  LoadingRows,
  Modal,
  PageHeader,
  Panel,
  shortDate,
  Stat,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { isMissingTable } from "@/lib/schemaCheck";
import { farm } from "@/lib/farmerOrders";
import type { FarmerOrder } from "@/lib/farmerOrders";

/**
 * My Orders & Sales — what the farmer bought and what they sold.
 *
 * Sold side: orders placed on the farmer's own listings (the seller view).
 * Bought side: orders the farmer placed as a buyer.
 *
 * A sale only counts as income once it is delivered elsewhere; this page shows
 * every status honestly and labels it, rather than merging the totals.
 */

const STATUS_TONE: Record<string, "green" | "amber" | "slate" | "red" | "blue"> = {
  pending: "amber",
  confirmed: "blue",
  delivered: "green",
  cancelled: "red",
};

export default function OrdersSalesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"sales" | "purchases">("sales");
  const [sales, setSales] = useState<FarmerOrder[]>([]);
  const [purchases, setPurchases] = useState<FarmerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState<FarmerOrder | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    try {
      const [sold, bought] = await Promise.all([farm.listSales(), farm.listPurchases()]);
      setSales(sold);
      setPurchases(bought);
    } catch (err) {
      if (isMissingTable(err)) {
        setError("The orders table is not set up yet. Run database/supabase/features.sql in Supabase.");
      } else {
        setError(err instanceof Error ? err.message : "Could not load your orders.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const rows = tab === "sales" ? sales : purchases;

  const totals = useMemo(() => {
    const delivered = rows.filter((r) => r.status === "delivered");
    const pending = rows.filter((r) => r.status === "pending" || r.status === "confirmed");
    return {
      confirmed: delivered.reduce((sum, r) => sum + r.amount_inr, 0),
      pending: pending.reduce((sum, r) => sum + r.amount_inr, 0),
      count: rows.length,
    };
  }, [rows]);

  return (
    <FarmerShell>
      <PageHeader
        icon={ShoppingBag}
        title="My Orders & Sales"
        description="Every order on your listings and everything you bought on the marketplace, with delivery status and an invoice for each."
        actions={
          <Link to="/marketplace" className="creator-btn-primary inline-flex h-9 items-center px-3.5 text-xs">
            <Store className="h-3.5 w-3.5" /> Marketplace
          </Link>
        }
      />

      <div className="flex gap-1.5">
        {(
          [
            { key: "sales", label: "Sales", icon: ArrowUpRight, count: sales.length },
            { key: "purchases", label: "Purchases", icon: ArrowDownLeft, count: purchases.length },
          ] as const
        ).map(({ key, label: text, icon: Icon, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              tab === key ? "bg-forest text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {text}
            <span className={`rounded-full px-1.5 text-[10px] ${tab === key ? "bg-white/20" : "bg-slate-100"}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={totals.count} icon={Package} hint={tab === "sales" ? "On my listings" : "Placed by me"} />
        <Stat
          label={tab === "sales" ? "Delivered value" : "Received value"}
          value={totals.confirmed ? inr(totals.confirmed) : "—"}
          icon={IndianRupee}
          tone="green"
          hint="Delivered orders only"
        />
        <Stat label="In progress" value={totals.pending ? inr(totals.pending) : "—"} icon={Package} tone="amber" hint="Pending or confirmed" />
        <Stat
          label="Invoices"
          value={rows.filter((r) => r.status === "delivered").length}
          icon={FileText}
          tone="blue"
          hint="Available for delivered orders"
        />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <Panel flush>
        {loading ? (
          <LoadingRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={tab === "sales" ? "No sales yet" : "No purchases yet"}
            body={
              tab === "sales"
                ? "When a buyer orders one of your listings it appears here, with delivery status."
                : "Orders you place on the marketplace appear here with their status."
            }
            action={
              <Link to="/marketplace" className="creator-btn-primary inline-flex h-9 items-center px-4 text-xs">
                Open Marketplace
              </Link>
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Product</Th>
                  <Th>{tab === "sales" ? "Buyer" : "Seller"}</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-mono text-[11px] font-semibold text-slate-600">{row.reference}</span>
                    </Td>
                    <Td>{row.product ?? "—"}</Td>
                    <Td>{row.counterparty ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{row.quantity_kg != null ? `${row.quantity_kg} kg` : "—"}</Td>
                    <Td className="text-right font-semibold tabular-nums text-forest">{inr(row.amount_inr)}</Td>
                    <Td>
                      <Chip tone={STATUS_TONE[row.status] ?? "slate"}>{row.status}</Chip>
                    </Td>
                    <Td className="whitespace-nowrap text-[11px]">{shortDate(row.created_at)}</Td>
                    <Td>
                      {row.status === "delivered" && (
                        <GhostButton className="h-7 px-2 text-[10px]" onClick={() => setInvoice(row)}>
                          <FileText className="h-3 w-3" /> Invoice
                        </GhostButton>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <p className="text-[10px] leading-relaxed text-slate-400">
        An order in progress is not income. Revenue in{" "}
        <Link to="/expenses" className="font-semibold text-brand-700 hover:underline">
          Expenses &amp; Profit
        </Link>{" "}
        counts delivered orders only.
      </p>

      {invoice && (
        <Modal title={`Invoice ${invoice.reference}`} description="A summary of the order record" onClose={() => setInvoice(null)}>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kalika · Marketplace</p>
              <dl className="mt-3 space-y-2 text-xs">
                {[
                  ["Order", invoice.reference],
                  ["Product", invoice.product ?? "—"],
                  [tab === "sales" ? "Buyer" : "Seller", invoice.counterparty ?? "—"],
                  ["Quantity", invoice.quantity_kg != null ? `${invoice.quantity_kg} kg` : "—"],
                  ["Order date", shortDate(invoice.created_at)],
                  ["Status", invoice.status],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-semibold text-forest">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <dt className="font-bold text-forest">Amount</dt>
                  <dd className="text-base font-extrabold text-forest">{inr(invoice.amount_inr)}</dd>
                </div>
              </dl>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              This is a record summary generated from the order, not a GST tax invoice. For a tax invoice, use your
              own books or ask the seller for one.
            </p>
          </div>
        </Modal>
      )}
    </FarmerShell>
  );
}
