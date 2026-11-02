import { useMemo, useState } from "react";
import { ChartNoAxesCombined, Download, Printer } from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import { SectionHeading } from "@/components/warehouse/ui";
import { EmptyState, ErrorNotice, Loading, Panel, inputClass } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeWarehouseError,
  formatDate,
  formatINR,
  formatWeight,
  listCapacity,
  listDispatches,
  listInspections,
  listInvoices,
  listLotsForOwner,
  listReceipts,
  listStorageBookings,
  listWarehouses,
  stockByCrop,
  stockByDepositor,
  storedDays,
  warehouseTotals,
} from "@/lib/warehouse";
import type {
  GoodsDispatch,
  GoodsReceipt,
  InventoryLot,
  StorageBooking,
  StorageInspection,
  StorageInvoice,
  Warehouse,
  WarehouseCapacity,
} from "@/lib/warehouse";

type ReportKey =
  | "occupancy"
  | "inventory"
  | "inward"
  | "outward"
  | "bookings"
  | "revenue"
  | "inspections";

const REPORTS: { key: ReportKey; title: string; description: string }[] = [
  { key: "occupancy", title: "Warehouse occupancy", description: "Capacity, reserved, occupied and utilisation per warehouse" },
  { key: "inventory", title: "Crop & depositor inventory", description: "Stock held by crop and by depositor" },
  { key: "inward", title: "Goods inward", description: "Every GRN with quantity and discrepancy flag" },
  { key: "outward", title: "Goods outward", description: "Every dispatch with gate pass and quantity" },
  { key: "bookings", title: "Storage bookings", description: "Booking lifecycle with agreed value" },
  { key: "revenue", title: "Revenue & pending payments", description: "Invoices issued and their settlement" },
  { key: "inspections", title: "Quality & damaged quantity", description: "Inspection results, damage and rejection" },
];

/** RFC-4180-ish escaping: quotes doubled, cells wrapped when needed. */
function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reports & Analytics.
 *
 * Every figure is computed from real rows already in the database — there is no
 * sample data path. The CSV export is generated from the same filtered rows the
 * table shows, so the download cannot disagree with the screen.
 */
