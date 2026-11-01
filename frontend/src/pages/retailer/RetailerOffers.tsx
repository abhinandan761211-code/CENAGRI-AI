import { useMemo, useState } from "react";
import { CalendarDays, Megaphone, Percent, Plus, TicketPercent, ToggleLeft, ToggleRight } from "lucide-react";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import { Badge, EmptyState, ErrorNotice, Field, Loading, Modal, Panel, inputClass } from "@/components/retailer/ui";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  OFFER_KINDS,
  PRODUCT_CATEGORIES,
  createOffer,
  formatDate,
  formatINR,
  listOffers,
  offerIsLive,
  toggleOffer,
} from "@/lib/retailer";
import type { OfferKind, RetailerOffer } from "@/lib/retailer";

const KIND_LABEL: Record<OfferKind, string> = {
  discount: "Discount",
  coupon: "Coupon",
  festival: "Festival",
  seasonal: "Seasonal",
  combo: "Combo",
};

const KIND_STYLE: Record<OfferKind, string> = {
  discount: "bg-brand-100 text-brand-800",
  coupon: "bg-violet-100 text-violet-800",
  festival: "bg-amber-100 text-amber-800",
  seasonal: "bg-sky-100 text-sky-800",
  combo: "bg-emerald-100 text-emerald-800",
};

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  title: "",
  kind: "discount" as OfferKind,
  code: "",
  valueType: "percent" as "percent" | "flat",
  value: "",
  min_order_inr: "",
  category: "",
  starts_on: today(),
  ends_on: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
  usage_limit: "",
};

/**
 * Offers & Discounts — festival offers, seasonal discounts and coupon codes.
 *
 * An offer is live only between its start and end date; switching it off hides
 * it from customers immediately without deleting the record.
 */
