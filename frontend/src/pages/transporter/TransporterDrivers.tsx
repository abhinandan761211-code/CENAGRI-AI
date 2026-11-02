import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import TransporterLayout from "@/components/transporter/TransporterLayout";
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
  createDriver,
  deleteDriver,
  describeTransporterError,
  formatDate,
  licenceState,
  listDrivers,
  listFleet,
  updateDriver,
} from "@/lib/transporter";
import type { Driver, FleetVehicle } from "@/lib/transporter";

type FormState = {
  full_name: string;
  phone: string;
  licence_no: string;
  licence_expiry: string;
  experience_years: string;
  assigned_vehicle_id: string;
  status: Driver["status"];
  notes: string;
};

const EMPTY: FormState = {
  full_name: "",
  phone: "",
  licence_no: "",
  licence_expiry: "",
  experience_years: "0",
  assigned_vehicle_id: "",
  status: "available",
  notes: "",
};

const STATUS_STYLE: Record<Driver["status"], string> = {
  available: "bg-emerald-100 text-emerald-800",
  on_trip: "bg-amber-100 text-amber-800",
  leave: "bg-slate-100 text-slate-600",
  inactive: "bg-rose-100 text-rose-800",
};

/**
 * Driver management.
 *
 * Licence numbers are kept for matching a driver to a trip. The licence
 * DOCUMENT is never read by this screen — `listDrivers` does not select
 * `licence_document_url` for display, and that file lives in a private bucket
 * that only the owner and an authorised reviewer can open.
 */