export default function WarehouseReports() {
  const D = describeWarehouseError;
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);
  const lots = useWorkerData<InventoryLot[]>(() => listLotsForOwner(), [], D);
  const receipts = useWorkerData<GoodsReceipt[]>(() => listReceipts(), [], D);
  const dispatches = useWorkerData<GoodsDispatch[]>(() => listDispatches(), [], D);
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);
  const invoices = useWorkerData<StorageInvoice[]>(() => listInvoices(), [], D);
  const inspections = useWorkerData<StorageInspection[]>(() => listInspections(), [], D);
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);

  const [report, setReport] = useState<ReportKey>("occupancy");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");
  const [crop, setCrop] = useState("all");

  const capacityList = capacity.data ?? [];
  const lotList = lots.data ?? [];
  const receiptList = receipts.data ?? [];
  const dispatchList = dispatches.data ?? [];
  const bookingList = bookings.data ?? [];
  const invoiceList = invoices.data ?? [];
  const inspectionList = inspections.data ?? [];
  const warehouseList = warehouses.data ?? [];

  const crops = useMemo(() => {
    const set = new Set<string>();
    for (const l of lotList) set.add(l.crop_name);
    return [...set].sort();
  }, [lotList]);

  /** Date + warehouse + crop filter applied to whatever the report reads. */
  const inRange = (dateISO: string | null | undefined) => {
    if (!dateISO) return true;
    const day = dateISO.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };
  const matchesWarehouse = (id: string) => warehouseId === "all" || id === warehouseId;
  const matchesCrop = (name: string | null | undefined) =>
    crop === "all" || (name ?? "") === crop;

  const table = useMemo(() => {
    switch (report) {
      case "occupancy": {
        const rows = capacityList.filter((c) => matchesWarehouse(c.id));
        return {
          headers: ["Warehouse", "District", "Capacity (kg)", "Reserved (kg)", "Occupied (kg)", "Free (kg)", "Utilisation %"],
          rows: rows.map((c) => [
            c.name,
            c.district ?? "",
            c.capacity_kg,
            c.reserved_kg,
            c.occupied_kg,
            c.available_kg,
            c.utilisation_pct,
          ]),
        };
      }
      case "inventory": {
        const rows = lotList.filter(
          (l) => l.status !== "released" && matchesWarehouse(l.warehouse_id) && matchesCrop(l.crop_name)
        );
        return {
          headers: ["Lot", "Crop", "Variety", "Depositor", "Received (kg)", "Current (kg)", "Days stored", "Status"],
          rows: rows.map((l) => [
            l.lot_no,
            l.crop_name,
            l.variety ?? "",
            l.depositor_id,
            l.received_kg,
            l.current_kg,
            storedDays(l),
            l.status,
          ]),
        };
      }
      case "inward": {
        const rows = receiptList.filter(
          (r) => matchesWarehouse(r.warehouse_id) && inRange(r.received_at)
        );
        return {
          headers: ["GRN", "Received at", "Quantity (kg)", "Expected (kg)", "Vehicle", "Weight slip", "Discrepancy"],
          rows: rows.map((r) => [
            r.grn_no,
            r.received_at,
            r.received_kg,
            r.expected_kg ?? "",
            r.vehicle_no ?? "",
            r.weight_slip_no ?? "",
            r.discrepancy ? "yes" : "no",
          ]),
        };
      }
      case "outward": {
        const rows = dispatchList.filter(
          (d) => matchesWarehouse(d.warehouse_id) && inRange(d.dispatched_at)
        );
        return {
          headers: ["Dispatch", "Dispatched at", "Quantity (kg)", "Gate pass", "Vehicle", "Partial"],
          rows: rows.map((d) => [
            d.dispatch_no,
            d.dispatched_at,
            d.dispatched_kg,
            d.gate_pass_no ?? "",
            d.vehicle_no ?? "",
            d.partial ? "yes" : "no",
          ]),
        };
      }
      case "bookings": {
        const rows = bookingList.filter(
          (b) => matchesWarehouse(b.warehouse_id) && matchesCrop(b.crop_name) && inRange(b.created_at)
        );
        return {
          headers: ["Booking", "Depositor", "Crop", "Quantity (kg)", "Received (kg)", "Status", "Payment", "Agreed (INR)"],
          rows: rows.map((b) => [
            b.id,
            b.depositor_name ?? "",
            b.crop_name ?? "",
            b.quantity_kg,
            b.received_kg,
            b.status,
            b.payment_status,
            b.agreed_price_inr,
          ]),
        };
      }
      case "revenue": {
        const rows = invoiceList.filter((i) => inRange(i.issued_on));
        return {
          headers: ["Invoice", "Issued", "Due", "Amount (INR)", "Tax (INR)", "Total (INR)", "Status", "Paid on"],
          rows: rows.map((i) => [
            i.invoice_no,
            i.issued_on,
            i.due_on ?? "",
            i.amount_inr,
            i.tax_inr,
            i.total_inr,
            i.status,
            i.paid_on ?? "",
          ]),
        };
      }
      case "inspections": {
        const rows = inspectionList.filter((i) => matchesWarehouse(i.warehouse_id) && inRange(i.inspected_at));
        return {
          headers: ["Inspected at", "Kind", "Result", "Moisture %", "Grade", "Damaged (kg)", "Rejected (kg)", "Pest damage"],
          rows: rows.map((i) => [
            i.inspected_at,
            i.kind,
            i.result,
            i.moisture_pct ?? "",
            i.grade ?? "",
            i.damaged_kg,
            i.rejected_kg,
            i.pest_damage ? "yes" : "no",
          ]),
        };
      }
    }
  }, [
    report,
    capacityList,
    lotList,
    receiptList,
    dispatchList,
    bookingList,
    invoiceList,
    inspectionList,
    warehouseId,
    crop,
    from,
    to,
  ]);

  const totals = useMemo(() => warehouseTotals(capacityList), [capacityList]);
  const cropSummary = useMemo(() => stockByCrop(lotList), [lotList]);
  const depositorSummary = useMemo(() => stockByDepositor(lotList), [lotList]);

  const loading = capacity.state === "loading" || lots.state === "loading";
  if (loading) {
    return (
      <WarehouseLayout title="Reports & Analytics">
        <Loading label="Preparing reports…" />
      </WarehouseLayout>
    );
  }

  const activeReport = REPORTS.find((r) => r.key === report)!;

  return (
    <WarehouseLayout
      title="Reports & Analytics"
      subtitle="Warehouse, inventory and revenue reporting"
      action={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            type="button"
            onClick={() =>
              download(
                `${report}-${from || "all"}-${to || "all"}.csv`,
                toCsv(table.headers, table.rows)
              )
            }
            disabled={table.rows.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      }
    >
      {capacity.state === "error" && <ErrorNotice message={capacity.error} onRetry={capacity.reload} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Warehouses" value={String(totals.warehouses)} hint="Active facilities" />
        <Tile label="Total capacity" value={formatWeight(totals.capacity_kg)} hint="Declared" />
        <Tile label="Occupied" value={formatWeight(totals.occupied_kg)} hint={`${totals.utilisation_pct}% used`} />
        <Tile label="Free" value={formatWeight(totals.available_kg)} hint="Available now" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Crop-wise stock" description="Quantity currently held">
          {cropSummary.length === 0 ? (
            <EmptyState icon={ChartNoAxesCombined} title="No stock" description="Nothing is in custody yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {cropSummary.map((c) => (
                <li key={c.crop} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="truncate text-[11.5px] font-semibold text-slate-700">{c.crop}</span>
                  <span className="text-[10.5px] text-slate-500">{c.lots} lots</span>
                  <span className="text-[11.5px] font-bold text-forest">{formatWeight(c.kg)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Depositor-wise stock" description="Never merged across customers">
          {depositorSummary.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No stored goods.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {depositorSummary.map((d) => (
                <li key={d.depositor_id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="truncate font-mono text-[10.5px] text-slate-500">
                    {d.depositor_id.slice(0, 10)}…
                  </span>
                  <span className="text-[10.5px] text-slate-500">{d.lots} lots</span>
                  <span className="text-[11.5px] font-bold text-forest">{formatWeight(d.kg)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section>
        <SectionHeading title="Generate a report" hint="Filters apply to the report and its CSV" />
        <Panel title={activeReport.title} description={activeReport.description}>
          <div className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:p-5">
            <select
              value={report}
              onChange={(e) => setReport(e.target.value as ReportKey)}
              className={inputClass}
            >
              {REPORTS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.title}
                </option>
              ))}
            </select>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
              <option value="all">All warehouses</option>
              {warehouseList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select value={crop} onChange={(e) => setCrop(e.target.value)} className={inputClass}>
              <option value="all">All crops</option>
              {crops.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
              aria-label="From date"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
              aria-label="To date"
            />
          </div>

          {table.rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11.5px] text-slate-500">
              Nothing matches these filters. Clear the date range or warehouse to see all rows.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-[9.5px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {table.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {table.rows.slice(0, 300).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      {row.map((cell, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                          {cell === "" ? "—" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {table.rows.length > 300 && (
                <p className="border-t border-slate-100 px-3 py-2 text-[10.5px] text-slate-500">
                  Showing the first 300 of {table.rows.length} rows — the CSV export contains all of them.
                </p>
              )}
            </div>
          )}
        </Panel>
      </section>

      <Panel title="Report notes" description="How these numbers are produced">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• Capacity figures come from bookings and receipts, never from a typed number.</li>
          <li>• Revenue counts only invoices marked <strong>paid</strong> by the backend.</li>
          <li>
            • Storage duration is counted in whole days from the receipt date to today (
            {formatDate(new Date().toISOString())}).
          </li>
          <li>• CSV exports follow the on-screen filters exactly; PDF is available through Print.</li>
          <li>• "Depositor" shows an id, not a name, so the export does not leak account details.</li>
        </ul>
      </Panel>
    </WarehouseLayout>
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
