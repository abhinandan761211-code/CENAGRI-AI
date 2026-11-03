import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  Plus,
  Trash2,
  Wheat,
  Droplets,
  SprayCan,
  Sprout,
  Scissors,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  SearchBox,
  Select,
  shortDate,
  Stat,
  Textarea,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import {
  ACTIVITY_KINDS,
  deleteActivity,
  farmerError,
  label,
  listActivities,
  saveActivity,
} from "@/lib/farmer";
import type { ActivityKind, FarmActivity } from "@/lib/farmer";

/**
 * Farm Activities — the single log of field work.
 *
 * This is the "recent activity" feed on the dashboard and the "done" state of
 * the crop calendar. A cost entered here is a real record; it is not copied
 * into Expenses automatically (expenses have their own categories and
 * reports), and the page says that, so nothing is counted twice by surprise.
 */

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  ploughing: Layers,
  sowing: Sprout,
  fertiliser: Sprout,
  irrigation: Droplets,
  spray: SprayCan,
  weeding: Scissors,
  pest_check: Sprout,
  harvest: Wheat,
  other: ClipboardList,
};

type Draft = {
  kind: ActivityKind;
  title: string;
  activity_on: string;
  crop_id: string;
  farm_id: string;
  cost_inr: string;
  quantity: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  kind: "sowing",
  title: "",
  activity_on: new Date().toISOString().slice(0, 10),
  crop_id: "",
  farm_id: "",
  cost_inr: "",
  quantity: "",
  notes: "",
});

export default function ActivitiesPage() {
  const { user } = useAuth();
  const { toast, showToast } = useToast();

  const [items, setItems] = useState<FarmActivity[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ActivityKind>("all");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FarmActivity | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activityRows, farmRows, cropRows] = await Promise.all([
        listActivities(300),
        listFarms().catch(() => []),
        listCrops().catch(() => []),
      ]);
      setItems(activityRows);
      setFarms(farmRows);
      setCrops(cropRows);
    } catch (err) {
      setError(farmerError(err, "Could not load your activity log."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const cropName = useMemo(() => new Map(crops.map((c) => [c.id, c.name])), [crops]);
  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (!q) return true;
      return [item.title, item.notes, cropName.get(item.crop_id ?? ""), farmName.get(item.farm_id ?? "")]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [items, kindFilter, query, cropName, farmName]);

  const monthCost = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    const iso = start.toISOString().slice(0, 10);
    return items
      .filter((i) => i.activity_on >= iso && i.cost_inr != null)
      .reduce((sum, i) => sum + Number(i.cost_inr), 0);
  }, [items]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) {
      setFormError("Describe the work, e.g. “Urea top dressing”.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await saveActivity({
        kind: draft.kind,
        title: draft.title,
        activity_on: draft.activity_on,
        crop_id: draft.crop_id || null,
        farm_id: draft.farm_id || null,
        cost_inr: draft.cost_inr ? Number(draft.cost_inr) : null,
        quantity: draft.quantity || null,
        notes: draft.notes || null,
      });
      setDraft(null);
      showToast("Activity logged");
      await load();
    } catch (err) {
      setFormError(farmerError(err, "Could not save the activity."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteActivity(confirmDelete.id);
      setConfirmDelete(null);
      showToast("Entry deleted");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not delete the entry."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={ClipboardList}
        title="Farm Activities"
        description="A dated log of ploughing, sowing, fertiliser, spraying, weeding and harvest work — with what it cost and which crop it belongs to."
        actions={
          <PrimaryButton onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" /> Log activity
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entries" value={items.length} icon={ClipboardList} hint="All time" />
        <Stat
          label="This month"
          value={items.filter((i) => i.activity_on >= new Date(new Date().setDate(1)).toISOString().slice(0, 10)).length}
          icon={Layers}
          tone="teal"
          hint="Logged this month"
        />
        <Stat label="Cost logged this month" value={monthCost ? inr(monthCost) : "—"} icon={Wheat} tone="amber" hint="From entry costs" />
        <Stat label="Crops covered" value={new Set(items.map((i) => i.crop_id).filter(Boolean)).size} icon={Sprout} tone="blue" hint="Distinct crops" />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <Panel flush>
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search work, crop or notes…" label="Search activities" />
          <Select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            aria-label="Filter by activity type"
            className="sm:w-48"
          >
            <option value="all">All activity types</option>
            {ACTIVITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {label(kind)}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <LoadingRows rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={items.length === 0 ? "No activities logged" : "Nothing matches this filter"}
            body={
              items.length === 0
                ? "Log the work you do on the farm. The dashboard's “Recent farm activities” and the crop calendar's done marks both come from here."
                : "Try another search or switch the activity type."
            }
            action={
              items.length === 0 ? (
                <PrimaryButton onClick={() => setDraft(emptyDraft())}>
                  <Plus className="h-4 w-4" /> Log activity
                </PrimaryButton>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((item) => {
              const Icon = KIND_ICON[item.kind] ?? ClipboardList;
              return (
                <li key={item.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-forest">{item.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                      <span>{shortDate(item.activity_on)}</span>
                      <Chip tone="slate">{label(item.kind)}</Chip>
                      {item.crop_id && cropName.get(item.crop_id) && <span>· {cropName.get(item.crop_id)}</span>}
                      {item.farm_id && farmName.get(item.farm_id) && <span>· {farmName.get(item.farm_id)}</span>}
                      {item.quantity && <span>· {item.quantity}</span>}
                    </p>
                    {item.notes && <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{item.notes}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-bold text-slate-700">
                    {item.cost_inr != null ? inr(item.cost_inr) : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(item)}
                    aria-label="Delete entry"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="text-[10px] leading-relaxed text-slate-400">
        Activity costs are a farm diary, not a ledger. To include a cost in{" "}
        <Link to="/expenses" className="font-semibold text-brand-700 hover:underline">
          Expenses &amp; Profit
        </Link>
        , record it there as an expense as well — the report only sums expense rows.
      </p>

      {draft && (
        <Modal
          title="Log farm activity"
          onClose={() => setDraft(null)}
          wide
          footer={
            <>
              <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="activity-form" disabled={saving}>
                {saving ? "Saving…" : "Save entry"}
              </PrimaryButton>
            </>
          }
        >
          <form id="activity-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Type</span>
              <Select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as ActivityKind })}
              >
                {ACTIVITY_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {label(kind)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Date</span>
              <Input
                type="date"
                value={draft.activity_on}
                onChange={(e) => setDraft({ ...draft, activity_on: e.target.value })}
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                What was done? <span className="text-rose-500">*</span>
              </span>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Urea top dressing, 2nd dose"
                required
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Crop</span>
              <Select value={draft.crop_id} onChange={(e) => setDraft({ ...draft, crop_id: e.target.value })}>
                <option value="">Not linked</option>
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Farm</span>
              <Select value={draft.farm_id} onChange={(e) => setDraft({ ...draft, farm_id: e.target.value })}>
                <option value="">Not linked</option>
                {farms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Cost (₹)</span>
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                value={draft.cost_inr}
                onChange={(e) => setDraft({ ...draft, cost_inr: e.target.value })}
                placeholder="Optional"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Quantity / dose
              </span>
              <Input
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                placeholder="e.g. 25 kg urea per acre"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</span>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
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
          title="Delete this entry?"
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
            “{confirmDelete.title}” from {shortDate(confirmDelete.activity_on)} will be removed from the log.
          </p>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}
