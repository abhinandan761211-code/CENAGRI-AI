import { useMemo, useState } from "react";
import {
  Banknote,
  Download,
  IndianRupee,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { InvoiceStatusPill } from "@/components/transporter/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  StatCard,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  EXPENSE_KINDS,
  EXPENSE_LABEL,
  addExpense,
  awaitingInvoiceTotals,
  deleteExpense,
  describeTransporterError,
  earningsTotals,
  formatDate,
  formatINR,
  listBookings,
  listExpenses,
  listInvoices,
  tripProfit,
} from "@/lib/transporter";
import type {
  ExpenseKind,
  TransportBooking,
  TransportInvoice,
  TripExpense,
} from "@/lib/transporter";
import { todayISO } from "@/lib/worker";
import { Link } from "react-router-dom";

/**
 * Earnings & payments, with trip expenses alongside.
 *
 * The rule from the brief: a payment only counts once it is confirmed. This
 * screen therefore shows `paid` invoices as revenue and keeps pending /
 * processing money separate — the transporter cannot mark its own invoice paid
 * because the invoice table is read-only to them under RLS.
 *
 * Expenses are labelled as estimates or verified, so profit is never mistaken
 * for fact when the numbers are self-reported.
 */
export default function TransporterEarnings() {
  const D = describeTransporterError;

  const invoices = useWorkerData<TransportInvoice[]>(() => listInvoices(), [], D);
  const expenses = useWorkerData<TripExpense[]>(() => listExpenses(), [], D);
  const bookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);

  const [tab, setTab] = useState<"earnings" | "expenses">("earnings");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [bookingId, setBookingId] = useState("");
  const [kind, setKind] = useState<ExpenseKind>("fuel");
  const [amount, setAmount] = useState("");
  const [estimated, setEstimated] = useState(true);
  const [spentOn, setSpentOn] = useState(todayISO());
  const [note, setNote] = useState("");

  const invoiceList = invoices.data ?? [];
  const expenseList = expenses.data ?? [];
  const bookingList = bookings.data ?? [];

  const totals = earningsTotals(invoiceList);
  /** Delivered trips no invoice exists for yet — owed, but not revenue. */
  const awaiting = awaitingInvoiceTotals(bookingList, invoiceList);

  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleDateString("en-IN", { month: "short" });
      const total = invoiceList
        .filter((inv) => {
          if (inv.status !== "paid") return false;
          const at = new Date(inv.paid_on ?? inv.issued_on);
          return at.getFullYear() === d.getFullYear() && at.getMonth() === d.getMonth();
        })
        .reduce((sum, inv) => sum + Number(inv.amount_inr), 0);
      return { label, total };
    });
  }, [invoiceList]);

  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  /** Per-trip summary: agreed price, recorded expenses, resulting profit. */
  const tripSummaries = useMemo(
    () =>
      bookingList
        .filter((b) => b.status === "completed" || b.status === "delivered")
        .map((booking) => {
          const trips = expenseList.filter((e) => e.booking_id === booking.id);
          const spent = trips.reduce((s, e) => s + Number(e.amount_inr), 0);
          return {
            booking,
            spent,
            profit: tripProfit(booking, expenseList),
            expenseCount: trips.length,
          };
        })
        .sort((a, b) => b.booking.created_at.localeCompare(a.booking.created_at)),
    [bookingList, expenseList]
  );

  async function handleAddExpense() {
    const value = Number(amount);
    if (!bookingId) {
      setError("Choose the trip this expense belongs to.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the expense amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addExpense({
        booking_id: bookingId,
        kind,
        amount_inr: value,
        estimated,
        note: note.trim() || null,
        spent_on: spentOn,
      });
      setExpenseOpen(false);
      setAmount("");
      setNote("");
      expenses.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    try {
      await deleteExpense(id);
      expenses.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  function exportCsv() {
    const header = ["Issued", "Invoice", "Amount (INR)", "Status", "Paid on", "Reference"];
    const lines = invoiceList.map((inv) =>
      [
        formatDate(inv.issued_on),
        inv.invoice_no,
        Number(inv.amount_inr).toFixed(2),
        inv.status,
        inv.paid_on ? formatDate(inv.paid_on) : "",
        inv.reference ?? "",
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kalika-transporter-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const loading = invoices.state === "loading" || expenses.state === "loading";
  const failed = invoices.state === "error" ? invoices : expenses.state === "error" ? expenses : null;

  return (
    <TransporterLayout
      title="Earnings & Payments"
      subtitle="Invoices, confirmed payments and trip costs"
      action={
        invoiceList.length > 0 && tab === "earnings" ? (
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        ) : undefined
      }
    >
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
      {loading && <Loading label="Loading earnings…" />}
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}

      {!loading && !failed && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={IndianRupee}
              label="Total revenue"
              value={formatINR(totals.totalRevenue)}
              hint="Paid invoices only"
            />
            <StatCard
              icon={TrendingUp}
              label="This month"
              value={formatINR(totals.thisMonth)}
              hint="Paid this month"
            />
            <StatCard
              icon={Wallet}
              label="Pending"
              value={formatINR(totals.pending)}
              hint="Awaiting payment"
              tone="amber"
            />
            <StatCard
              icon={Banknote}
              label="Processing"
              value={formatINR(totals.processing)}
              hint="In settlement"
              tone="violet"
            />
          </section>

          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
            <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              An invoice is created and marked paid by Kalika after the requester confirms delivery.
              You can read it here but cannot mark it paid yourself.
              {awaiting.count > 0 && (
                <>
                  {" "}
                  <strong className="font-bold text-amber-800">
                    {awaiting.count} delivered {awaiting.count === 1 ? "trip" : "trips"} worth{" "}
                    {formatINR(awaiting.amount)} (agreed)
                  </strong>{" "}
                  {awaiting.count === 1 ? "is" : "are"} still awaiting an invoice — shown as agreed
                  value, not revenue.
                </>
              )}
            </span>
          </div>

          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
            {(["earnings", "expenses"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold capitalize transition ${tab === key
                    ? "bg-brand-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
              >
                {key === "earnings" ? "Payments" : "Trip expenses"}
                <span className={`ml-1.5 text-[10px] ${tab === key ? "text-white/70" : "text-slate-400"}`}>
                  {key === "earnings" ? invoiceList.length : expenseList.length}
                </span>
              </button>
            ))}
          </div>

          {tab === "earnings" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Last 6 months" description="Paid revenue per month">
                <div className="p-4">
                  <div className="flex h-32 items-end gap-2">
                    {monthly.map((m) => (
                      <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[9px] font-bold text-slate-500">
                          {m.total > 0 ? formatINR(m.total) : ""}
                        </span>
                        <div
                          className="w-full rounded-t-md bg-brand-600"
                          style={{ height: `${Math.max(2, (m.total / maxMonth) * 90)}px` }}
                          title={`${m.label}: ${formatINR(m.total)}`}
                        />
                        <span className="text-[10px] font-semibold text-slate-500">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel title="Payment history" description={`${invoiceList.length} invoice(s)`} className="lg:col-span-2">
                {invoiceList.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title="No invoices yet"
                    description="An invoice appears after you complete a trip and the requester confirms delivery."
                  />
                ) : (
                  <>
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full text-left text-[11.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2 font-bold">Invoice</th>
                            <th className="px-4 py-2 font-bold">Issued</th>
                            <th className="px-4 py-2 text-right font-bold">Amount</th>
                            <th className="px-4 py-2 font-bold">Status</th>
                            <th className="px-4 py-2 font-bold">Paid on</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {invoiceList.map((inv) => (
                            <tr key={inv.id} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 font-mono text-[10.5px] text-slate-700">
                                {inv.invoice_no}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                                {formatDate(inv.issued_on)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-forest">
                                {formatINR(Number(inv.amount_inr))}
                              </td>
                              <td className="px-4 py-2.5">
                                <InvoiceStatusPill status={inv.status} />
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                                {inv.paid_on ? formatDate(inv.paid_on) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <ul className="divide-y divide-slate-100 sm:hidden">
                      {invoiceList.map((inv) => (
                        <li key={inv.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-[11px] text-slate-700">
                                {inv.invoice_no}
                              </p>
                              <p className="text-[10.5px] text-slate-500">{formatDate(inv.issued_on)}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[12.5px] font-bold text-forest">
                                {formatINR(Number(inv.amount_inr))}
                              </p>
                              <InvoiceStatusPill status={inv.status} />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Panel>
            </div>
          )}

          {tab === "expenses" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel
                title="Trip expenses"
                description="Fuel, tolls and other costs"
                className="lg:col-span-2"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setBookingId("");
                      setExpenseOpen(true);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3 w-3" /> Add expense
                  </button>
                }
              >
                {expenseList.length === 0 ? (
                  <EmptyState
                    icon={Banknote}
                    title="No expenses recorded"
                    description="Record fuel, tolls and loading costs to see the real profit on each trip."
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {expenseList.map((expense) => {
                      const booking = bookingList.find((b) => b.id === expense.booking_id);
                      return (
                        <li key={expense.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold text-forest">
                              {EXPENSE_LABEL[expense.kind]}
                              {booking ? ` · ${booking.title}` : ""}
                            </p>
                            <p className="truncate text-[10.5px] text-slate-500">
                              {formatDate(expense.spent_on)}
                              {expense.note ? ` · ${expense.note}` : ""}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${expense.estimated
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                              }`}
                          >
                            {expense.estimated ? "Estimate" : "Verified"}
                          </span>
                          <span className="shrink-0 text-[12px] font-bold text-forest">
                            {formatINR(Number(expense.amount_inr))}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDelete(expense.id)}
                            aria-label="Delete expense"
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Trip profit" description="Agreed price minus recorded expenses">
                {tripSummaries.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
                    Complete a trip to see its profit.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {tripSummaries.slice(0, 8).map(({ booking, spent, profit, expenseCount }) => (
                      <li key={booking.id} className="px-3.5 py-2.5">
                        <p className="truncate text-[11.5px] font-semibold text-forest">{booking.title}</p>
                        <div className="mt-0.5 flex items-center justify-between text-[10.5px]">
                          <span className="text-slate-500">
                            {formatINR(Number(booking.agreed_price_inr))} − {formatINR(spent)}
                            {expenseCount === 0 ? " (no expenses)" : ""}
                          </span>
                          <span
                            className={`font-bold ${profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}
                          >
                            {formatINR(profit)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}
        </>
      )}

      {/* ── Add expense ── */}
      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Add trip expense">
        <div className="space-y-3">
          <Field label="Trip" required>
            <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} className={inputClass}>
              <option value="">Choose a trip</option>
              {bookingList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} · {formatDate(b.created_at)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Expense type" required>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ExpenseKind)}
                className={inputClass}
              >
                {EXPENSE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {EXPENSE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (₹)" required>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
                placeholder="e.g. 2400"
              />
            </Field>
          </div>
          <Field label="Date">
            <input
              type="date"
              value={spentOn}
              max={todayISO()}
              onChange={(e) => setSpentOn(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              placeholder="e.g. Diesel at Supaul pump"
              maxLength={200}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={estimated}
              onChange={(e) => setEstimated(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-700"
            />
            <span className="text-[11.5px] font-semibold text-slate-700">
              This is an estimate (not a receipt)
            </span>
          </label>
          {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setExpenseOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAddExpense()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Add expense"}
            </button>
          </div>
        </div>
      </Modal>

      {invoiceList.length === 0 && tripSummaries.length === 0 && (
        <p className="text-[11px] text-slate-500">
          Looking for bookings?{" "}
          <Link to={TRANSPORTER_ROUTES.bookings} className="font-bold text-brand-700 hover:underline">
            Open My Bookings
          </Link>
          .
        </p>
      )}
    </TransporterLayout>
  );
}
