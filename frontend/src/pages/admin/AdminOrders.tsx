import { Receipt, Undo2 } from "lucide-react";
import { useState } from "react";
import AdminListPage from "@/pages/admin/AdminListPage";
import { Badge, Button, Dialog, ErrorNotice, Field, inputClass, toneFor } from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

/**
 * One order, from either order table. The shop table (`retailer_orders`) keys
 * the shop as `retailer_id` and dates the row `placed_at`; the marketplace
 * table uses `buyer_id` / `seller_id` and `created_at`. Both are optional here
 * so one row type covers the two sources.
 */
type OrderRow = {
  id: string;
  retailer_id?: string;
  customer_id?: string;
  customer_name?: string | null;
  buyer_id?: string;
  seller_id?: string;
  amount_inr: number | null;
  status: string;
  placed_at?: string;
  created_at?: string;
};

/** Orders & transactions. Refunds are recorded decisions, never a card action. */
export default function AdminOrders() {
  const [source, setSource] = useState<"retailer" | "marketplace">("retailer");
  const [refund, setRefund] = useState<OrderRow | null>(null);

  const columns: Column<OrderRow>[] = [
    { key: "id", header: "Order", render: (row) => <code className="text-[11px] text-slate-600">{row.id.slice(0, 8)}</code> },
    {
      key: "party",
      header: "Party",
      render: (row) => <span className="text-[11.5px]">{row.customer_name ?? row.customer_id ?? row.buyer_id ?? "—"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => <span className="font-semibold">{row.amount_inr ? `₹${row.amount_inr.toLocaleString("en-IN")}` : "—"}</span>,
    },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.status)}>{row.status}</Badge> },
    {
      key: "date",
      header: "Placed",
      render: (row) => {
        const at = row.placed_at ?? row.created_at;
        return <span className="text-[11.5px]">{at ? new Date(at).toLocaleDateString("en-IN") : "—"}</span>;
      },
    },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: "retailer", label: "Shop orders" },
            { key: "marketplace", label: "Marketplace orders" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSource(tab.key)}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${source === tab.key ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AdminListPage<OrderRow>
        key={source}
        title="Orders & transactions"
        subtitle="Status changes and refund decisions are audited; money movement stays with the payment provider."
        module="orders"
        permission="orders.view"
        path="/business/orders"
        query={{ source }}
        columns={columns}
        rowKey={(row) => row.id}
        selects={[
          {
            label: "Status",
            param: "status",
            options: source === "retailer"
              ? ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"]
              : ["pending", "confirmed", "delivered", "cancelled"],
          },
        ]}
        searchParam=""
        emptyTitle="No orders"
        rowActions={(row) => (
          <Button variant="ghost" className="h-7 px-2 text-[11px]" icon={Undo2} onClick={() => setRefund(row)}>
            Refund
          </Button>
        )}
      />

      {refund && (
        <RefundDialog
          order={refund}
          source={source}
          onClose={() => setRefund(null)}
          onDone={() => setRefund(null)}
        />
      )}
    </>
  );
}

function RefundDialog({
  order,
  source,
  onClose,
  onDone,
}: {
  order: OrderRow;
  source: "retailer" | "marketplace";
  onClose: () => void;
  onDone: () => void;
}) {
  const total = order.amount_inr ?? 0;
  const [amount, setAmount] = useState(String(total));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount);
  const valid = value > 0 && value <= total && reason.trim().length >= 10;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/business/orders/${order.id}/refund`, {
        method: "POST",
        query: { source, amount: value, reason: reason.trim() },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The refund was not recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title="Record a refund"
      subtitle={`Order ${order.id.slice(0, 8)} · total ₹${total.toLocaleString("en-IN")}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={Receipt} disabled={!valid || busy} onClick={() => void submit()}>
            {busy ? "Recording…" : "Record refund"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
      <Field label="Refund amount (₹)" hint="Cannot exceed the order total." error={value > total ? "Larger than the order total." : undefined}>
        <input type="number" min={1} max={total} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
      </Field>
      <div className="mt-3">
        <Field label="Reason" hint="At least 10 characters — this is what finance reviews later.">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}
