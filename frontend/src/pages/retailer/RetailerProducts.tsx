import { useCallback, useMemo, useState } from "react";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  inputClass,
} from "@/components/retailer/ui";
import ImageUploader, { ProductThumb } from "@/components/retailer/ImageUploader";
import { useRetailerData } from "@/hooks/useRetailerData";
import { deleteImage, pathFromPublicUrl } from "@/lib/storage";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  EXPIRY_LABEL,
  EXPIRY_STYLE,
  STOCK_STYLE,
  createProduct,
  daysUntil,
  expiryState,
  formatDate,
  formatINR,
  formatQty,
  listProducts,
  needsExpiry,
  stockLevel,
  updateProduct,
} from "@/lib/retailer";
import type { ProductCategory, ProductInput, ProductUnit, RetailerProduct } from "@/lib/retailer";

const EMPTY_FORM = {
  name: "",
  brand: "",
  category: "Seeds" as ProductCategory,
  description: "",
  unit: "kg" as ProductUnit,
  price_inr: "",
  mrp_inr: "",
  stock_qty: "",
  low_stock_at: "10",
  expiry_date: "",
  batch_no: "",
  image_url: null as string | null,
};

type FormState = typeof EMPTY_FORM;

function toInput(form: FormState): ProductInput {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: form.name.trim(),
    brand: form.brand.trim() || null,
    category: form.category,
    description: form.description.trim() || null,
    unit: form.unit,
    price_inr: Number(form.price_inr) || 0,
    mrp_inr: num(form.mrp_inr),
    stock_qty: Number(form.stock_qty) || 0,
    low_stock_at: Number(form.low_stock_at) || 0,
    expiry_date: form.expiry_date || null,
    batch_no: form.batch_no.trim() || null,
    image_url: form.image_url,
  };
}

/**
 * Products — the agri-input catalogue across the five categories from the
 * brief: Seeds, Fertilizers, Pesticides, Tools and Irrigation.
 *
 * Expiry is enforced here as well as in the DB: fertiliser and pesticide rows
 * cannot be saved without an expiry date, because an expired batch must never
 * reach a farmer's field.
 */