export default function TransporterDrivers() {
  const D = describeTransporterError;
  const drivers = useWorkerData<Driver[]>(() => listDrivers(), [], D);
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<Driver | null>(null);

  const rows = drivers.data ?? [];
  const vehicles = fleet.data ?? [];

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setOpen(true);
  }

  function startEdit(driver: Driver) {
    setEditing(driver);
    setError("");
    setForm({
      full_name: driver.full_name,
      phone: driver.phone ?? "",
      licence_no: driver.licence_no ?? "",
      licence_expiry: driver.licence_expiry ?? "",
      experience_years: String(driver.experience_years ?? 0),
      assigned_vehicle_id: driver.assigned_vehicle_id ?? "",
      status: driver.status,
      notes: driver.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (form.full_name.trim().length < 2) {
      setError("Enter the driver's full name.");
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      licence_no: form.licence_no.trim().toUpperCase() || null,
      licence_expiry: form.licence_expiry || null,
      experience_years: Number(form.experience_years) || 0,
      assigned_vehicle_id: form.assigned_vehicle_id || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) await updateDriver(editing.id, payload);
      else await createDriver(payload);
      setOpen(false);
      drivers.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(driver: Driver) {
    setBusy(true);
    setError("");
    try {
      await deleteDriver(driver.id);
      setRemoving(null);
      drivers.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TransporterLayout
      title="Driver Management"
      subtitle={`${rows.length} driver${rows.length === 1 ? "" : "s"} on your account`}
      action={
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add driver
        </button>
      }
    >
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          A driver's licence document is stored privately and is never shown to other users. Only a
          valid licence can be assigned to a trip.
        </span>
      </div>

      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {drivers.state === "loading" && <Loading label="Loading drivers…" />}
      {drivers.state === "error" && <ErrorNotice message={drivers.error} onRetry={drivers.reload} />}

      {drivers.state === "ready" && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Users}
            title="No drivers added yet"
            description="Add the people who drive your vehicles, with their licence details. You can assign a driver to a trip once a booking is confirmed."
            action={
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add driver
              </button>
            }
          />
        </div>
      )}

      {drivers.state === "ready" && rows.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((driver) => {
            const lic = licenceState(driver);
            const vehicle = vehicles.find((v) => v.id === driver.assigned_vehicle_id);
            return (
              <Panel
                key={driver.id}
                title={driver.full_name}
                description={driver.phone ?? "No phone on file"}
                action={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${STATUS_STYLE[driver.status]}`}
                  >
                    {driver.status.replace("_", " ")}
                  </span>
                }
              >
                <div className="space-y-3 p-4 sm:p-5">
                  <dl className="grid grid-cols-3 gap-2">
                    <Mini label="Licence" value={driver.licence_no ?? "—"} />
                    <Mini label="Expiry" value={driver.licence_expiry ? formatDate(driver.licence_expiry) : "—"} />
                    <Mini label="Experience" value={`${driver.experience_years} yrs`} />
                  </dl>

                  {lic.expired && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-semibold text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> Licence expired
                      {lic.days != null ? ` ${Math.abs(lic.days)} days ago` : ""} — this driver cannot be
                      assigned to a trip.
                    </p>
                  )}
                  {!lic.expired && lic.expiringSoon && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" /> Licence expires in {lic.days} days
                    </p>
                  )}

                  <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
                    {vehicle
                      ? `Assigned to ${vehicle.registration_no ?? vehicle.vehicle_type ?? "a vehicle"}`
                      : "No vehicle assigned"}
                  </p>

                  {driver.notes && (
                    <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                      {driver.notes}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => startEdit(driver)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <UserRound className="h-3 w-3" /> Edit
                    </button>
                    {driver.phone && (
                      <a
                        href={`tel:${driver.phone.replace(/[^0-9+]/g, "")}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Phone className="h-3 w-3" /> Call
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={driver.status === "on_trip"}
                      onClick={() => setRemoving(driver)}
                      className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                      title={driver.status === "on_trip" ? "A driver on a trip cannot be removed" : undefined}
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit driver" : "Add a driver"}>
        <div className="space-y-3">
          <Field label="Full name" required>
            <input
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              className={inputClass}
              placeholder="e.g. Suresh Yadav"
              maxLength={120}
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              className={inputClass}
              inputMode="tel"
              placeholder="e.g. 9876543210"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Licence number">
              <input
                value={form.licence_no}
                onChange={(e) => set("licence_no", e.target.value.toUpperCase())}
                className={inputClass}
                placeholder="e.g. BR-0720110012345"
              />
            </Field>
            <Field label="Licence valid till">
              <input
                type="date"
                value={form.licence_expiry}
                onChange={(e) => set("licence_expiry", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Experience (years)">
              <input
                type="number"
                min={0}
                max={60}
                value={form.experience_years}
                onChange={(e) => set("experience_years", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as Driver["status"])}
                className={inputClass}
              >
                <option value="available">Available</option>
                <option value="on_trip">On a trip</option>
                <option value="leave">On leave</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
          <Field label="Assigned vehicle" hint="Optional — you can also assign a vehicle when starting a trip.">
            <select
              value={form.assigned_vehicle_id}
              onChange={(e) => set("assigned_vehicle_id", e.target.value)}
              className={inputClass}
            >
              <option value="">No vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration_no ?? v.vehicle_type ?? "Vehicle"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              maxLength={500}
              className={`${inputClass} resize-none`}
              placeholder="e.g. Knows the Supaul–Patna route well."
            />
          </Field>

          {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
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
              {busy ? "Saving…" : editing ? "Save changes" : "Add driver"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this driver?"
        subtitle={removing?.full_name}
      >
        <p className="text-[12px] leading-relaxed text-slate-600">
          The driver is removed from your list. Trips they already completed keep their record.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setRemoving(null)}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => removing && void handleDelete(removing)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> {busy ? "Removing…" : "Remove driver"}
          </button>
        </div>
      </Modal>
    </TransporterLayout>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-2 text-center">
      <dt className="text-[9.5px] font-bold uppercase text-slate-500">{label}</dt>
      <dd className="truncate text-[11.5px] font-extrabold text-forest">{value}</dd>
    </div>
  );
}
