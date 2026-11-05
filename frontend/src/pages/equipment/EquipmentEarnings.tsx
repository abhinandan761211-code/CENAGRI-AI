import { useMemo, useState } from "react";
import { Download, IndianRupee, Plus, Receipt, Trash2, TrendingUp } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { InvoiceStatusPill, PaymentStatusPill, SectionHeading } from "@/components/equipment/ui";
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
  deleteExpense,
  describeEquipmentError,
  formatDate,
  formatINR,
  listBookings,
  listEquipment,
  listExpenses,
  listInvoices,
  todayISO,
} from "@/lib/equipment";
import type {
  Equipment,
  EquipmentBooking,
  EquipmentExpense,
  EquipmentInvoice,
  ExpenseKind,
} from "@/lib/equipment";

/**
 * Earnings & Payments.
 *
 * Revenue counts only invoices the backend marked `paid`. Expenses the owner
 * records are subtracted to show an estimated profit — and the label says
 * "estimated", because a fuel receipt typed in by hand is not an audited cost.
 */
export default function EquipmentEarnings() {
  const D = describeEquipmentError;
  const invoices = useWorkerData<EquipmentInvoice[]>(() => listInvoices(), [], D);
  const expenses = useWorkerData<EquipmentExpense[]>(() => listExpenses(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);

  const [tab, setTab] = useState<"earnings" | "expenses">("earnings");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const invoiceList = invoices.data ?? [];
  const expenseList = expenses.data ?? [];
  const bookingList = bookings.data ?? [];
  const equipmentList = equipment.data ?? [];

  const paid = invoiceList.filter((i) => i.status === "paid");
  const pending = invoiceList.filter((i) => i.status === "pending" || i.status === "processing");

  const totals = useMemo(() => {
    const revenue = paid.reduce((s, i) => s + Number(i.total_inr), 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = paid
      .filter((i) => new Date(i.paid_on ?? i.issued_on) >= monthStart)
      .reduce((s, i) => s + Number(i.total_inr), 0);
    const spend = expenseList.reduce((s, e) => s + Number(e.amount_inr), 0);
    return {
      revenue,
      thisMonth,
      pending: pending.reduce((s, i) => s + Number(i.total_inr), 0),
      refunded: invoiceList.filter((i) => i.status === "refunded").reduce((s, i) => s + Number(i.total_inr), 0),
      spend,
      profit: revenue - spend,
    };
  }, [paid, pending, invoiceList, expenseList]);

  /** Per-kind expense split, for the breakdown panel. */
  const byKind = useMemo(() => {
    const map = new Map<ExpenseKind, number>();
    for (const e of expenseList) map.set(e.kind, (map.get(e.kind) ?? 0) + Number(e.amount_inr));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenseList]);

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
      return { label: d.toLocaleDateString("en-IN", { month: "short" }), total };
    });
  }, [paid]);

  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  /** Bookings with a value but no invoice yet — owed, not earned. */
  const uninvoiced = useMemo(() => {
    const ids = new Set(invoiceList.map((i) => i.booking_id));
    return bookingList.filter(
      (b) => !ids.has(b.id) && Number(b.agreed_price_inr) > 0 && ["work_completed", "payment_confirmed", "closed"].includes(b.status)
    );
  }, [bookingList, invoiceList]);

  async function handleDeleteExpense(id: string) {
    setError("");
    try {
      await deleteExpense(id);
      expenses.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  function downloadInvoice(invoice: EquipmentInvoice) {
    const lines = [
      "Kalika — Equipment rental invoice",
      "",
      `Invoice: ${invoice.invoice_no}`,
      `Issued: ${formatDate(invoice.issued_on)}`,
      `Due: ${invoice.due_on ? formatDate(invoice.due_on) : "—"}`,
      `Status: ${invoice.status}`,
      `Amount: ${formatINR(Number(invoice.amount_inr))}`,
      `Tax: ${formatINR(Number(invoice.tax_inr))}`,
      `Total: ${formatINR(Number(invoice.total_inr))}`,
      invoice.reference ? `Reference: ${invoice.reference}` : "",
      "",
      "Generated from your Kalika records.",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoice_no}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (invoices.state === "loading") {
    return (
      <EquipmentLayout title="Earnings & Payments">
        <Loading label="Loading earnings…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout title="Earnings & Payments" subtitle="Revenue, expenses and estimated profit">
      {invoices.state === "error" && <ErrorNotice message={invoices.error} onRetry={invoices.reload} />}
      {error && <ErrorNotice message={error} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total revenue" value={formatINR(totals.revenue)} hint="Paid invoices only" icon={IndianRupee} tone="brand" />
        <StatCard label="This month" value={formatINR(totals.thisMonth)} hint="Settled this month" icon={TrendingUp} tone="brand" />
        <StatCard
          label="Pending payments"
          value={formatINR(totals.pending)}
          hint={`${pending.length} invoice(s)`}
          icon={Receipt}
          tone={pending.length > 0 ? "amber" : undefined}
        />
        <StatCard label="Expenses" value={formatINR(totals.spend)} hint="Recorded by you" icon={Receipt} />
        <StatCard
          label="Estimated profit"
          value={formatINR(totals.profit)}
          hint="Revenue − recorded expenses"
          icon={IndianRupee}
          tone={totals.profit < 0 ? "rose" : "brand"}
        />
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          An invoice is issued and marked paid by Kalika after the renter settles. You can read and
          download it, but you cannot mark it paid yourself, and no card details are ever stored here.
          Profit is <strong>estimated</strong> — it uses the expenses you recorded, not an audited ledger.
        </span>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {(["earnings", "expenses"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold capitalize transition ${tab === key ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
          >
            {key === "earnings" ? "Payments" : "Expenses"}
            <span className={`ml-1.5 text-[10px] ${tab === key ? "text-white/70" : "text-slate-400"}`}>
              {key === "earnings" ? invoiceList.length : expenseList.length}
            </span>
          </button>
        ))}
      </div>

      {tab === "earnings" && (
        <>
          <Panel title="Revenue overview" description="Paid rental revenue, last 6 months">
            {paid.length === 0 ? (
              <EmptyState
                icon={IndianRupee}
                title="No paid invoice yet"
                description="Revenue appears once a rental is completed and settled. Nothing is shown as earned before that."
              />
            ) : (
              <div className="flex h-36 items-end gap-2 p-4 sm:p-5">
                {monthly.map((m) => (
                  <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-slate-500">
                      {m.total > 0 ? formatINR(m.total) : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-brand-600"
                      style={{ height: `${Math.max((m.total / maxMonth) * 100, m.total > 0 ? 4 : 0)}%` }}
                    />
                    <span className="text-[10px] font-semibold text-slate-500">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Invoices" description="Read-only — issued by Kalika">
            {invoiceList.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No invoice issued yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {invoiceList.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] font-semibold text-forest">{inv.invoice_no}</p>
                      <p className="text-[10.5px] text-slate-500">
                        Issued {formatDate(inv.issued_on)}
                        {inv.due_on ? ` · due ${formatDate(inv.due_on)}` : ""}
                      </p>
                    </div>
                    <span className="text-[12px] font-bold text-forest">{formatINR(Number(inv.total_inr))}</span>
                    <InvoiceStatusPill status={inv.status} />
                    <button
                      type="button"
                      onClick={() => downloadInvoice(inv)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-3 w-3" /> Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {uninvoiced.length > 0 && (
            <Panel title="Awaiting invoice" description="Completed jobs with no invoice row yet">
              <ul className="divide-y divide-slate-100">
                {uninvoiced.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-semibold text-forest">
                        {b.equipment_title ?? "Machine"} · {b.renter_name ?? "Renter"}
                      </p>
                      <p className="text-[10px] text-slate-500">{formatDate(b.starts_on)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11.5px] font-bold text-amber-800">
                        {formatINR(Number(b.agreed_price_inr))}
                      </p>
                      <p className="text-[9.5px] text-slate-400">agreed, not invoiced</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Booking-wise earnings" description="Agreed value per rental">
            {bookingList.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No booking yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bookingList.slice(0, 12).map((b) => {
                  const inv = invoiceList.find((i) => i.booking_id === b.id);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-forest">
                          {b.equipment_title ?? "Machine"} · {b.renter_name ?? "Renter"}
                        </p>
                        <p className="text-[10.5px] text-slate-500">{formatDate(b.starts_on)}</p>
                      </div>
                      <PaymentStatusPill status={b.payment_status} />
                      <div className="text-right">
                        <p className="text-[12px] font-bold text-forest">{formatINR(Number(b.agreed_price_inr))}</p>
                        <p className="text-[9.5px] text-slate-400">{inv ? `inv ${inv.invoice_no}` : "not invoiced"}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}

      {tab === "expenses" && (
        <>
          <Panel
            title="Expenses"
            description="Fuel, operator, transport, maintenance and parts"
            action={
              <button
                type="button"
                onClick={() => setExpenseOpen(true)}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-2.5 text-[11.5px] font-semibold text-white hover:bg-brand-800"
              >
                <Plus className="h-3 w-3" /> Add expense
              </button>
            }
          >
            {expenseList.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No expense recorded"
                description="Record fuel, operator pay, transport and spare parts here. They are subtracted from paid revenue to estimate your profit — nothing is assumed."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {expenseList.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-semibold text-forest">
                        {EXPENSE_LABEL[e.kind]}
                        {e.estimated && (
                          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                            estimated
                          </span>
                        )}
                      </p>
                      <p className="text-[10.5px] text-slate-500">
                        {formatDate(e.spent_on)}
                        {e.note ? ` · ${e.note}` : ""}
                        {e.equipment_id ? ` · ${equipmentList.find((x) => x.id === e.equipment_id)?.title ?? ""}` : ""}
                      </p>
                    </div>
                    <span className="text-[12px] font-bold text-rose-700">
                      −{formatINR(Number(e.amount_inr))}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteExpense(e.id)}
                      aria-label="Delete expense"
                      className="shrink-0 rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {byKind.length > 0 && (
            <Panel title="Where the money goes" description="Estimated split by expense type">
              <ul className="space-y-2.5 p-4 sm:p-5">
                {byKind.map(([kind, amount]) => {
                  const max = Math.max(...byKind.map(([, a]) => a), 1);
                  return (
                    <li key={kind}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11.5px] font-semibold text-forest">{EXPENSE_LABEL[kind]}</span>
                        <span className="text-[11px] font-bold text-slate-600">{formatINR(amount)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-rose-400" style={{ width: `${(amount / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </>
      )}

      <section>
        <SectionHeading title="How a payment becomes revenue" />
        <Panel title="Order of operations">
          <ol className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
            <li>1. Work is completed and recorded on the booking.</li>
            <li>2. Kalika issues the invoice against that booking.</li>
            <li>3. The renter settles; the backend marks the invoice paid.</li>
            <li>4. Only then does the amount appear in revenue — never earlier.</li>
          </ol>
        </Panel>
      </section>

      {expenseOpen && (
        <ExpenseModal
          equipment={equipmentList}
          bookings={bookingList}
          onClose={() => setExpenseOpen(false)}
          onSaved={() => {
            setExpenseOpen(false);
            expenses.reload();
          }}
        />
      )}
    </EquipmentLayout>
  );
}

function ExpenseModal({
  equipment,
  bookings,
  onClose,
  onSaved,
}: {
  equipment: Equipment[];
  bookings: EquipmentBooking[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeEquipmentError;
  const [kind, setKind] = useState<ExpenseKind>("fuel");
  const [amount, setAmount] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [estimated, setEstimated] = useState(true);
  const [spentOn, setSpentOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addExpense({
        equipment_id: equipmentId || null,
        booking_id: bookingId || null,
        kind,
        amount_inr: value,
        estimated,
        note: note.trim() || null,
        spent_on: spentOn,
      });
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add expense" subtitle="Subtracted from revenue to estimate profit">
      <div className="space-y-3">
        <Field label="Type" required>
          <select value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)} className={inputClass}>
            {EXPENSE_KINDS.map((k) => (
              <option key={k} value={k}>
                {EXPENSE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)" required>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Date">
            <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Machine">
            <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={inputClass}>
              <option value="">Not machine specific</option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Booking">
            <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} className={inputClass}>
              <option value="">Not booking specific</option>
              {bookings.slice(0, 30).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.equipment_title ?? "Machine"} · {formatDate(b.starts_on)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <input
            type="checkbox"
            checked={estimated}
            onChange={(e) => setEstimated(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-700"
          />
          <span className="text-[11.5px] text-slate-700">
            This is an estimate, not a receipted cost
          </span>
        </label>

        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. diesel for paddy field job" />
        </Field>

        {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add expense"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