export default function RetailerOffers() {
  const { data, setData, state, error, reload } = useRetailerData<RetailerOffer[]>(
    () => listOffers(),
    []
  );

  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const offers = data ?? [];
  const { live, scheduled, ended } = useMemo(() => {
    const now = today();
    return {
      live: offers.filter((o) => offerIsLive(o)),
      scheduled: offers.filter((o) => o.is_active && o.starts_on > now),
      ended: offers.filter((o) => !o.is_active || o.ends_on < now),
    };
  }, [offers]);

  async function handleToggle(offer: RetailerOffer) {
    setBusyId(offer.id);
    setActionError("");
    try {
      const saved = await toggleOffer(offer.id, !offer.is_active);
      setData(offers.map((o) => (o.id === saved.id ? saved : o)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the offer.");
    } finally {
      setBusyId(null);
    }
  }

  function renderGroup(title: string, rows: RetailerOffer[], description: string) {
    if (rows.length === 0) return null;
    return (
      <Panel title={title} description={description}>
        <ul className="divide-y divide-slate-100">
          {rows.map((offer) => (
            <li key={offer.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-bold text-forest">{offer.title}</p>
                  <Badge className={KIND_STYLE[offer.kind]}>{KIND_LABEL[offer.kind]}</Badge>
                  {offer.code && (
                    <span className="rounded border border-dashed border-slate-300 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-slate-700">
                      {offer.code}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {offer.discount_pct != null
                    ? `${offer.discount_pct}% off`
                    : `${formatINR(offer.flat_off_inr ?? 0)} flat off`}
                  {offer.min_order_inr ? ` · min ${formatINR(offer.min_order_inr)}` : ""}
                  {offer.category ? ` · ${offer.category}` : ""}
                  {" · "}
                  {formatDate(offer.starts_on)} – {formatDate(offer.ends_on)}
                  {offer.usage_limit
                    ? ` · ${offer.used_count}/${offer.usage_limit} used`
                    : ` · ${offer.used_count} used`}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === offer.id}
                onClick={() => void handleToggle(offer)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                aria-pressed={offer.is_active}
              >
                {offer.is_active ? (
                  <ToggleRight className="h-4 w-4 text-brand-700" />
                ) : (
                  <ToggleLeft className="h-4 w-4 text-slate-400" />
                )}
                {offer.is_active ? "Active" : "Paused"}
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }

  return (
    <RetailerLayout
      title="Offers & Discounts"
      subtitle={`${live.length} live offer${live.length === 1 ? "" : "s"}`}
      action={
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white transition hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" />
          New offer
        </button>
      }
    >
      {(actionError || state === "error") && (
        <div className="mb-4">
          <ErrorNotice message={actionError || error} onRetry={() => void reload()} />
        </div>
      )}

      {state === "loading" && <Loading label="Loading offers…" />}

      {state === "ready" && offers.length === 0 && (
        <div className="card">
          <EmptyState
            icon={TicketPercent}
            title="No offers running"
            description="Create a festival offer, a seasonal discount or a coupon code. Customers see live offers on your shop card."
            action={
              <button type="button" onClick={() => setOpen(true)} className="btn-primary h-9 px-4 text-xs">
                Create your first offer
              </button>
            }
          />
        </div>
      )}

      {state === "ready" && offers.length > 0 && (
        <div className="space-y-4">
          {renderGroup("Live now", live, "Visible to customers today")}
          {renderGroup("Scheduled", scheduled, "Starts on a future date")}
          {renderGroup("Paused / ended", ended, "Hidden from customers")}
        </div>
      )}

      <OfferDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(offer) => {
          setData([offer, ...offers]);
          setOpen(false);
        }}
      />
    </RetailerLayout>
  );
}

function OfferDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (offer: RetailerOffer) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY);
      setErrors({});
      setSaveError("");
    }
  }

  function set<K extends keyof typeof EMPTY>(field: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Give the offer a name.";
    if (form.value.trim() === "" || Number(form.value) <= 0) next.value = "Enter a discount value.";
    if (form.valueType === "percent" && Number(form.value) > 100) {
      next.value = "Percentage cannot exceed 100.";
    }
    if (form.kind === "coupon" && !form.code.trim()) next.code = "A coupon needs a code.";
    if (form.ends_on < form.starts_on) next.ends_on = "End date must be after the start date.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSaveError("");
    try {
      const offer = await createOffer({
        title: form.title.trim(),
        kind: form.kind,
        code: form.kind === "coupon" || form.code.trim() ? form.code.trim().toUpperCase() : null,
        discount_pct: form.valueType === "percent" ? Number(form.value) : null,
        flat_off_inr: form.valueType === "flat" ? Number(form.value) : null,
        min_order_inr: form.min_order_inr ? Number(form.min_order_inr) : null,
        category: form.category || null,
        starts_on: form.starts_on,
        ends_on: form.ends_on,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        is_active: true,
      });
      onCreated(offer);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create the offer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="New offer" subtitle="Festival, seasonal, coupon or combo" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Offer name" required error={errors.title}>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Boro season seed combo"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Type">
            <select
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as OfferKind)}
              className={inputClass}
            >
              {OFFER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Applies to">
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={inputClass}
            >
              <option value="">All categories</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Discount type">
            <div className="flex gap-2">
              {(
                [
                  ["percent", "Percent", Percent],
                  ["flat", "Flat ₹", Megaphone],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("valueType", value)}
                  aria-pressed={form.valueType === value}
                  className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition ${
                    form.valueType === value
                      ? "border-brand-700 bg-brand-50 text-brand-800"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label={form.valueType === "percent" ? "Discount %" : "Flat discount (₹)"}
            required
            error={errors.value}
          >
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Coupon code"
            error={errors.code}
            hint="Leave blank for an automatic discount."
          >
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="e.g. KHARIF10"
              className={`${inputClass} uppercase`}
            />
          </Field>
          <Field label="Minimum order (₹)" hint="Optional spend threshold.">
            <input
              type="number"
              min={0}
              value={form.min_order_inr}
              onChange={(e) => set("min_order_inr", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Starts on" required>
            <input
              type="date"
              value={form.starts_on}
              onChange={(e) => set("starts_on", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Ends on" required error={errors.ends_on}>
            <input
              type="date"
              value={form.ends_on}
              onChange={(e) => set("ends_on", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Usage limit" hint="How many times the coupon can be redeemed.">
            <input
              type="number"
              min={1}
              value={form.usage_limit}
              onChange={(e) => set("usage_limit", e.target.value)}
              placeholder="Unlimited"
              className={inputClass}
            />
          </Field>
        </div>

        <p className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <CalendarDays className="h-3.5 w-3.5" />
          The offer is live from {formatDate(form.starts_on)} to {formatDate(form.ends_on)}.
        </p>

        {saveError && (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {saveError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary h-9 px-4 text-xs disabled:opacity-60">
            {saving ? "Creating…" : "Create offer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
