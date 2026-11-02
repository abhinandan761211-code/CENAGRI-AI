import { useState } from "react";
import {
  Archive,
  BadgeCheck,
  Pencil,
  Plus,
  Truck,
  Wrench,
} from "lucide-react";
import TransporterLayout from "@/components/transporter/TransporterLayout";
import { VehicleAlertLine } from "@/components/transporter/ui";
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
  FUEL_TYPES,
  VEHICLE_TYPES,
  archiveVehicle,
  createVehicle,
  describeTransporterError,
  formatDate,
  formatWeight,
  listFleet,
  setVehicleAvailability,
  updateVehicle,
  vehicleAlerts,
} from "@/lib/transporter";
import type { FleetVehicle, VehicleInput, VehicleType } from "@/lib/transporter";
import { todayISO } from "@/lib/worker";

type FormState = {
  registration_no: string;
  vehicle_type: VehicleType;
  make_model: string;
  manufacture_year: string;
  capacity_kg: string;
  length_ft: string;
  width_ft: string;
  height_ft: string;
  fuel_type: string;
  district: string;
  state: string;
  insurance_valid_till: string;
  fitness_valid_till: string;
  permit_no: string;
  permit_valid_till: string;
  odometer_km: string;
  last_service_on: string;
  next_service_on: string;
  notes: string;
};

const EMPTY: FormState = {
  registration_no: "",
  vehicle_type: "Mini Truck",
  make_model: "",
  manufacture_year: "",
  capacity_kg: "",
  length_ft: "",
  width_ft: "",
  height_ft: "",
  fuel_type: "Diesel",
  district: "",
  state: "",
  insurance_valid_till: "",
  fitness_valid_till: "",
  permit_no: "",
  permit_valid_till: "",
  odometer_km: "",
  last_service_on: "",
  next_service_on: "",
  notes: "",
};

/**
 * Fleet management.
 *
 * Vehicles are archived rather than deleted: a booking history has to stay
 * traceable, so a vehicle that carried a past trip cannot simply vanish. The
 * archive action is refused server-side by the RLS/foreign-key shape of the
 * booking table, and the button is disabled in the UI when the vehicle is on a
 * trip.
 */
