import { useState } from "react";
import { Calculator, Plus, Tag } from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import { SectionHeading } from "@/components/warehouse/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  BILLING_UNITS,
  BILLING_UNIT_LABEL,
  COMMODITY_CATEGORIES,
  COMMODITY_LABEL,
  createPricingPlan,
  describeWarehouseError,
  formatINR,
  formatWeight,
  listPricingPlans,
  listWarehouses,
  quoteCost,
  updatePricingPlan,
} from "@/lib/warehouse";
import type {
  BillingUnit,
  CommodityCategory,
  StoragePricingPlan,
  Warehouse,
} from "@/lib/warehouse";

/**
 * Pricing & Storage Plans.
 *
 * The rate is stored on the plan and the quotation is itemised from it, so the
 * customer is shown a full breakdown before confirming. There is no field for an
 * undisclosed charge — every add-on has to be one of the named services.
 */
export default function WarehousePricing() {
  const D = describeWarehouseError;
  const plans = useWorkerData<StoragePricingPlan[]>(() => listPricingPlans(), [], D);
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StoragePricingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const planList = plans.data ?? [];
  const warehouseList = warehouses.data ?? [];

  async function handleToggle(plan: StoragePricingPlan) {
    setError("");
    try {
      await updatePricingPlan(plan.id, { is_active: !plan.is_active });
      plans.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  if (plans.state === "loading") {
    return (
      <WarehouseLayout title="Pricing & Storage Plans">
        <Loading label="Loading pricing…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Pricing & Storage Plans"
      subtitle="Rates shown to customers before they book"
      action={
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setError("");
            setFormOpen(true);
          }}
          disabled={warehouseList.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add plan
        </button>
      }
    >
      {plans.state === "error" && <ErrorNotice message={plans.error} onRetry={plans.reload} />}
      {error && <ErrorNotice message={error} />}

      <CalculatorPanel plans={planList} />

      <section>
        <SectionHeading title="Storage plans" hint="One or more per warehouse" />
        {planList.length === 0 ? (
          <Panel title="Plans">
            <EmptyState
              icon={Tag}
              title="No pricing plan yet"
              description="Add a plan so quotations can be generated with a transparent breakdown. Without one you have to type every price by hand and the customer sees no suggested rate."
              action={
                warehouseList.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setFormOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add plan
                  </button>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {planList.map((plan) => {
              const wh = warehouseList.find((w) => w.id === plan.warehouse_id);
              return (
                <Panel
                  key={plan.id}
                  title={plan.name}
                  description={`${wh?.name ?? "Warehouse"} · ${COMMODITY_LABEL[plan.commodity_category]}`}
                  action={
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleToggle(plan)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          plan.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {plan.is_active ? "Active" : "Paused"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(plan);
                          setFormOpen(true);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  }
                >
                  <div className="space-y-2 p-4 text-[11.5px]">
                    <p className="text-[18px] font-extrabold text-forest">
                      {formatINR(Number(plan.rate_inr), 2)}
                      <span className="ml-1 text-[10.5px] font-semibold text-slate-500">
                        {BILLING_UNIT_LABEL[plan.billing_unit].toLowerCase()}
                      </span>
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
                      <Row label="Minimum stay" value={`${plan.minimum_days} days`} />
                      <Row
                        label="Cold premium"
                        value={plan.cold_premium_pct > 0 ? `+${plan.cold_premium_pct}%` : "None"}
                      />
                      <Row label="Loading" value={formatINR(Number(plan.loading_rate_inr))} />
                      <Row label="Unloading" value={formatINR(Number(plan.unloading_rate_inr))} />
                      <Row label="Handling" value={formatINR(Number(plan.handling_rate_inr))} />
                      {plan.other_service_label && (
                        <Row
                          label={plan.other_service_label}
                          value={formatINR(Number(plan.other_service_rate_inr))}
                        />
                      )}
                    </dl>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      <Panel title="No hidden fees" description="How a customer sees your price">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• The quotation lists storage, loading, unloading, handling and any named extra separately.</li>
          <li>• The total is the sum of those lines — a fee cannot appear after confirmation.</li>
          <li>• The minimum stay in the plan is applied to the quotation exactly as it would be on the invoice.</li>
          <li>• Pausing a plan hides it from new quotations; existing bookings keep the price they were quoted.</li>
        </ul>
      </Panel>

      {formOpen && (
        <PlanModal
          key={editing?.id ?? "new"}
          warehouses={warehouseList}
          plan={editing}
          busy={busy}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            plans.reload();
          }}
          onBusy={setBusy}
        />
      )}
    </WarehouseLayout>
  );
}

/* ── Cost calculator ───────────────────────────────────────────────────── */

function CalculatorPanel({ plans }: { plans: StoragePricingPlan[] }) {
  const active = plans.filter((p) => p.is_active);
  const [planId, setPlanId] = useState(active[0]?.id ?? "");
  const [quantityT, setQuantityT] = useState("10");
  const [days, setDays] = useState("90");
  const [isCold, setIsCold] = useState(false);
  const [includeLoading, setIncludeLoading] = useState(true);

  const plan = active.find((p) => p.id === planId) ?? active[0] ?? null;
  const quantityKg = (Number(quantityT) || 0) * 1000;
  const durationDays = Number(days) || 0;

  const cost =
    plan && quantityKg > 0 && durationDays > 0
      ? quoteCost({ plan, quantityKg, days: durationDays, isCold, includeLoading })
      : null;

  if (active.length === 0) {
    return (
      <Panel title="Price calculator" description="Add a plan to preview customer pricing">
        <p className="px-4 py-6 text-center text-[11.5px] text-slate-500">
          No active plan yet, so there is nothing to calculate.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Price calculator" description="What a customer would pay — nothing is saved">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Plan">
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {COMMODITY_LABEL[p.commodity_category]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quantity (metric tonnes)">
              <input
                value={quantityT}
                onChange={(e) => setQuantityT(e.target.value)}
                className={inputClass}
                inputMode="decimal"
              />
            </Field>
            <Field label="Storage days">
              <input value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} inputMode="numeric" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-[11.5px] text-slate-700">
              <input
                type="checkbox"
                checked={isCold}
                onChange={(e) => setIsCold(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-700"
              />
              Cold-chain storage
            </label>
            <label className="flex items-center gap-1.5 text-[11.5px] text-slate-700">
              <input
                type="checkbox"
                checked={includeLoading}
                onChange={(e) => setIncludeLoading(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-700"
              />
              Include loading
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Calculator className="h-3 w-3" /> Cost breakdown
          </p>
          {cost ? (
            <dl className="mt-2 space-y-1 text-[11.5px]">
              <Line label={`Storage · ${cost.billableDays} billable days`} value={formatINR(cost.storage)} />
              {cost.loading > 0 && <Line label="Loading" value={formatINR(cost.loading)} />}
              {cost.unloading > 0 && <Line label="Unloading" value={formatINR(cost.unloading)} />}
              {cost.handling > 0 && <Line label="Handling" value={formatINR(cost.handling)} />}
              {cost.other > 0 && <Line label={cost.otherLabel ?? "Other service"} value={formatINR(cost.other)} />}
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-[13px] font-extrabold text-forest">
                <span>Total</span>
                <span>{formatINR(cost.total)}</span>
              </div>
              <p className="pt-1 text-[10px] text-slate-400">
                For {formatWeight(quantityKg)} over {durationDays} requested days.
              </p>
            </dl>
          ) : (
            <p className="mt-2 text-[11.5px] text-slate-500">
              Enter a quantity and duration to see the price.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ── Plan form ─────────────────────────────────────────────────────────── */

function PlanModal({
  warehouses,
  plan,
  busy,
  onClose,
  onSaved,
  onBusy,
}: {
  warehouses: Warehouse[];
  plan: StoragePricingPlan | null;
  busy: boolean;
  onClose: () => void;
  onSaved: () => void;
  onBusy: (value: boolean) => void;
}) {
  const D = describeWarehouseError;
  const [warehouseId, setWarehouseId] = useState(plan?.warehouse_id ?? warehouses[0]?.id ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [category, setCategory] = useState<CommodityCategory>(plan?.commodity_category ?? "grain");
  const [unit, setUnit] = useState<BillingUnit>(plan?.billing_unit ?? "quintal_day");
  const [rate, setRate] = useState(plan ? String(plan.rate_inr) : "");
  const [minimumDays, setMinimumDays] = useState(plan ? String(plan.minimum_days) : "30");
  const [fixedDays, setFixedDays] = useState(plan?.fixed_period_days ? String(plan.fixed_period_days) : "");
  const [coldPremium, setColdPremium] = useState(plan ? String(plan.cold_premium_pct) : "0");
  const [loading, setLoading] = useState(plan ? String(plan.loading_rate_inr) : "0");
  const [unloading, setUnloading] = useState(plan ? String(plan.unloading_rate_inr) : "0");
  const [handling, setHandling] = useState(plan ? String(plan.handling_rate_inr) : "0");
  const [otherLabel, setOtherLabel] = useState(plan?.other_service_label ?? "");
  const [otherRate, setOtherRate] = useState(plan ? String(plan.other_service_rate_inr) : "0");
  const [error, setError] = useState("");

  async function handleSave() {
    if (name.trim().length < 2) {
      setError("Give the plan a name, e.g. Paddy — Rabi season.");
      return;
    }
    if (!Number.isFinite(Number(rate)) || Number(rate) < 0) {
      setError("Enter a valid rate.");
      return;
    }
    onBusy(true);
    setError("");
    try {
      const payload = {
        warehouse_id: warehouseId,
        name: name.trim(),
        commodity_category: category,
        billing_unit: unit,
        rate_inr: Number(rate),
        minimum_days: Number(minimumDays) || 1,
        fixed_period_days: fixedDays.trim() ? Number(fixedDays) : null,
        cold_premium_pct: Number(coldPremium) || 0,
        loading_rate_inr: Number(loading) || 0,
        unloading_rate_inr: Number(unloading) || 0,
        handling_rate_inr: Number(handling) || 0,
        other_service_label: otherLabel.trim() || null,
        other_service_rate_inr: Number(otherRate) || 0,
      };
      if (plan) await updatePricingPlan(plan.id, payload);
      else await createPricingPlan(payload);
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      onBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide title={plan ? "Edit plan" : "Add pricing plan"}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Warehouse" required>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Plan name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Paddy — Rabi season" />
          </Field>
          <Field label="Commodity category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CommodityCategory)}
              className={inputClass}
            >
              {COMMODITY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COMMODITY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billing unit" required>
            <select value={unit} onChange={(e) => setUnit(e.target.value as BillingUnit)} className={inputClass}>
              {BILLING_UNITS.map((u) => (
                <option key={u} value={u}>
                  {BILLING_UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rate (₹)" required>
            <input value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Minimum stay (days)">
            <input value={minimumDays} onChange={(e) => setMinimumDays(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          {unit === "fixed_period" && (
            <Field label="Fixed period (days)" hint="Charged once, regardless of quantity.">
              <input value={fixedDays} onChange={(e) => setFixedDays(e.target.value)} className={inputClass} inputMode="numeric" />
            </Field>
          )}
          <Field label="Cold storage premium (%)" hint="Added on top of the rate for cold-chain goods.">
            <input value={coldPremium} onChange={(e) => setColdPremium(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Loading charge (₹)">
            <input value={loading} onChange={(e) => setLoading(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Unloading charge (₹)">
            <input value={unloading} onChange={(e) => setUnloading(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Handling charge (₹)">
            <input value={handling} onChange={(e) => setHandling(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Other service name" hint="Name it, so the customer knows what they are paying for.">
            <input value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} className={inputClass} placeholder="e.g. fumigation" />
          </Field>
          <Field label="Other service charge (₹)">
            <input value={otherRate} onChange={(e) => setOtherRate(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
        </div>

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
            {busy ? "Saving…" : plan ? "Save plan" : "Create plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-forest">{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-forest">{value}</span>
    </div>
  );
}
