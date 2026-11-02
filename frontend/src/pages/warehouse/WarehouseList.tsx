import { useMemo, useState } from "react";
import {
  Boxes,
  Eye,
  EyeOff,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import WarehouseLayout, { WAREHOUSE_ROUTES, warehouseDetailPath } from "@/components/warehouse/WarehouseLayout";
import {
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
  COMMODITY_CATEGORIES,
  COMMODITY_LABEL,
  FACILITY_OPTIONS,
  LOADING_OPTIONS,
  SECURITY_OPTIONS,
  WAREHOUSE_TYPES,
  WAREHOUSE_TYPE_LABEL,
  archiveWarehouse,
  canAccommodate,
  createWarehouse,
  describeWarehouseError,
  formatTime,
  formatWeight,
  listCapacity,
  listWarehouses,
  toKg,
  toggleListing,
  updateWarehouse,
  warehouseTotals,
} from "@/lib/warehouse";
import type {
  CommodityCategory,
  Warehouse,
  WarehouseCapacity,
  WarehouseType,
} from "@/lib/warehouse";
import type { WarehouseInput } from "@/lib/warehouse";

/**
 * My Warehouses — one owner, many locations.
 *
 * Capacity figures are read from `warehouse_capacity_view`, so what this page
 * shows is what the database actually holds. Editing capacity here changes the
 * declared total; the occupied and reserved figures are owned by bookings and
 * receipts and can never be typed in by hand.
 */
export default function WarehouseList() {
  const D = describeWarehouseError;
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);
  const capacity = useWorkerData<WarehouseCapacity[]>(() => listCapacity(), [], D);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Warehouse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const warehouseList = warehouses.data ?? [];
  const capacityList = capacity.data ?? [];
  const capById = useMemo(
    () => new Map(capacityList.map((c) => [c.id, c])),
    [capacityList]
  );
  const totals = useMemo(() => warehouseTotals(capacityList), [capacityList]);

  function openAdd() {
    setEditing(null);
    setError("");
    setFormOpen(true);
  }

  function openEdit(wh: Warehouse) {
    setEditing(wh);
    setError("");
    setFormOpen(true);
  }

  async function handleToggleListing(wh: Warehouse) {
    setError("");
    try {
      await toggleListing(wh.id, !wh.is_listed);
      warehouses.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    setError("");
    try {
      await archiveWarehouse(archiveTarget.id);
      setArchiveTarget(null);
      warehouses.reload();
      capacity.reload();
    } catch (err) {
      setError(D(err));
      setArchiveTarget(null);
    } finally {
      setBusy(false);
    }
  }

  if (warehouses.state === "loading") {
    return (
      <WarehouseLayout title="My Warehouses">
        <Loading label="Loading your warehouses…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="My Warehouses"
      subtitle="Facilities, locations, capacity and listings"
      action={
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add warehouse
        </button>
      }
    >
      {warehouses.state === "error" && (
        <ErrorNotice message={warehouses.error} onRetry={warehouses.reload} />
      )}
      {error && <ErrorNotice message={error} />}

      {warehouseList.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Warehouses" value={String(totals.warehouses)} />
          <Tile label="Total capacity" value={formatWeight(totals.capacity_kg)} />
          <Tile label="Occupied" value={formatWeight(totals.occupied_kg)} />
          <Tile label="Free now" value={formatWeight(totals.available_kg)} />
        </section>
      )}

      {warehouseList.length === 0 ? (
        <Panel title="Warehouses" description="Add your first facility">
          <EmptyState
            icon={WarehouseIcon}
            title="No warehouse yet"
            description="A warehouse is the anchor for capacity, bookings, goods inward and inventory. Add name, type and total capacity to begin — the rest can be filled in later."
            action={
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add warehouse
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {warehouseList.map((wh) => {
            const cap = capById.get(wh.id);
            return (
              <Panel
                key={wh.id}
                title={wh.name}
                description={[wh.village, wh.district, wh.state].filter(Boolean).join(", ") || "Location not set"}
                action={
                  <div className="flex items-center gap-1.5">
                    <WarehouseTypeTag type={wh.warehouse_type} />
                    <button
                      type="button"
                      onClick={() => void handleToggleListing(wh)}
                      title={wh.is_listed ? "Hide from customers" : "List for customers"}
                      className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                    >
                      {wh.is_listed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(wh)}
                      title="Edit warehouse"
                      className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(wh)}
                      title="Archive warehouse"
                      className="rounded-lg border border-slate-300 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                }
              >
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <OccupancyRing percent={cap?.utilisation_pct ?? 0} />
                    <div className="min-w-0 flex-1">
                      <CapacityBar
                        capacityKg={cap?.capacity_kg ?? wh.total_capacity_kg ?? wh.capacity_kg}
                        reservedKg={cap?.reserved_kg ?? wh.reserved_kg}
                        occupiedKg={cap?.occupied_kg ?? wh.occupied_kg}
                      />
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        {formatWeight(cap?.available_kg ?? 0)} free of{" "}
                        {formatWeight(cap?.capacity_kg ?? wh.total_capacity_kg ?? wh.capacity_kg)}
                      </p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-[11px]">
                    <Info label="Type" value={wh.warehouse_type ? WAREHOUSE_TYPE_LABEL[wh.warehouse_type] : "—"} />
                    <Info label="Hours" value={`${formatTime(wh.opens_at)} – ${formatTime(wh.closes_at)}`} />
                    <Info label="Contact" value={wh.contact_phone ?? wh.contact_name ?? "—"} />
                    <Info label="Listed" value={wh.is_listed ? "Yes" : "Hidden"} />
                  </dl>

                  {wh.accepted_commodities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {wh.accepted_commodities.slice(0, 5).map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                        >
                          {COMMODITY_LABEL[c as CommodityCategory] ?? c}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    <VerificationBadge state={wh.verification} />
                    <Link
                      to={warehouseDetailPath(wh.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-3 text-[11px] font-semibold text-white hover:bg-brand-800"
                    >
                      <MapPin className="h-3 w-3" /> Manage
                    </Link>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Panel title="Before you list" description="What customers can and cannot see">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li className="flex gap-1.5">
            <Boxes className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            Only listed warehouses show up in customer search. Hidden ones stay fully manageable for you.
          </li>
          <li className="flex gap-1.5">
            <Boxes className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            Occupied and reserved capacity are calculated from bookings and receipts — never typed in.
          </li>
          <li className="flex gap-1.5">
            <Boxes className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            A warehouse with booking history is archived, never deleted, so depositor records stay intact.
          </li>
        </ul>
      </Panel>

      {formOpen && (
        <WarehouseFormModal
          key={editing?.id ?? "new"}
          warehouse={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            warehouses.reload();
            capacity.reload();
          }}
        />
      )}

      <Modal
        open={archiveTarget != null}
        onClose={() => setArchiveTarget(null)}
        title="Archive this warehouse?"
        subtitle={archiveTarget?.name}
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-slate-600">
            Archiving hides the warehouse from customers and removes it from your active list. Past
            bookings, lots and invoices stay intact. It cannot hold new bookings afterwards.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setArchiveTarget(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" /> {busy ? "Archiving…" : "Archive"}
            </button>
          </div>
        </div>
      </Modal>
    </WarehouseLayout>
  );
}

/* ── Add / edit form ───────────────────────────────────────────────────── */

function WarehouseFormModal({
  warehouse,
  onClose,
  onSaved,
}: {
  warehouse: Warehouse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(warehouse?.name ?? "");
  const [type, setType] = useState<WarehouseType>(warehouse?.warehouse_type ?? "general");
  const [address, setAddress] = useState(warehouse?.address_line ?? "");
  const [village, setVillage] = useState(warehouse?.village ?? "");
  const [district, setDistrict] = useState(warehouse?.district ?? "");
  const [state, setState] = useState(warehouse?.state ?? "");
  const [pincode, setPincode] = useState(warehouse?.pincode ?? "");
  const [lat, setLat] = useState(warehouse?.lat != null ? String(warehouse.lat) : "");
  const [lng, setLng] = useState(warehouse?.lng != null ? String(warehouse.lng) : "");
  /** Capacity is typed in tonnes; the database takes kg. */
  const [capacityT, setCapacityT] = useState(
    warehouse ? String(Number(warehouse.total_capacity_kg ?? warehouse.capacity_kg) / 1000) : ""
  );
  const [contactName, setContactName] = useState(warehouse?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(warehouse?.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(warehouse?.contact_email ?? "");
  const [opensAt, setOpensAt] = useState((warehouse?.opens_at ?? "08:00:00").slice(0, 5));
  const [closesAt, setClosesAt] = useState((warehouse?.closes_at ?? "18:00:00").slice(0, 5));
  const [facilities, setFacilities] = useState<string[]>(warehouse?.facilities ?? []);
  const [loading, setLoading] = useState<string[]>(warehouse?.loading_facilities ?? []);
  const [security, setSecurity] = useState<string[]>(warehouse?.security_facilities ?? []);
  const [commodities, setCommodities] = useState<string[]>(warehouse?.accepted_commodities ?? []);
  const [isListed, setIsListed] = useState(warehouse?.is_listed ?? true);
  const [about, setAbout] = useState(warehouse?.about ?? "");

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function handleSave() {
    if (name.trim().length < 2) {
      setError("Enter a warehouse name.");
      return;
    }
    const capacityNumber = Number(capacityT);
    if (!Number.isFinite(capacityNumber) || capacityNumber <= 0) {
      setError("Enter the total capacity in metric tonnes.");
      return;
    }
    const capacityKg = toKg(capacityNumber, "tonne");

    // The database enforces this too; asking here gives a clearer sentence.
    const room = canAccommodate(
      warehouse
        ? {
            capacity_kg: capacityKg,
            reserved_kg: Number(warehouse.reserved_kg),
            occupied_kg: Number(warehouse.occupied_kg),
          }
        : { capacity_kg: capacityKg, reserved_kg: 0, occupied_kg: 0 },
      0
    );
    if (!room.ok && warehouse) {
      setError("Already booked stock is larger than this capacity. Release or move stock first.");
      return;
    }

    const payload: WarehouseInput = {
      name: name.trim(),
      warehouse_type: type,
      address_line: address.trim() || null,
      village: village.trim() || null,
      district: district.trim() || null,
      state: state.trim() || null,
      pincode: pincode.trim() || null,
      lat: lat.trim() ? Number(lat) : null,
      lng: lng.trim() ? Number(lng) : null,
      total_capacity_kg: capacityKg,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      opens_at: opensAt,
      closes_at: closesAt,
      facilities,
      loading_facilities: loading,
      security_facilities: security,
      accepted_commodities: commodities,
      is_listed: isListed,
      about: about.trim() || null,
    };

    setBusy(true);
    setError("");
    try {
      if (warehouse) await updateWarehouse(warehouse.id, payload);
      else await createWarehouse(payload);
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={warehouse ? "Edit warehouse" : "Add warehouse"}
      subtitle="Only the declared capacity and address are yours to set — occupancy is tracked by the system."
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Warehouse name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={120} />
          </Field>
          <Field label="Warehouse type" required>
            <select value={type} onChange={(e) => setType(e.target.value as WarehouseType)} className={inputClass}>
              {WAREHOUSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WAREHOUSE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Address">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            placeholder="Building, road, landmark"
            maxLength={200}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Village / local area">
            <input value={village} onChange={(e) => setVillage(e.target.value)} className={inputClass} />
          </Field>
          <Field label="District">
            <input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass} />
          </Field>
          <Field label="State">
            <input value={state} onChange={(e) => setState(e.target.value)} className={inputClass} />
          </Field>
          <Field label="PIN code">
            <input value={pincode} onChange={(e) => setPincode(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Total capacity (metric tonnes)"
            required
            hint={warehouse ? "Cannot be set below what is already stored." : undefined}
          >
            <input
              value={capacityT}
              onChange={(e) => setCapacityT(e.target.value)}
              className={inputClass}
              inputMode="decimal"
              placeholder="e.g. 500"
            />
          </Field>
          <Field label="Latitude" hint="Optional — shown only when you enter it.">
            <input value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Longitude">
            <input value={lng} onChange={(e) => setLng(e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Contact name">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Contact phone">
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className={inputClass}
              inputMode="tel"
            />
          </Field>
          <Field label="Contact email">
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputClass}
              inputMode="email"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opens at">
            <input type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Closes at">
            <input type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label="Storage facilities">
          <ChipPicker options={[...FACILITY_OPTIONS]} selected={facilities} onToggle={(v) => toggle(facilities, setFacilities, v)} />
        </Field>
        <Field label="Loading / unloading facilities">
          <ChipPicker options={[...LOADING_OPTIONS]} selected={loading} onToggle={(v) => toggle(loading, setLoading, v)} />
        </Field>
        <Field label="Security facilities">
          <ChipPicker options={[...SECURITY_OPTIONS]} selected={security} onToggle={(v) => toggle(security, setSecurity, v)} />
        </Field>
        <Field
          label="Accepted commodities"
          hint="A storage section holds one category only — these are what you accept at all."
        >
          <ChipPicker
            options={COMMODITY_CATEGORIES.map((c) => COMMODITY_LABEL[c])}
            values={[...COMMODITY_CATEGORIES]}
            selected={commodities.map((c) => COMMODITY_LABEL[c as CommodityCategory] ?? c)}
            onToggle={(label) => {
              const key = COMMODITY_CATEGORIES.find((c) => COMMODITY_LABEL[c] === label);
              if (key) toggle(commodities, setCommodities, key);
            }}
          />
        </Field>

        <Field label="About this warehouse">
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={3}
            maxLength={1500}
            className={`${inputClass} resize-none`}
            placeholder="What you store, how goods are handled, anything a depositor should know."
          />
        </Field>

        <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={isListed}
            onChange={(e) => setIsListed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700"
          />
          <span className="text-[11.5px] leading-relaxed text-slate-600">
            <strong className="font-semibold text-forest">List this warehouse for customers.</strong> When
            on, farmers, buyers and retailers can find it and send storage requests.
          </span>
        </label>

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
            {busy ? "Saving…" : warehouse ? "Save changes" : "Create warehouse"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

function ChipPicker({
  options,
  values,
  selected,
  onToggle,
}: {
  options: string[];
  /** Optional display values when the option list is labels for stored keys. */
  values?: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              active
                ? "bg-brand-700 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-[15px] font-extrabold text-forest">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="truncate font-semibold text-forest">{value}</dd>
    </div>
  );
}