export default function TransporterVehicles() {
  const D = describeTransporterError;
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);

  const [editing, setEditing] = useState<FleetVehicle | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmArchive, setConfirmArchive] = useState<FleetVehicle | null>(null);

  const rows = fleet.data ?? [];

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setOpen(true);
  }

  function startEdit(vehicle: FleetVehicle) {
    setEditing(vehicle);
    setError("");
    setForm({
      registration_no: vehicle.registration_no ?? "",
      vehicle_type: (vehicle.vehicle_type ?? "Mini Truck") as VehicleType,
      make_model: vehicle.make_model ?? "",
      manufacture_year: vehicle.manufacture_year != null ? String(vehicle.manufacture_year) : "",
      capacity_kg: String(vehicle.capacity_kg ?? ""),
      length_ft: vehicle.length_ft != null ? String(vehicle.length_ft) : "",
      width_ft: vehicle.width_ft != null ? String(vehicle.width_ft) : "",
      height_ft: vehicle.height_ft != null ? String(vehicle.height_ft) : "",
      fuel_type: vehicle.fuel_type ?? "Diesel",
      district: vehicle.district ?? "",
      state: vehicle.state ?? "",
      insurance_valid_till: vehicle.insurance_valid_till ?? "",
      fitness_valid_till: vehicle.fitness_valid_till ?? "",
      permit_no: vehicle.permit_no ?? "",
      permit_valid_till: vehicle.permit_valid_till ?? "",
      odometer_km: vehicle.odometer_km != null ? String(vehicle.odometer_km) : "",
      last_service_on: vehicle.last_service_on ?? "",
      next_service_on: vehicle.next_service_on ?? "",
      notes: vehicle.notes ?? "",
    });
    setOpen(true);
  }

  function toInput(): VehicleInput | null {
    const capacity = Number(form.capacity_kg);
    if (!form.registration_no.trim()) {
      setError("Registration number is required.");
      return null;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setError("Enter the maximum load capacity in kg.");
      return null;
    }
    return {
      registration_no: form.registration_no.trim().toUpperCase(),
      vehicle_type: form.vehicle_type,
      make_model: form.make_model.trim() || null,
      manufacture_year: form.manufacture_year === "" ? null : Number(form.manufacture_year),
      capacity_kg: capacity,
      length_ft: form.length_ft === "" ? null : Number(form.length_ft),
      width_ft: form.width_ft === "" ? null : Number(form.width_ft),
      height_ft: form.height_ft === "" ? null : Number(form.height_ft),
      fuel_type: form.fuel_type || null,
      district: form.district.trim() || null,
      state: form.state.trim() || null,
      insurance_valid_till: form.insurance_valid_till || null,
      fitness_valid_till: form.fitness_valid_till || null,
      permit_no: form.permit_no.trim() || null,
      permit_valid_till: form.permit_valid_till || null,
      odometer_km: form.odometer_km === "" ? null : Number(form.odometer_km),
      last_service_on: form.last_service_on || null,
      next_service_on: form.next_service_on || null,
      notes: form.notes.trim() || null,
      available: editing?.available ?? true,
    };
  }

  async function handleSave() {
    const input = toInput();
    if (!input) return;
    setBusy(true);
    setError("");
    try {
      if (editing) await updateVehicle(editing.id, input);
      else await createVehicle(input);
      setOpen(false);
      fleet.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(vehicle: FleetVehicle) {
    if (vehicle.active_trips > 0) return;
    setBusy(true);
    setError("");
    try {
      await archiveVehicle(vehicle.id);
      setConfirmArchive(null);
      fleet.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailable(vehicle: FleetVehicle) {
    setError("");
    try {
      await setVehicleAvailability(vehicle.id, !vehicle.available);
      fleet.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  return (
    <TransporterLayout
      title="My Vehicles"
      subtitle={`${rows.length} vehicle${rows.length === 1 ? "" : "s"} in your fleet`}
      action={
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add vehicle
        </button>
      }
    >
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {fleet.state === "loading" && <Loading label="Loading your fleet…" />}
      {fleet.state === "error" && <ErrorNotice message={fleet.error} onRetry={fleet.reload} />}

      {fleet.state === "ready" && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Truck}
            title="No vehicles yet"
            description="Add your first vehicle — registration, capacity and documents. You cannot quote for a load that no vehicle can carry."
            action={
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add vehicle
              </button>
            }
          />
        </div>
      )}

      {fleet.state === "ready" && rows.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((vehicle) => {
            const alerts = vehicleAlerts(vehicle);
            const onTrip = vehicle.active_trips > 0;
            return (
              <Panel
                key={vehicle.id}
                title={vehicle.registration_no ?? "No registration"}
                description={[vehicle.vehicle_type ?? vehicle.kind, vehicle.make_model]
                  .filter(Boolean)
                  .join(" · ")}
                action={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      onTrip
                        ? "bg-amber-100 text-amber-800"
                        : vehicle.available
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {onTrip ? "On a trip" : vehicle.available ? "Available" : "Unavailable"}
                  </span>
                }
              >
                <div className="space-y-3 p-4 sm:p-5">
                  <dl className="grid grid-cols-3 gap-2">
                    <Mini label="Capacity" value={formatWeight(Number(vehicle.capacity_kg))} />
                    <Mini label="Fuel" value={vehicle.fuel_type ?? "—"} />
                    <Mini label="Year" value={vehicle.manufacture_year ? String(vehicle.manufacture_year) : "—"} />
                  </dl>

                  <dl className="grid grid-cols-3 gap-2 text-[10.5px]">
                    <Doc label="Insurance" value={formatDate(vehicle.insurance_valid_till)} />
                    <Doc label="Fitness" value={formatDate(vehicle.fitness_valid_till)} />
                    <Doc
                      label="Service"
                      value={vehicle.next_service_on ? formatDate(vehicle.next_service_on) : "—"}
                    />
                  </dl>

                  {alerts.length > 0 && <VehicleAlertLine alerts={alerts} />}

                  {vehicle.notes && (
                    <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                      {vehicle.notes}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => startEdit(vehicle)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={onTrip}
                      onClick={() => void toggleAvailable(vehicle)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {vehicle.available ? "Mark unavailable" : "Mark available"}
                    </button>
                    <button
                      type="button"
                      disabled={onTrip}
                      onClick={() => setConfirmArchive(vehicle)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      title={onTrip ? "A vehicle on a trip cannot be archived" : undefined}
                    >
                      <Archive className="h-3 w-3" /> Archive
                    </button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* ── Add / edit ── */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit vehicle" : "Add a vehicle"}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Registration number" required hint="As on the RC, e.g. BR50 AB 1234">
            <input
              value={form.registration_no}
              onChange={(e) => set("registration_no", e.target.value.toUpperCase())}
              className={inputClass}
              placeholder="BR50 AB 1234"
              maxLength={16}
            />
          </Field>
          <Field label="Vehicle type" required>
            <select
              value={form.vehicle_type}
              onChange={(e) => set("vehicle_type", e.target.value as VehicleType)}
              className={inputClass}
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Make & model">
            <input
              value={form.make_model}
              onChange={(e) => set("make_model", e.target.value)}
              className={inputClass}
              placeholder="e.g. Tata Ace Gold"
            />
          </Field>
          <Field label="Manufacturing year">
            <input
              type="number"
              min={1980}
              max={2100}
              value={form.manufacture_year}
              onChange={(e) => set("manufacture_year", e.target.value)}
              className={inputClass}
              placeholder="e.g. 2021"
            />
          </Field>
          <Field label="Max load capacity (kg)" required>
            <input
              type="number"
              min={1}
              value={form.capacity_kg}
              onChange={(e) => set("capacity_kg", e.target.value)}
              className={inputClass}
              placeholder="e.g. 1500"
            />
          </Field>
          <Field label="Fuel type">
            <select
              value={form.fuel_type}
              onChange={(e) => set("fuel_type", e.target.value)}
              className={inputClass}
            >
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Length (ft)" hint="Optional">
            <input
              type="number"
              step="0.1"
              value={form.length_ft}
              onChange={(e) => set("length_ft", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Width (ft)" hint="Optional">
            <input
              type="number"
              step="0.1"
              value={form.width_ft}
              onChange={(e) => set("width_ft", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="District">
            <input
              value={form.district}
              onChange={(e) => set("district", e.target.value)}
              className={inputClass}
              placeholder="e.g. Supaul"
            />
          </Field>
          <Field label="State">
            <input
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              className={inputClass}
              placeholder="e.g. Bihar"
            />
          </Field>
          <Field label="Insurance valid till">
            <input
              type="date"
              value={form.insurance_valid_till}
              onChange={(e) => set("insurance_valid_till", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Fitness certificate valid till">
            <input
              type="date"
              value={form.fitness_valid_till}
              onChange={(e) => set("fitness_valid_till", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Permit number">
            <input
              value={form.permit_no}
              onChange={(e) => set("permit_no", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Permit valid till">
            <input
              type="date"
              value={form.permit_valid_till}
              onChange={(e) => set("permit_valid_till", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Odometer (km)">
            <input
              type="number"
              min={0}
              value={form.odometer_km}
              onChange={(e) => set("odometer_km", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Last service">
            <input
              type="date"
              value={form.last_service_on}
              onChange={(e) => set("last_service_on", e.target.value)}
              className={inputClass}
              max={todayISO()}
            />
          </Field>
          <Field label="Next service due">
            <input
              type="date"
              value={form.next_service_on}
              onChange={(e) => set("next_service_on", e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                maxLength={500}
                className={`${inputClass} resize-none`}
                placeholder="Anything worth remembering — repairs, restrictions, tarpaulin."
              />
            </Field>
          </div>
        </div>

        {error && <p className="mt-3 text-[11.5px] font-semibold text-rose-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
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
            <BadgeCheck className="h-3.5 w-3.5" />
            {busy ? "Saving…" : editing ? "Save changes" : "Add vehicle"}
          </button>
        </div>
      </Modal>

      {/* ── Archive confirmation ── */}
      <Modal
        open={Boolean(confirmArchive)}
        onClose={() => setConfirmArchive(null)}
        title="Archive this vehicle?"
        subtitle={confirmArchive?.registration_no ?? undefined}
      >
        <p className="text-[12px] leading-relaxed text-slate-600">
          An archived vehicle stops appearing in your fleet and cannot be assigned to new trips. Past
          bookings keep their record, so your history stays accurate.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmArchive(null)}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Keep it
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => confirmArchive && void handleArchive(confirmArchive)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            <Wrench className="h-3.5 w-3.5" /> {busy ? "Archiving…" : "Archive vehicle"}
          </button>
        </div>
      </Modal>
    </TransporterLayout>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-center">
      <dt className="text-[9.5px] font-bold uppercase text-slate-500">{label}</dt>
      <dd className="truncate text-[12px] font-extrabold text-forest">{value}</dd>
    </div>
  );
}

function Doc({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
