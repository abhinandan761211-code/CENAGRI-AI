import { useMemo } from "react";
import { IndianRupee, Receipt, TrendingUp } from "lucide-react";
import WarehouseLayout, { WAREHOUSE_ROUTES } from "@/components/warehouse/WarehouseLayout";
import { InvoiceStatusPill, PaymentStatusPill, SectionHeading } from "@/components/warehouse/ui";
import { EmptyState, ErrorNotice, Loading, Panel, StatCard } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeWarehouseError,
  formatDate,
  formatINR,
  listInvoices,
  listStorageBookings,
} from "@/lib/warehouse";
import type { StorageBooking, StorageInvoice } from "@/lib/warehouse";

/**
 * Earnings & Payments.
 *
 * Only a `paid` invoice times as revenue. An invoice is written by the Kalika
 * backend and marked paid there too — this page reads it and nothing more, so a
 * warehouse owner can never declare itself paid.
 *
 * Booking values that have no invoice yet are shown separately, and labelled as
 * "agreed" rather than earned.
 */
export default function WarehouseEarnings() {
  const D = describeWarehouseError;
  const invoices = useWorkerData<StorageInvoice[]>(() => listInvoices(), [], D);
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);

  const invoiceList = invoices.data ?? [];
  const bookingList = bookings.data ?? [];

  const paid = invoiceList.filter((i) => i.status === "paid");
  const pending = invoiceList.filter((i) => i.status === "pending");
  const processing = invoiceList.filter((i) => i.status === "processing");

  const totals = useMemo(() => {
    const revenue = paid.reduce((s, i) => s + Number(i.total_inr), 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = paid
      .filter((i) => new Date(i.paid_on ?? i.issued_on) >= monthStart)
      .reduce((s, i) => s + Number(i.total_inr), 0);
    return {
      revenue,
      thisMonth,
      pending: pending.reduce((s, i) => s + Number(i.total_inr), 0),
      processing: processing.reduce((s, i) => s + Number(i.total_inr), 0),
      refunded: invoiceList
        .filter((i) => i.status === "refunded")
        .reduce((s, i) => s + Number(i.total_inr), 0),
    };
  }, [paid, pending, processing, invoiceList]);

  /** Delivered stock with no invoice row yet — owed, but not counted as revenue. */
  const uninvoiced = useMemo(() => {
    const invoiceBookingIds = new Set(invoiceList.map((i) => i.booking_id));
    return bookingList.filter(
      (b) =>
        ["fully_released", "completed", "stored"].includes(b.status) &&
        !invoiceBookingIds.has(b.id) &&
        Number(b.agreed_price_inr) > 0
    );
  }, [bookingList, invoiceList]);

  const awaitingAmount = uninvoiced.reduce((s, b) => s + Number(b.agreed_price_inr), 0);

  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const total = paid
        .filter((inv) => {
          const at = new Date(inv.paid_on ?? inv.issued_on);
          return at.getFullYear() === d.getFullYear() && at.getMonth() === d.getMonth();
        })
        .reduce((s, inv) => s + Number(inv.total_inr), 0);
      return {
        label: d.toLocaleDateString("en-IN", { month: "short" }),
        total,
      };
    });
  }, [paid]);

  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  if (invoices.state === "loading") {
    return (
      <WarehouseLayout title="Earnings & Payments">
        <Loading label="Loading payments…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Earnings & Payments"
      subtitle="Storage revenue, invoices and outstanding balances"
      action={
        <a
          href={WAREHOUSE_ROUTES.documents}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Receipt className="h-3.5 w-3.5" /> Documents
        </a>
      }
    >
      {invoices.state === "error" && <ErrorNotice message={invoices.error} onRetry={invoices.reload} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total revenue" value={formatINR(totals.revenue)} hint="Paid invoices only" icon={IndianRupee} tone="brand" />
        <StatCard label="This month" value={formatINR(totals.thisMonth)} hint="Paid this month" icon={TrendingUp} tone="brand" />
        <StatCard
          label="Pending"
          value={formatINR(totals.pending)}
          hint={`${pending.length} invoice(s)`}
          icon={Receipt}
          tone={pending.length > 0 ? "amber" : undefined}
        />
        <StatCard label="Processing" value={formatINR(totals.processing)} hint={`${processing.length} in flight`} icon={Receipt} />
        <StatCard
          label="Awaiting invoice"
          value={formatINR(awaitingAmount)}
          hint={`${uninvoiced.length} released booking(s)`}
          icon={Receipt}
          tone={uninvoiced.length > 0 ? "amber" : undefined}
        />
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          An invoice is issued and marked paid by Kalika after a release is confirmed. You can read and
          download it, but you cannot mark it paid yourself — and no card details are ever stored in this
          app.
        </span>
      </div>

      <Panel title="Revenue overview" description="Paid storage revenue, last 6 months">
        {paid.length === 0 ? (
          <EmptyState
            icon={IndianRupee}
            title="No paid invoice yet"
            description="Revenue appears once a booking is released and the invoice is settled. Nothing is shown as earned before that."
          />
        ) : (
          <div className="p-4 sm:p-5">
            <div className="flex h-36 items-end gap-2">
              {monthly.map((m) => (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] font-bold text-slate-500">
                    {m.total > 0 ? formatINR(m.total) : ""}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-brand-600 transition-all"
                    style={{ height: `${Math.max((m.total / maxMonth) * 100, m.total > 0 ? 4 : 0)}%` }}
                    title={formatINR(m.total)}
                  />
                  <span className="text-[10px] font-semibold text-slate-500">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <section>
        <SectionHeading title="Invoices" hint="Read-only — issued by Kalika" />
        <Panel title="All invoices" description={`${invoiceList.length} record(s)`}>
          {invoiceList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No invoice has been issued yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-[11.5px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-bold">Invoice</th>
                    <th className="px-4 py-2 font-bold">Issued</th>
                    <th className="px-4 py-2 font-bold">Due</th>
                    <th className="px-4 py-2 font-bold">Amount</th>
                    <th className="px-4 py-2 font-bold">Tax</th>
                    <th className="px-4 py-2 font-bold">Total</th>
                    <th className="px-4 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoiceList.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-mono text-[10.5px] font-bold text-forest">
                        {inv.invoice_no}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(inv.issued_on)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{inv.due_on ? formatDate(inv.due_on) : "—"}</td>
                      <td className="px-4 py-2.5 text-slate-700">{formatINR(Number(inv.amount_inr))}</td>
                      <td className="px-4 py-2.5 text-slate-700">{formatINR(Number(inv.tax_inr))}</td>
                      <td className="px-4 py-2.5 font-bold text-forest">{formatINR(Number(inv.total_inr))}</td>
                      <td className="px-4 py-2.5">
                        <InvoiceStatusPill status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      <Panel title="Booking-wise value" description="What each booking is worth, before and after invoicing">
        {bookingList.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No bookings yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bookingList.slice(0, 12).map((b) => {
              const inv = invoiceList.find((i) => i.booking_id === b.id);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {b.crop_name ?? "Crop"} · {b.depositor_name ?? "Depositor"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {b.warehouse_name ?? "—"} · {formatDate(b.starts_on)}
                    </p>
                  </div>
                  <PaymentStatusPill status={b.payment_status} />
                  <div className="text-right">
                    <p className="text-[12px] font-bold text-forest">
                      {formatINR(Number(b.agreed_price_inr))}
                    </p>
                    <p className="text-[9.5px] text-slate-400">
                      {inv ? `inv ${inv.invoice_no}` : "not invoiced"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {totals.refunded > 0 && (
        <Panel title="Refunds" description="Recorded against your account">
          <p className="px-4 py-3 text-[11.5px] text-slate-600">
            {formatINR(totals.refunded)} has been refunded across {invoiceList.filter((i) => i.status === "refunded").length}{" "}
            invoice(s). Refunds are processed by Kalika support, never from this screen.
          </p>
        </Panel>
      )}
    </WarehouseLayout>
  );
}
