import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Clock,
  MapPin,
  Phone,
  Plus,
  Snowflake,
  Sun,
  Thermometer,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import WarehouseLayout, { WAREHOUSE_ROUTES } from "@/components/warehouse/WarehouseLayout";
import {
  BookingStatusPill,
  CapacityBar,
  OccupancyRing,
  VerificationBadge,
  WarehouseTypeTag,
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
  BOOKING_STATUS_LABEL,
  COMMODITY_CATEGORIES,
  COMMODITY_LABEL,
  WAREHOUSE_TYPE_LABEL,
  createSection,
  describeWarehouseError,
  formatDate,
  formatTime,
  formatWeight,
  getWarehouse,
  listCapacity,
  listSections,
  listStorageBookings,
  sectionsOverAllocated,
  toKg,
} from "@/lib/warehouse";
import type {
  CommodityCategory,
  StorageBooking,
  Warehouse,
  WarehouseCapacity,
  WarehouseSection,
} from "@/lib/warehouse";

/**
 * One warehouse: its capacity split, its storage sections and its bookings.
 *
 * Sections exist so that incompatible commodities are never mixed. A section
 * carries one commodity category and its own share of the capacity.
 */
export default function WarehouseDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const D = describeWarehouseError;

  const warehouse = useWorkerData<Warehouse | null>(() => getWarehouse(id), [id], D);
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);
  const sections = useWorkerData<WarehouseSection[]>(() => listSections(id), [id], D);
  const bookings = useWorkerData<StorageBooking[]>(() => listStorageBookings(), [], D);

  const [sectionOpen, setSectionOpen] = useState(false);
  const [error, setError] = useState("");

  const wh = warehouse.data;
  const cap = (capacity.data ?? []).find((c) => c.id === id) ?? null;
  const sectionList = sections.data ?? [];
  const warehouseBookings = useMemo(
    () => (bookings.data ?? []).filter((b) => b.warehouse_id === id),
    [bookings.data, id]
  );
  const activeHere = warehouseBookings.filter((b) => !["completed", "cancelled"].includes(b.status));
  const allocation = useMemo(
    () => sectionsOverAllocated(sectionList, cap?.capacity_kg ?? wh?.total_capacity_kg ?? 0),
    [sectionList, cap, wh]
  );

  if (warehouse.state === "loading") {
    return (
      <WarehouseLayout title="Warehouse">
        <Loading label="Loading warehouse…" />
      </WarehouseLayout>
    );
  }

  if (!wh) {
    return (
      <WarehouseLayout title="Warehouse" subtitle="Not found">
        <div className="card">
          <EmptyState
            icon={Boxes}
            title="Warehouse not found"
            description="It may have been archived, or it belongs to another account."
            action={
              <Link
                to={WAREHOUSE_ROUTES.warehouses}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to warehouses
              </Link>
            }
          />
        </div>
      </WarehouseLayout>
    );
  }

  const isCold = wh.warehouse_type === "cold" || wh.warehouse_type === "fruit_veg";

  return (
    <WarehouseLayout
      title={wh.name}
      subtitle={[wh.village, wh.district, wh.state].filter(Boolean).join(", ") || "Location not set"}
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(WAREHOUSE_ROUTES.warehouses)}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All warehouses
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setSectionOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add section
          </button>
        </div>
      }
    >
      {error && <ErrorNotice message={error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Capacity"
          description="Occupied and reserved come from live bookings"
          className="lg:col-span-2"
        >
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-4">
              <OccupancyRing percent={cap?.utilisation_pct ?? 0} size={72} />
              <div className="min-w-0 flex-1">
                <CapacityBar
                  capacityKg={cap?.capacity_kg ?? wh.total_capacity_kg ?? wh.capacity_kg}
                  reservedKg={cap?.reserved_kg ?? wh.reserved_kg}
                  occupiedKg={cap?.occupied_kg ?? wh.occupied_kg}
                  height="h-3"
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total" value={formatWeight(cap?.capacity_kg ?? wh.total_capacity_kg ?? wh.capacity_kg)} />
              <Stat label="Occupied" value={formatWeight(cap?.occupied_kg ?? wh.occupied_kg)} />
              <Stat label="Reserved" value={formatWeight(cap?.reserved_kg ?? wh.reserved_kg)} />
              <Stat label="Free" value={formatWeight(cap?.available_kg ?? 0)} tone="good" />
            </dl>

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              Capacity is measured in metric tonnes at the gate. Reserved space belongs to confirmed
              bookings whose goods have not arrived; occupied space is stock physically in the store.
            </div>
          </div>
        </Panel>

        <aside className="space-y-4">
          <Panel title="Facility" description="Location, hours and contact">
            <div className="space-y-2.5 p-4 text-[11.5px]">
              <Line icon={MapPin} label="Address" value={[wh.address_line, wh.village, wh.pincode].filter(Boolean).join(", ") || "Not set"} />
              <Line icon={Clock} label="Hours" value={`${formatTime(wh.opens_at)} – ${formatTime(wh.closes_at)}`} />
              <Line icon={Phone} label="Phone" value={wh.contact_phone ?? "Not set"} />
              <Line
                icon={isCold ? Snowflake : Sun}
                label="Type"
                value={wh.warehouse_type ? WAREHOUSE_TYPE_LABEL[wh.warehouse_type] : "Not set"}
              />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                <WarehouseTypeTag type={wh.warehouse_type} />
                <VerificationBadge state={wh.verification} />
                {!wh.is_listed && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    Not listed
                  </span>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Facilities">
            <div className="p-4">
              {[...wh.facilities, ...wh.loading_facilities, ...wh.security_facilities].length === 0 ? (
                <p className="text-[11.5px] text-slate-500">
                  No facilities recorded. Edit the warehouse to add power backup, weighbridge, CCTV and
                  the likes — customers filter on these.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[...wh.facilities, ...wh.loading_facilities, ...wh.security_facilities].map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold text-brand-800"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      <Panel
        title="Storage sections"
        description="A section holds one commodity category — grain never shares with cold-chain produce"
        action={
          allocation.over ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              <AlertTriangle className="h-3 w-3" /> Over-allocated
            </span>
          ) : undefined
        }
      >
        {sectionList.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No sections defined"
            description="Sections let you split one godown into separate areas — e.g. Paddy block A and Mustard block B — so different commodities never mix. Add one to organise space."
          />
        ) : (
          <>
            {allocation.over && (
              <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
                Sections add up to {formatWeight(allocation.allocated)}, more than the warehouse holds.
                Reduce a section before accepting new bookings.
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {sectionList.map((sec) => (
                <li key={sec.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-forest">{sec.name}</p>
                      <p className="text-[10.5px] text-slate-500">
                        {COMMODITY_LABEL[sec.commodity_category]} · {formatWeight(sec.capacity_kg)}
                        {sec.temp_min_c != null && sec.temp_max_c != null
                          ? ` · ${sec.temp_min_c}–${sec.temp_max_c} °C`
                          : ""}
                      </p>
                    </div>
                    <div className="w-40 shrink-0">
                      <CapacityBar
                        capacityKg={sec.capacity_kg}
                        reservedKg={sec.reserved_kg}
                        occupiedKg={sec.occupied_kg}
                        showLegend={false}
                        height="h-1.5"
                      />
                      <p className="mt-1 text-right text-[10px] text-slate-500">
                        {formatWeight(sec.occupied_kg)} occupied
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel title="Bookings at this warehouse" description={`${activeHere.length} active`}>
        {warehouseBookings.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No bookings here yet"
            description="Accept a storage request or create a booking to start filling this warehouse."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">Depositor</th>
                  <th className="px-4 py-2 font-bold">Crop</th>
                  <th className="px-4 py-2 font-bold">Quantity</th>
                  <th className="px-4 py-2 font-bold">Period</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouseBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-forest">{b.depositor_name ?? "Depositor"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{b.crop_name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">
                      {formatWeight(Number(b.quantity_kg))}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {formatDate(b.starts_on)} → {formatDate(b.ends_on)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span title={BOOKING_STATUS_LABEL[b.status]}>
                        <BookingStatusPill status={b.status} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {sectionOpen && (
        <SectionModal
          warehouseId={id}
          onClose={() => setSectionOpen(false)}
          onSaved={() => {
            setSectionOpen(false);
            sections.reload();
          }}
        />
      )}
    </WarehouseLayout>
  );
}

function SectionModal({
  warehouseId,
  onClose,
  onSaved,
}: {
  warehouseId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CommodityCategory>("grain");
  const [capacityT, setCapacityT] = useState("");
  const [tempMin, setTempMin] = useState("");
  const [tempMax, setTempMax] = useState("");
  const [humMin, setHumMin] = useState("");
  const [humMax, setHumMax] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSave() {
    if (name.trim().length < 1) {
      setError("Give the section a name, e.g. Block A.");
      return;
    }
    const tonnes = Number(capacityT);
    if (!Number.isFinite(tonnes) || tonnes <= 0) {
      setError("Enter the section capacity in metric tonnes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createSection({
        warehouse_id: warehouseId,
        name: name.trim(),
        commodity_category: category,
        capacity_kg: toKg(tonnes, "tonne"),
        temp_min_c: tempMin.trim() ? Number(tempMin) : null,
        temp_max_c: tempMax.trim() ? Number(tempMax) : null,
        humidity_min: humMin.trim() ? Number(humMin) : null,
        humidity_max: humMax.trim() ? Number(humMax) : null,
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
    <Modal open onClose={onClose} wide title="Add storage section" subtitle="One commodity category per section">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Block A — Paddy" />
          </Field>
          <Field label="Commodity category" required>
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
        </div>

        <Field label="Capacity (metric tonnes)" required>
          <input value={capacityT} onChange={(e) => setCapacityT(e.target.value)} className={inputClass} inputMode="decimal" />
        </Field>

        <Field label="Acceptable range" hint="Leave blank if you do not monitor this section.">
          <div className="grid gap-2 sm:grid-cols-4">
            <input value={tempMin} onChange={(e) => setTempMin(e.target.value)} className={inputClass} placeholder="°C min" inputMode="decimal" />
            <input value={tempMax} onChange={(e) => setTempMax(e.target.value)} className={inputClass} placeholder="°C max" inputMode="decimal" />
            <input value={humMin} onChange={(e) => setHumMin(e.target.value)} className={inputClass} placeholder="%RH min" inputMode="decimal" />
            <input value={humMax} onChange={(e) => setHumMax(e.target.value)} className={inputClass} placeholder="%RH max" inputMode="decimal" />
          </div>
        </Field>

        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </Field>

        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Do not store incompatible commodities in one section. Grain absorbs odours from cold-chain
          produce and the two need very different temperatures.
        </p>

        {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
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
            {busy ? "Saving…" : "Add section"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-[13px] font-bold ${tone === "good" ? "text-emerald-700" : "text-forest"}`}>
        {value}
      </dd>
    </div>
  );
}

function Line({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin | typeof Clock | typeof Phone | typeof Thermometer | typeof Snowflake | typeof Sun;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-1.5 text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" /> {label}
      </span>
      <span className="max-w-[60%] truncate text-right font-semibold text-forest">{value}</span>
    </div>
  );
}
