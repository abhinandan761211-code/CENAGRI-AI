import { useMemo, useState } from "react";
import {
  Boxes,
  ClipboardList,
  Droplets,
  History,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import {
  CapacityBar,
  CustodyNotice,
  MiniStat,
  SectionHeading,
} from "@/components/warehouse/ui";
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
  INVENTORY_TX_LABEL,
  adjustLot,
  compactWeight,
  describeWarehouseError,
  formatDate,
  formatWeight,
  listLotsForOwner,
  listLotTransactions,
  listWarehouses,
  stockByCrop,
  stockByDepositor,
  storedDays,
  totalStoredKg,
} from "@/lib/warehouse";
import type {
  InventoryLot,
  InventoryTransaction,
  Warehouse,
} from "@/lib/warehouse";

/**
 * Inventory Management.
 *
 * The warehouse is a CUSTODIAN. Every lot keeps its `depositor_id`, and this
 * screen never combines two customers into one number that looks like stock the
 * owner owns.
 *
 * Quantities change in exactly two ways: a goods receipt or dispatch (both
 * ledger-backed by database triggers), or an adjustment made here — which
 * demands a written reason and records the actor.
 */
export default function WarehouseInventory() {
  const D = describeWarehouseError;
  const lots = useWorkerData<InventoryLot[]>(() => listLotsForOwner(), [], D);
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);

  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");
  const [onlyInStorage, setOnlyInStorage] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState<InventoryLot | null>(null);
  const [historyTarget, setHistoryTarget] = useState<InventoryLot | null>(null);

  const lotList = lots.data ?? [];
  const warehouseList = warehouses.data ?? [];
  const whById = useMemo(() => new Map(warehouseList.map((w) => [w.id, w])), [warehouseList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lotList.filter((lot) => {
      if (onlyInStorage && lot.status === "released") return false;
      if (warehouseId !== "all" && lot.warehouse_id !== warehouseId) return false;
      if (!q) return true;
      return (
        lot.lot_no.toLowerCase().includes(q) ||
        lot.crop_name.toLowerCase().includes(q) ||
        (lot.variety ?? "").toLowerCase().includes(q) ||
        (lot.batch_no ?? "").toLowerCase().includes(q) ||
        (lot.storage_location ?? "").toLowerCase().includes(q)
      );
    });
  }, [lotList, search, warehouseId, onlyInStorage]);

  const storedKg = totalStoredKg(lotList);
  const crops = stockByCrop(lotList);
  const depositors = stockByDepositor(lotList);
  const heldLots = lotList.filter((l) => l.status !== "released");

  /** Total received vs total still held, per warehouse — the space in use. */
  const byWarehouse = useMemo(() => {
    return warehouseList.map((w) => {
      const lotsHere = lotList.filter((l) => l.warehouse_id === w.id && l.status !== "released");
      return {
        warehouse: w,
        kg: lotsHere.reduce((s, l) => s + Number(l.current_kg), 0),
        lots: lotsHere.length,
      };
    });
  }, [warehouseList, lotList]);

  if (lots.state === "loading") {
    return (
      <WarehouseLayout title="Inventory Management">
        <Loading label="Loading inventory…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Inventory Management"
      subtitle="What you hold, for whom, and where"
    >
      {lots.state === "error" && <ErrorNotice message={lots.error} onRetry={lots.reload} />}

      <CustodyNotice />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Total held" value={formatWeight(storedKg)} hint={`${heldLots.length} lots`} />
        <Tile label="Crops" value={String(crops.length)} hint="Distinct commodities" />
        <Tile label="Depositors" value={String(depositors.length)} hint="Separate ownerships" />
        <Tile
          label="Released"
          value={String(lotList.length - heldLots.length)}
          hint="Lots fully dispatched"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Crop-wise stock" description="Quantity currently held" className="lg:col-span-2">
          {crops.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No stock in custody"
              description="Lots appear here after the first goods receipt. Nothing is estimated."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {crops.map((c) => {
                const max = Math.max(...crops.map((x) => x.kg), 1);
                return (
                  <li key={c.crop} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-forest">{c.crop}</span>
                      <span className="shrink-0 text-[11.5px] font-bold text-slate-700">
                        {formatWeight(c.kg)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(c.kg / max) * 100}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">{c.lots} lot(s)</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Space used" description="Per warehouse">
          {byWarehouse.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No warehouse yet.</div>
          ) : (
            <ul className="space-y-3 p-4">
              {byWarehouse.map((row) => (
                <li key={row.warehouse.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11.5px] font-semibold text-forest">
                      {row.warehouse.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-slate-500">
                      {compactWeight(row.kg)} held
                    </span>
                  </div>
                  <div className="mt-1">
                    <CapacityBar
                      capacityKg={Number(row.warehouse.total_capacity_kg ?? row.warehouse.capacity_kg)}
                      reservedKg={Number(row.warehouse.reserved_kg)}
                      occupiedKg={Number(row.warehouse.occupied_kg)}
                      showLegend={false}
                      height="h-1.5"
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">{row.lots} lot(s) in custody</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {depositors.length > 1 && (
        <Panel title="Depositor-wise holdings" description="Ownership is never merged across customers">
          <ul className="divide-y divide-slate-100">
            {depositors.map((d) => (
              <li key={d.depositor_id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="truncate font-mono text-[10.5px] text-slate-500">
                  {d.depositor_id.slice(0, 8)}…
                </span>
                <span className="text-[11px] text-slate-500">{d.lots} lot(s)</span>
                <span className="text-[11.5px] font-bold text-forest">{formatWeight(d.kg)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <section>
        <SectionHeading title="Lots" hint="Each lot belongs to one depositor and one storage location" />
        <Panel
          title="Inventory lots"
          description={`${filtered.length} of ${lotList.length}`}
          action={
            <div className="flex items-center gap-2">
              <label className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lot, crop, batch"
                  className={`${inputClass} h-8 w-52 pl-8 text-[11.5px]`}
                />
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className={`${inputClass} h-8 w-40 text-[11.5px]`}
              >
                <option value="all">All warehouses</option>
                {warehouseList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOnlyInStorage((v) => !v)}
                aria-pressed={onlyInStorage}
                className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold ${
                  onlyInStorage ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" /> In storage
              </button>
            </div>
          }
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={lotList.length === 0 ? "No inventory lots" : "Nothing matches"}
              description={
                lotList.length === 0
                  ? "A lot is created automatically when you record a goods receipt against a booking."
                  : "Adjust the search or filters to see other lots."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[11.5px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-bold">Lot</th>
                    <th className="px-4 py-2 font-bold">Crop</th>
                    <th className="px-4 py-2 font-bold">Quantity</th>
                    <th className="px-4 py-2 font-bold">Depositor</th>
                    <th className="px-4 py-2 font-bold">Location</th>
                    <th className="px-4 py-2 font-bold">Age</th>
                    <th className="px-4 py-2 font-bold">Status</th>
                    <th className="px-4 py-2 font-bold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((lot) => {
                    const pct =
                      Number(lot.received_kg) > 0
                        ? Math.round((Number(lot.current_kg) / Number(lot.received_kg)) * 100)
                        : 0;
                    return (
                      <tr key={lot.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-[10.5px] font-bold text-forest">{lot.lot_no}</p>
                          {lot.batch_no && (
                            <p className="text-[9.5px] text-slate-400">Batch {lot.batch_no}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-700">{lot.crop_name}</p>
                          <p className="text-[10px] text-slate-500">{lot.variety ?? "—"}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-700">{formatWeight(Number(lot.current_kg))}</p>
                          <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[9.5px] text-slate-400">
                            of {formatWeight(Number(lot.received_kg))}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-[10px] text-slate-500">
                            {lot.depositor_id.slice(0, 8)}…
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          <p>{whById.get(lot.warehouse_id)?.name ?? "—"}</p>
                          <p className="text-[10px] text-slate-500">
                            {lot.storage_location ?? "No location set"}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {lot.status === "released" ? "—" : `${storedDays(lot)} d`}
                          <p className="text-[10px] text-slate-400">in {formatDate(lot.received_on)}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              lot.status === "in_storage"
                                ? "bg-emerald-100 text-emerald-800"
                                : lot.status === "partially_released"
                                  ? "bg-orange-100 text-orange-800"
                                  : lot.status === "released"
                                    ? "bg-slate-100 text-slate-600"
                                    : lot.status === "on_hold"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {lot.status.replace("_", " ")}
                          </span>
                          {lot.quality_status !== "passed" && (
                            <p className="mt-0.5 text-[9.5px] text-slate-400">
                              quality {lot.quality_status}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setHistoryTarget(lot)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <History className="mr-0.5 inline h-3 w-3" /> Ledger
                            </button>
                            {lot.status !== "released" && (
                              <button
                                type="button"
                                onClick={() => setAdjustTarget(lot)}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Adjust
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      {adjustTarget && (
        <AdjustModal
          lot={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={() => {
            setAdjustTarget(null);
            lots.reload();
          }}
        />
      )}

      {historyTarget && <LedgerModal lot={historyTarget} onClose={() => setHistoryTarget(null)} />}
    </WarehouseLayout>
  );
}

/* ── Adjustment ────────────────────────────────────────────────────────── */

function AdjustModal({
  lot,
  onClose,
  onSaved,
}: {
  lot: InventoryLot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const [newKg, setNewKg] = useState(String(Number(lot.current_kg)));
  const [kind, setKind] = useState<"adjustment" | "damage" | "disposal">("adjustment");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const delta = Number(newKg || 0) - Number(lot.current_kg);

  async function handleSave() {
    if (reason.trim().length < 3) {
      setError("A written reason is required — it is stored against this lot permanently.");
      return;
    }
    if (Number(newKg) < 0 || !Number.isFinite(Number(newKg))) {
      setError("Enter a valid quantity.");
      return;
    }
    if (Number(newKg) > Number(lot.received_kg)) {
      setError("The quantity cannot exceed what was originally received.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adjustLot({ lot, newKg: Number(newKg), kind, reason: reason.trim() });
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Adjust lot quantity" subtitle={`${lot.lot_no} · ${lot.crop_name}`}>
      <div className="space-y-3">
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
          This changes a customer's recorded stock. The depositor and every adjustment are kept in the
          ledger, and the reason you type is visible on it.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Recorded now" value={formatWeight(Number(lot.current_kg))} />
          <MiniStat label="Originally received" value={formatWeight(Number(lot.received_kg))} />
        </div>

        <Field label="What happened?" required>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "adjustment" | "damage" | "disposal")}
            className={inputClass}
          >
            <option value="adjustment">Counting correction</option>
            <option value="damage">Damage — stock lost</option>
            <option value="disposal">Disposal — stock destroyed</option>
          </select>
        </Field>

        <Field label="Correct quantity (kg)" required>
          <input value={newKg} onChange={(e) => setNewKg(e.target.value)} className={inputClass} inputMode="decimal" />
        </Field>

        <p
          className={`text-[11.5px] font-semibold ${
            delta === 0 ? "text-slate-500" : delta > 0 ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {delta === 0
            ? "No change."
            : `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-IN")} kg (${formatWeight(
                Math.abs(delta)
              )} ${delta > 0 ? "added back" : "removed"})`}
        </p>

        <Field label="Reason" required hint="Be specific — 'bags torn in block B' is useful, 'loss' is not.">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className={`${inputClass} resize-none`}
          />
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
            disabled={busy || delta === 0}
            className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Record adjustment"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Ledger ────────────────────────────────────────────────────────────── */

function LedgerModal({ lot, onClose }: { lot: InventoryLot; onClose: () => void }) {
  const D = describeWarehouseError;
  const rows = useWorkerData<InventoryTransaction[]>(() => listLotTransactions(lot.id), [lot.id], D);
  const list = rows.data ?? [];

  return (
    <Modal open onClose={onClose} wide title="Lot ledger" subtitle={`${lot.lot_no} · ${lot.crop_name}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Received" value={formatWeight(Number(lot.received_kg))} />
          <MiniStat label="Held now" value={formatWeight(Number(lot.current_kg))} />
          <MiniStat
            label="Moisture"
            value={lot.moisture_pct != null ? `${lot.moisture_pct}%` : "Not recorded"}
          />
        </div>

        {rows.state === "loading" ? (
          <p className="py-6 text-center text-[11.5px] text-slate-500">Loading ledger…</p>
        ) : list.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[11.5px] text-slate-500">
            No ledger entries yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {list.map((tx) => {
              const positive = Number(tx.quantity_kg) > 0;
              return (
                <li key={tx.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    <Droplets className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold text-forest">
                      {INVENTORY_TX_LABEL[tx.kind]}{" "}
                      <span className={positive ? "text-emerald-700" : "text-rose-700"}>
                        {positive ? "+" : ""}
                        {Number(tx.quantity_kg).toLocaleString("en-IN")} kg
                      </span>
                    </p>
                    <p className="text-[10.5px] text-slate-500">{tx.reason}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatDate(tx.created_at)} · balance {formatWeight(Number(tx.balance_after_kg))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-[15px] font-extrabold text-forest">{value}</p>
      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