export default function RetailerProducts() {
  const { data, setData, state, error, reload } = useRetailerData<RetailerProduct[]>(
    () => listProducts(),
    []
  );

  const [category, setCategory] = useState<ProductCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RetailerProduct | null>(null);
  const [open, setOpen] = useState(false);

  const products = data ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.batch_no ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, category, query]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(product: RetailerProduct) {
    setEditing(product);
    setOpen(true);
  }

  function handleSaved(saved: RetailerProduct, isNew: boolean) {
    setData(isNew ? [saved, ...products] : products.map((p) => (p.id === saved.id ? saved : p)));
    setOpen(false);
  }

  async function handleArchive(product: RetailerProduct) {
    const confirmed = window.confirm(
      `Archive "${product.name}"? It will disappear from the catalogue but past orders keep their record.`
    );
    if (!confirmed) return;
    const saved = await updateProduct(product.id, { status: "archived" });
    setData(products.filter((p) => p.id !== saved.id));
  }

  return (
    <RetailerLayout
      title="Products"
      subtitle="Seeds, fertilizers, pesticides, tools & irrigation"
      action={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white transition hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add product
        </button>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
          {(["All", ...PRODUCT_CATEGORIES] as const).map((option) => {
            const active = category === option;
            const count =
              option === "All" ? products.length : products.filter((p) => p.category === option).length;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(option)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-slate-100 text-forest" : "text-slate-500 hover:bg-slate-50"
                  }`}
              >
                {option}
                <span className="ml-1.5 text-[10px] text-slate-400">{count}</span>
              </button>
            );
          })}
        </div>

        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand or batch"
            aria-label="Search products"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-brand-500"
          />
        </label>
      </div>

      <div className="mt-4">
        {state === "error" && <ErrorNotice message={error} onRetry={() => void reload()} />}
        {state === "loading" && <Loading label="Loading your catalogue…" />}

        {state === "ready" && visible.length === 0 && (
          <div className="card">
            <EmptyState
              icon={Package}
              title={products.length === 0 ? "No products listed yet" : "Nothing matches this filter"}
              description={
                products.length === 0
                  ? "Add your first seed, fertiliser, pesticide, tool or irrigation product. Stock alerts and expiry tracking start from the moment it is listed."
                  : "Try a different category or clear the search box."
              }
              action={
                products.length === 0 ? (
                  <button type="button" onClick={openCreate} className="btn-primary h-9 px-4 text-xs">
                    Add your first product
                  </button>
                ) : undefined
              }
            />
          </div>
        )}

        {state === "ready" && visible.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((product) => {
              const expiry = expiryState(product);
              const days = daysUntil(product.expiry_date);
              return (
                <article key={product.id} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <ProductThumb url={product.image_url} size={44} />
                      <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-700">
                        {product.category}
                      </p>
                      <h3 className="truncate font-display text-[15px] font-bold text-forest">
                        {product.name}
                      </h3>
                      <p className="text-[11px] text-slate-500">{product.brand ?? "Unbranded"}</p>
                      </div>
                    </div>
                    <Badge className={STOCK_STYLE[stockLevel(product)]}>
                      {stockLevel(product) === "out" ? "Out of stock" : stockLevel(product) === "low" ? "Low" : "In stock"}
                    </Badge>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <dt className="text-slate-400">Price</dt>
                      <dd className="font-bold text-forest">
                        {formatINR(product.price_inr)} / {product.unit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Stock</dt>
                      <dd className="font-semibold text-slate-700">
                        {formatQty(product.stock_qty, product.unit)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Expiry</dt>
                      <dd className="text-slate-700">
                        {product.expiry_date ? formatDate(product.expiry_date) : "Not applicable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Batch</dt>
                      <dd className="text-slate-700">{product.batch_no ?? "—"}</dd>
                    </div>
                  </dl>

                  {days != null && (
                    <div className="mt-2">
                      <Badge className={EXPIRY_STYLE[expiry]}>
                        {EXPIRY_LABEL[expiry]}
                        {days >= 0 ? ` · ${days}d` : ` · ${Math.abs(days)}d ago`}
                      </Badge>
                    </div>
                  )}

                  {product.status === "paused" && (
                    <p className="mt-2 rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                      Paused — hidden from farmers
                    </p>
                  )}

                  <div className="mt-auto flex items-center gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => openEdit(product)}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleArchive(product)}
                      aria-label={`Archive ${product.name}`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <ProductDialog
        open={open}
        editing={editing}
        onClose={() => setOpen(false)}
        onSaved={handleSaved}
      />
    </RetailerLayout>
  );
}

/** Add / edit form. `editing` null means create. */
function ProductDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: RetailerProduct | null;
  onClose: () => void;
  onSaved: (product: RetailerProduct, isNew: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Photos uploaded during this dialog session. If the user uploads, then
  // cancels (or uploads twice), the unused files would stay in Storage with no
  // row pointing at them. Tracked here and removed on close.
  const [uploadedDuringSession, setUploadedDuringSession] = useState<string[]>([]);

  /** Close the dialog, deleting any photo uploaded but never saved. */
  const cleanupAndClose = useCallback(() => {
    const keptUrl = editing?.image_url ?? null;
    for (const url of uploadedDuringSession) {
      if (url === form.image_url && url !== keptUrl) continue;
      const path = pathFromPublicUrl(url);
      if (path) void deleteImage(path).catch(() => {});
    }
    setUploadedDuringSession([]);
    onClose();
  }, [uploadedDuringSession, form.image_url, editing?.image_url, onClose]);

  // Reset the form whenever the dialog opens for a different product.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (editing?.id ?? "new") : null;
  if (key !== lastKey) {
    setLastKey(key);
    setSaveError("");
    setErrors({});
    setUploadedDuringSession([]);
    setForm(
      editing
        ? {
          name: editing.name,
          brand: editing.brand ?? "",
          category: editing.category,
          description: editing.description ?? "",
          unit: editing.unit,
          price_inr: String(editing.price_inr),
          mrp_inr: editing.mrp_inr != null ? String(editing.mrp_inr) : "",
          stock_qty: String(editing.stock_qty),
          low_stock_at: String(editing.low_stock_at),
          expiry_date: editing.expiry_date ?? "",
          batch_no: editing.batch_no ?? "",
          image_url: editing.image_url ?? null,
        }
        : EMPTY_FORM
    );
  }

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Product name is required.";
    if (form.price_inr.trim() === "" || Number(form.price_inr) < 0) {
      next.price_inr = "Enter a selling price.";
    }
    if (form.stock_qty.trim() === "" || Number(form.stock_qty) < 0) {
      next.stock_qty = "Enter the current stock.";
    }
    if (form.mrp_inr.trim() !== "" && Number(form.mrp_inr) < Number(form.price_inr)) {
      next.mrp_inr = "MRP cannot be below the selling price.";
    }
    if (needsExpiry(form.category) && !form.expiry_date) {
      next.expiry_date = `${form.category} must carry an expiry date.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSaveError("");
    try {
      const input = toInput(form);
      const saved = editing ? await updateProduct(editing.id, input) : await createProduct(input);

      // The row now points at the new photo, so the previous file is orphaned.
      // Delete it only AFTER a successful save — if the save had failed the
      // old photo must still be there.
      const previous = editing?.image_url;
      if (previous && previous !== saved.image_url) {
        const path = pathFromPublicUrl(previous);
        if (path) {
          void deleteImage(path).catch(() => {
            /* best-effort: an orphaned file is harmless, a failed save is not */
          });
        }
      }

      onSaved(saved, !editing);
      setLastKey(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={editing ? "Edit product" : "Add product"}
      subtitle="Fertilisers and pesticides require an expiry date."
      onClose={cleanupAndClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Product name" required error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. IFFCO DAP 50 kg"
              className={inputClass}
            />
          </Field>
          <Field label="Brand">
            <input
              value={form.brand}
              onChange={(e) => set("brand", e.target.value)}
              placeholder="e.g. IFFCO"
              className={inputClass}
            />
          </Field>
          <Field label="Category" required>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value as ProductCategory)}
              className={inputClass}
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit" required>
            <select
              value={form.unit}
              onChange={(e) => set("unit", e.target.value as ProductUnit)}
              className={inputClass}
            >
              {PRODUCT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Selling price (₹)" required error={errors.price_inr}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.price_inr}
              onChange={(e) => set("price_inr", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="MRP (₹)" error={errors.mrp_inr} hint="Optional — shown as a struck-through price.">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.mrp_inr}
              onChange={(e) => set("mrp_inr", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Current stock" required error={errors.stock_qty}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.stock_qty}
              onChange={(e) => set("stock_qty", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Low-stock alert at" hint="A notification fires when stock reaches this level.">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.low_stock_at}
              onChange={(e) => set("low_stock_at", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Expiry date"
            required={needsExpiry(form.category)}
            error={errors.expiry_date}
            hint={
              needsExpiry(form.category)
                ? "Mandatory for fertilisers and pesticides."
                : "Optional for this category."
            }
          >
            <input
              type="date"
              value={form.expiry_date}
              onChange={(e) => set("expiry_date", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Batch number">
            <input
              value={form.batch_no}
              onChange={(e) => set("batch_no", e.target.value)}
              placeholder="e.g. DAP/2026/04"
              className={inputClass}
            />
          </Field>
        </div>

        <ImageUploader
          label="Product photo"
          hint="Shown to farmers browsing your shop. Optional but recommended."
          value={form.image_url}
          onChange={(url) => {
            if (url) setUploadedDuringSession((prev) => [...prev, url]);
            set("image_url", url);
          }}
          disabled={saving}
        />

        <Field label="Description">
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Dosage, crops it suits, storage notes…"
            className={inputClass}
          />
        </Field>

        {saveError && (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {saveError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={cleanupAndClose}
            className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary h-9 px-4 text-xs disabled:opacity-60">
            {saving ? "Saving…" : editing ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
