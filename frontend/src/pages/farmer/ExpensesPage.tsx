import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  BarChart3,
  CalendarRange,
  Info,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  inr,
  Input,
  LoadingRows,
  Modal,
  PageHeader,
  Panel,
  PrimaryButton,
  ProgressBar,
  Select,
  shortDate,
  Stat,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import { listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import {
  deleteExpense,
  EXPENSE_CATEGORIES,
  farmerError,
  label,
  listExpenses,
  saveExpense,
} from "@/lib/farmer";
import type { ExpenseCategory, FarmExpense } from "@/lib/farmer";
import { farm } from "@/lib/farmerOrders";

/**
 * Expenses & Profit.
 *
 * Cost side  : the farmer's own expense rows (seeds, fertiliser, labour …).
 * Income side: **delivered** marketplace orders only.
 *
 * Revenue is never estimated. If nothing has been sold, profit shows
 * "Not known yet" with the reason — never a ₹0 that looks like break-even.
 */

const QUICK_RANGE = [
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "season", label: "This season" },
  { key: "all", label: "All time" },
] as const;

type Preset = (typeof QUICK_RANGE)[number]["key"];

/** Kharif (Jun–Oct) / Rabi (Nov–Mar) / Zaid (Apr–May), the usual Indian split. */
function seasonStart(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 6 && m <= 10) return `${y}-06-01`;
  if (m >= 11) return `${y}-11-01`;
  if (m <= 3) return `${y - 1}-11-01`;
  return `${y}-04-01`;
}

function presetRange(preset: Preset): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  if (preset === "30") return { from: addDays(to, -30), to };
  if (preset === "90") return { from: addDays(to, -90), to };
  if (preset === "season") return { from: seasonStart(), to };
  return { from: "2000-01-01", to };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Draft = {
  category: ExpenseCategory;
  amount: string;
  spent_on: string;
  vendor: string;
  note: string;
  crop_id: string;
};

const emptyDraft = (): Draft => ({
  category: "seeds",
  amount: "",
  spent_on: new Date().toISOString().slice(0, 10),
  vendor: "",
  note: "",
  crop_id: "",
});

