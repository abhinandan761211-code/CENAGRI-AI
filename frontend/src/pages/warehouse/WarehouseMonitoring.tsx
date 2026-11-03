import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Droplets,
  Plus,
  Thermometer,
  UserRound,
  Wind,
} from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import {
  ManualReadingNotice,
  ReadingLevelTag,
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
  describeWarehouseError,
  formatDate,
  formatDateTime,
  listReadings,
  listSections,
  listWarehouses,
  readingLevel,
  recordReading,
} from "@/lib/warehouse";
import type {
  ReadingLevel,
  StorageReading,
  Warehouse,
  WarehouseSection,
} from "@/lib/warehouse";

/**
 * Storage Monitoring.
 *
 * Every row on this page was typed by a person. There is no sensor connection,
 * and the screen says so instead of implying a live feed — `source` distinguishes
 * a manual entry from a device reading and a device reading is not simulated.
 *
 * Alerts compare a reading against the range configured on the section.
 */
export default function WarehouseMonitoring() {
  const D = describeWarehouseError;
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);
  const sections = useWorkerData<WarehouseSection[]>(() => listSections(), [], D);
  const readings = useWorkerData<StorageReading[]>(() => listReadings(), [], D);

  const [warehouseId, setWarehouseId] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const warehouseList = warehouses.data ?? [];
  const sectionList = sections.data ?? [];
  const readingList = readings.data ?? [];

  const sectionById = useMemo(() => new Map(sectionList.map((s) => [s.id, s])), [sectionList]);
  const warehouseById = useMemo(() => new Map(warehouseList.map((w) => [w.id, w])), [warehouseList]);

  const filtered = useMemo(
    () => readingList.filter((r) => warehouseId === "all" || r.warehouse_id === warehouseId),
    [readingList, warehouseId]
  );

  /** Latest reading per section, so the dashboard reflects "now", not history. */
  const latest = useMemo(() => {
    const map = new Map<string, StorageReading>();
    for (const r of readingList) {
      const key = r.section_id ?? `${r.warehouse_id}:general`;
      if (!map.has(key)) map.set(key, r); // list is already newest-first
    }
    return [...map.values()];
  }, [readingList]);

  const alerts = useMemo(() => {
    return latest
      .map((r) => {
        const section = r.section_id ? sectionById.get(r.section_id) : undefined;
        const temp = readingLevel(r.temperature_c, section?.temp_min_c, section?.temp_max_c);
        const humidity = readingLevel(r.humidity_pct, section?.humidity_min ?? null, section?.humidity_max ?? null);
        const level: ReadingLevel =
          temp === "critical" || humidity === "critical"
            ? "critical"
            : temp === "warning" || humidity === "warning"
              ? "warning"
              : "ok";
        return { reading: r, section, temp, humidity, level };
      })
      .filter((row) => row.level !== "ok");
  }, [latest, sectionById]);

  if (readings.state === "loading") {
    return (
      <WarehouseLayout title="Storage Monitoring">
        <Loading label="Loading readings…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Storage Monitoring"
      subtitle="Temperature, humidity, ventilation and pest checks"
      action={
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={warehouseList.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Record reading
        </button>
      }
    >
      {readings.state === "error" && <ErrorNotice message={readings.error} onRetry={readings.reload} />}

      <ManualReadingNotice />

      {alerts.length > 0 && (
        <Panel title="Alerts" description="Outside the range configured for the section">
          <ul className="divide-y divide-slate-100">
            {alerts.map(({ reading, section, level }) => (
              <li key={reading.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${level === "critical" ? "text-rose-600" : "text-amber-600"
                    }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold text-forest">
                    {section?.name ?? "General area"} ·{" "}
                    {warehouseById.get(reading.warehouse_id)?.name ?? "Warehouse"}
                  </p>
                  <p className="text-[10.5px] text-slate-500">
                    {reading.temperature_c != null ? `${reading.temperature_c} °C` : "— temp"} ·{" "}
                    {reading.humidity_pct != null ? `${reading.humidity_pct}% RH` : "— humidity"}
                    {section?.temp_min_c != null && section?.temp_max_c != null
                      ? ` · range ${section.temp_min_c}–${section.temp_max_c} °C`
                      : ""}
                  </p>
                  <p className="text-[10px] text-slate-400">{formatDateTime(reading.recorded_at)}</p>
                </div>
                <ReadingLevelTag level={level} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Current readings" description="The latest manual entry per section">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {latest.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={Thermometer}
                title="No readings recorded"
                description="Add a reading to start tracking temperature and humidity. Nothing is displayed until a person records it — this screen never invents a value."
              />
            </div>
          ) : (
            latest.map((r) => {
              const section = r.section_id ? sectionById.get(r.section_id) : undefined;
              const temp = readingLevel(r.temperature_c, section?.temp_min_c, section?.temp_max_c);
              const humidity = readingLevel(
                r.humidity_pct,
                section?.humidity_min ?? null,
                section?.humidity_max ?? null
              );
              return (
                <article key={r.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-bold text-forest">
                        {section?.name ?? "General area"}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {warehouseById.get(r.warehouse_id)?.name ?? "Warehouse"}
                      </p>
                    </div>
                    <SourceTag source={r.source} />
                  </div>

                  <dl className="mt-2.5 grid grid-cols-2 gap-2">
                    <Reading icon={Thermometer} label="Temperature" value={r.temperature_c != null ? `${r.temperature_c} °C` : "—"} level={temp} />
                    <Reading icon={Droplets} label="Humidity" value={r.humidity_pct != null ? `${r.humidity_pct}%` : "—"} level={humidity} />
                    <Reading icon={Droplets} label="Moisture" value={r.moisture_pct != null ? `${r.moisture_pct}%` : "—"} />
                    <Reading icon={Wind} label="Ventilation" value={r.ventilation ?? "—"} />
                  </dl>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3 w-3" /> {formatDateTime(r.recorded_at)}
                    </span>
                    {r.pest_seen && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 font-bold text-rose-800">
                        <Bug className="h-3 w-3" /> pest seen
                      </span>
                    )}
                    {r.fumigated_on && <span>fumigated {formatDate(r.fumigated_on)}</span>}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </Panel>

      <section>
        <SectionHeading title="Reading history" hint="Every reading is a manual entry unless marked sensor" />
        <Panel
          title="History"
          description={`${filtered.length} recorded`}
          action={
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={`${inputClass} h-8 w-44 text-[11.5px]`}
            >
              <option value="all">All warehouses</option>
              {warehouseList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          }
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No readings recorded for this warehouse.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[11.5px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-bold">When</th>
                    <th className="px-4 py-2 font-bold">Area</th>
                    <th className="px-4 py-2 font-bold">Temp</th>
                    <th className="px-4 py-2 font-bold">Humidity</th>
                    <th className="px-4 py-2 font-bold">Ventilation</th>
                    <th className="px-4 py-2 font-bold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const section = r.section_id ? sectionById.get(r.section_id) : undefined;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-slate-500">{formatDateTime(r.recorded_at)}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-forest">{section?.name ?? "General area"}</p>
                          <p className="text-[10px] text-slate-500">
                            {warehouseById.get(r.warehouse_id)?.name ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          {r.temperature_c != null ? `${r.temperature_c} °C` : "—"}
                          {r.temperature_c != null && (
                            <span className="ml-1.5">
                              <ReadingLevelTag
                                level={readingLevel(r.temperature_c, section?.temp_min_c, section?.temp_max_c)}
                              />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {r.humidity_pct != null ? `${r.humidity_pct}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5 capitalize text-slate-600">{r.ventilation ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <SourceTag source={r.source} />
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

      {addOpen && (
        <ReadingModal
          warehouses={warehouseList}
          sections={sectionList}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            readings.reload();
          }}
        />
      )}
    </WarehouseLayout>
  );
}

function SourceTag({ source }: { source: "manual" | "sensor" }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${source === "sensor"
          ? "bg-sky-100 text-sky-800"
          : "bg-slate-100 text-slate-600"
        }`}
    >
      {source === "sensor" ? "sensor" : "manual"}
    </span>
  );
}

function Reading({
  icon: Icon,
  label,
  value,
  level,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  level?: ReadingLevel;
}) {
  const colour =
    level === "critical" ? "text-rose-700" : level === "warning" ? "text-amber-700" : "text-forest";
  return (
    <div>
      <dt className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className={`truncate text-[13px] font-bold ${colour}`}>{value}</dd>
    </div>
  );
}

/* ── Record a reading ──────────────────────────────────────────────────── */

function ReadingModal({
  warehouses,
  sections,
  onClose,
  onSaved,
}: {
  warehouses: Warehouse[];
  sections: WarehouseSection[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [sectionId, setSectionId] = useState("");
  const [temp, setTemp] = useState("");
  const [humidity, setHumidity] = useState("");
  const [moisture, setMoisture] = useState("");
  const [ventilation, setVentilation] = useState<"good" | "fair" | "poor" | "">("");
  const [pestSeen, setPestSeen] = useState(false);
  const [fumigated, setFumigated] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = sections.filter((s) => s.warehouse_id === warehouseId);

  async function handleSave() {
    if (!warehouseId) {
      setError("Choose a warehouse.");
      return;
    }
    if (!temp.trim() && !humidity.trim() && !moisture.trim()) {
      setError("Record at least one measurement.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await recordReading({
        warehouse_id: warehouseId,
        section_id: sectionId || null,
        temperature_c: temp.trim() ? Number(temp) : null,
        humidity_pct: humidity.trim() ? Number(humidity) : null,
        moisture_pct: moisture.trim() ? Number(moisture) : null,
        ventilation: ventilation || null,
        pest_seen: pestSeen,
        fumigated_on: fumigated || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide title="Record a reading" subtitle="Entered by a person — no sensor is connected">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Warehouse" required>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setSectionId("");
              }}
              className={inputClass}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Storage section" hint="Alerts compare against this section's configured range.">
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={inputClass}>
              <option value="">Whole warehouse</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Temperature (°C)">
            <input value={temp} onChange={(e) => setTemp(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Humidity (%)">
            <input value={humidity} onChange={(e) => setHumidity(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Crop moisture (%)">
            <input value={moisture} onChange={(e) => setMoisture(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ventilation">
            <select
              value={ventilation}
              onChange={(e) => setVentilation(e.target.value as "" | "good" | "fair" | "poor")}
              className={inputClass}
            >
              <option value="">Not checked</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </Field>
          <Field label="Last fumigation">
            <input type="date" value={fumigated} onChange={(e) => setFumigated(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <input
            type="checkbox"
            checked={pestSeen}
            onChange={(e) => setPestSeen(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-700"
          />
          <span className="text-[11.5px] text-slate-700">Pest activity seen during inspection</span>
        </label>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
            placeholder="e.g. door left open overnight, rodent droppings near bay 3"
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
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Record reading"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