export default function ExpensesPage() {
  const { user } = useAuth();
  const { toast, showToast } = useToast();

  const [expenses, setExpenses] = useState<FarmExpense[]>([]);
  const [sales, setSales] = useState<{ amount_inr: number; status: string; created_at: string }[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [preset, setPreset] = useState<Preset>("season");
  const [range, setRange] = useState(presetRange("season"));

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FarmExpense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [expenseRows, cropRows, farmRows, saleRows] = await Promise.all([
        listExpenses(),
        listCrops().catch(() => []),
        listFarms().catch(() => []),
        farm.listSales().catch(() => []),
      ]);
      setExpenses(expenseRows);
      setCrops(cropRows);
      setFarms(farmRows);
      setSales(saleRows);
    } catch (err) {
      setError(farmerError(err, "Could not load your finances."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const cropName = useMemo(() => new Map(crops.map((c) => [c.id, c.name])), [crops]);
  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms]);

  const inRange = useMemo(
    () => expenses.filter((e) => e.spent_on >= range.from && e.spent_on <= range.to),
    [expenses, range]
  );

  const revenueInRange = useMemo(
    () => sales.filter((s) => s.created_at.slice(0, 10) >= range.from && s.created_at.slice(0, 10) <= range.to),
    [sales, range]
  );

  const totals = useMemo(() => {
    const spent = inRange.reduce((sum, e) => sum + Number(e.amount_inr), 0);
    const delivered = revenueInRange
      .filter((s) => s.status === "delivered")
      .reduce((sum, s) => sum + s.amount_inr, 0);
    const pending = revenueInRange
      .filter((s) => s.status === "pending" || s.status === "confirmed")
      .reduce((sum, s) => sum + s.amount_inr, 0);

    const byCategory = new Map<string, number>();
    for (const e of inRange) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount_inr));

    const byCrop = new Map<string, number>();
    for (const e of inRange) {
      const key = e.crop_id ? cropName.get(e.crop_id) ?? "Removed crop" : "Not assigned";
      byCrop.set(key, (byCrop.get(key) ?? 0) + Number(e.amount_inr));
    }

    return {
      spent,
      delivered,
      pending,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
      byCrop: [...byCrop.entries()].sort((a, b) => b[1] - a[1]),
      net: spent === 0 && delivered === 0 ? null : delivered - spent,
    };
  }, [inRange, revenueInRange, cropName]);

  const maxCategory = totals.byCategory[0]?.[1] ?? 1;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter the amount you actually spent.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await saveExpense({
        category: draft.category,
        amount_inr: amount,
        spent_on: draft.spent_on,
        vendor: draft.vendor || null,
        note: draft.note || null,
        crop_id: draft.crop_id || null,
      });
      setDraft(null);
      showToast("Expense added");
      await load();
    } catch (err) {
      setFormError(farmerError(err, "Could not save the expense."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteExpense(confirmDelete.id);
      setConfirmDelete(null);
      showToast("Expense deleted");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not delete the expense."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Wallet}
        title="Expenses & Profit"
        description="What each season cost — seed, fertiliser, labour, water, machinery and transport — against what was actually sold."
        meta={
          <>
            <Chip tone="slate" icon={CalendarRange}>
              {shortDate(range.from)} – {shortDate(range.to)}
            </Chip>
            <Chip tone="blue">Revenue counts delivered sales only</Chip>
          </>
        }
        actions={
          <PrimaryButton onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" /> Add expense
          </PrimaryButton>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_RANGE.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              setPreset(option.key);
              setRange(presetRange(option.key));
            }}
            aria-pressed={preset === option.key}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              preset === option.key
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
            }`}
          >
            {option.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <input
            type="date"
            value={range.from}
            onChange={(e) => {
              setPreset("all");
              setRange({ ...range, from: e.target.value });
            }}
            aria-label="From date"
            className="h-8 rounded-md border border-slate-300 px-2 text-[11px]"
          />
          <span className="text-[11px] text-slate-400">to</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
            aria-label="To date"
            className="h-8 rounded-md border border-slate-300 px-2 text-[11px]"
          />
        </div>
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Expenses"
          value={loading ? "…" : totals.spent ? inr(totals.spent) : "—"}
          icon={Wallet}
          tone="amber"
          hint={`${inRange.length} records`}
        />
        <Stat
          label="Confirmed revenue"
          value={loading ? "…" : totals.delivered ? inr(totals.delivered) : "—"}
          icon={TrendingUp}
          tone="green"
          hint="Delivered orders only"
        />
        <Stat
          label="Orders pending"
          value={loading ? "…" : totals.pending ? inr(totals.pending) : "—"}
          icon={Receipt}
          tone="blue"
          hint="Not counted as income"
        />
        <Stat
          label="Net profit"
          value={loading ? "…" : totals.net == null ? "Not known yet" : inr(totals.net)}
          icon={totals.net != null && totals.net < 0 ? TrendingDown : Banknote}
          tone={totals.net == null ? "slate" : totals.net < 0 ? "amber" : "green"}
          hint={totals.net == null ? "No sales recorded yet" : "Delivered sales − expenses"}
        />
      </div>

      {totals.net == null && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-[11px] leading-relaxed text-slate-600">
            <strong className="text-forest">Profit cannot be calculated yet.</strong> No completed (delivered)
            marketplace sale is recorded in this period, so there is no confirmed income to compare against your
            costs. An order that is merely placed is not income — it is listed separately above.
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Expenses"
          description="Newest first, in the selected period"
          icon={Receipt}
        >
          {loading ? (
            <LoadingRows rows={5} />
          ) : inRange.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No expenses in this period"
              body="Record what you actually spent — seed, fertiliser, labour, diesel, rent — and the season's cost appears here."
              action={
                <PrimaryButton onClick={() => setDraft(emptyDraft())}>
                  <Plus className="h-4 w-4" /> Add expense
                </PrimaryButton>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {inRange.slice(0, 60).map((expense) => (
                <li key={expense.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-700">
                    <Wallet className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-forest">
                      {label(expense.category)}
                      {expense.vendor ? ` · ${expense.vendor}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {shortDate(expense.spent_on)}
                      {expense.crop_id ? ` · ${cropName.get(expense.crop_id) ?? "Crop"}` : ""}
                      {expense.farm_id ? ` · ${farmName.get(expense.farm_id) ?? ""}` : ""}
                      {expense.note ? ` · ${expense.note}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-slate-700">{inr(Number(expense.amount_inr))}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(expense)}
                    aria-label="Delete expense"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="By category" description="Where the money went" icon={BarChart3}>
            {totals.byCategory.length === 0 ? (
              <p className="px-4 py-6 text-[11px] text-slate-500">No expenses recorded in this period.</p>
            ) : (
              <ul className="space-y-2.5 p-4">
                {totals.byCategory.map(([category, amount]) => (
                  <li key={category}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-forest">{label(category)}</span>
                      <span className="tabular-nums text-slate-600">
                        {inr(amount)}
                        <span className="ml-1 text-slate-400">
                          {totals.spent ? `(${Math.round((amount / totals.spent) * 100)}%)` : ""}
                        </span>
                      </span>
                    </div>
                    <ProgressBar value={(amount / maxCategory) * 100} tone="amber" label={`${category} share`} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="By crop" description="Cost against the crop it belongs to" icon={BarChart3}>
            {totals.byCrop.length === 0 ? (
              <p className="px-4 py-6 text-[11px] text-slate-500">Assign expenses to a crop to see this split.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {totals.byCrop.slice(0, 8).map(([crop, amount]) => (
                  <li key={crop} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="truncate text-[11px] font-semibold text-forest">{crop}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-600">{inr(amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          <strong className="text-forest">How this is calculated.</strong> Income = the amount on orders marked
          <em> delivered</em> in this period. Costs = the expense rows you entered. Equipment hire, transport and
          storage booked through CenAGRI are not added automatically — record them here if you paid. Revenue is
          never estimated.{" "}
          <Link to="/orders-sales" className="font-semibold text-brand-700 hover:underline">
            See orders
          </Link>
        </p>
      </div>

      {draft && (
        <Modal
          title="Add an expense"
          onClose={() => setDraft(null)}
          footer={
            <>
              <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="expense-form" disabled={saving}>
                {saving ? "Saving…" : "Save expense"}
              </PrimaryButton>
            </>
          }
        >
          <form id="expense-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Category</span>
              <Select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory })}
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {label(category)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Amount (₹) <span className="text-rose-500">*</span>
              </span>
              <Input
                type="number"
                min="1"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Date</span>
              <Input
                type="date"
                value={draft.spent_on}
                onChange={(e) => setDraft({ ...draft, spent_on: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Crop</span>
              <Select value={draft.crop_id} onChange={(e) => setDraft({ ...draft, crop_id: e.target.value })}>
                <option value="">Not assigned</option>
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Paid to (optional)
              </span>
              <Input
                value={draft.vendor}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
                placeholder="Shop, labour group, contractor"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Note</span>
              <Input
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="e.g. 2 bags urea"
              />
            </label>

            {formError && (
              <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete this expense?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <GhostButton onClick={() => setConfirmDelete(null)}>Keep it</GhostButton>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                className="h-9 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                Delete
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            {label(confirmDelete.category)} · {inr(Number(confirmDelete.amount_inr))} on{" "}
            {shortDate(confirmDelete.spent_on)} will be removed. Your reports will update immediately.
          </p>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}
