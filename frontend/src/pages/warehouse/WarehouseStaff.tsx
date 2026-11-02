import { useMemo, useState } from "react";
import { Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import { SectionHeading } from "@/components/warehouse/ui";
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
  STAFF_ROLES,
  STAFF_ROLE_LABEL,
  createStaff,
  defaultPermissions,
  describeWarehouseError,
  formatDate,
  listStaff,
  listWarehouses,
  removeStaff,
  updateStaff,
} from "@/lib/warehouse";
import type { StaffRole, Warehouse, WarehouseStaff } from "@/lib/warehouse";

/**
 * Staff Management.
 *
 * Staff are assigned to one warehouse and given narrow permissions. Nobody gets
 * the owner's ability to change pricing, edit the warehouse or see financial
 * totals — those stay with the owner account.
 */
export default function WarehouseStaffPage() {
  const D = describeWarehouseError;
  const staff = useWorkerData<WarehouseStaff[]>(() => listStaff(), [], D);
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseStaff | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WarehouseStaff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const staffList = staff.data ?? [];
  const warehouseList = warehouses.data ?? [];
  const whById = useMemo(() => new Map(warehouseList.map((w) => [w.id, w])), [warehouseList]);

  async function handleRemove() {
    if (!removeTarget) return;
    setBusy(true);
    setError("");
    try {
      await removeStaff(removeTarget.id);
      staff.reload();
      setRemoveTarget(null);
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(staffRow: WarehouseStaff, status: WarehouseStaff["status"]) {
    setError("");
    try {
      await updateStaff(staffRow.id, { status });
      staff.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  if (staff.state === "loading") {
    return (
      <WarehouseLayout title="Staff Management">
        <Loading label="Loading staff…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Staff Management"
      subtitle="Who can receive goods, release stock and inspect"
      action={
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setError("");
            setFormOpen(true);
          }}
          disabled={warehouseList.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add staff
        </button>
      }
    >
      {staff.state === "error" && <ErrorNotice message={staff.error} onRetry={staff.reload} />}
      {error && <ErrorNotice message={error} />}

      <Panel title="Staff" description={`${staffList.length} member(s)`}>
        {staffList.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No staff added"
            description="Add the people who work at the gate and in the store, and give each only the permissions their job needs. You keep control of pricing and the warehouse record."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">Name</th>
                  <th className="px-4 py-2 font-bold">Warehouse</th>
                  <th className="px-4 py-2 font-bold">Role</th>
                  <th className="px-4 py-2 font-bold">Permissions</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                  <th className="px-4 py-2 font-bold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-forest">{s.full_name}</p>
                      <p className="text-[10px] text-slate-500">{s.phone ?? "No phone"} · since {formatDate(s.created_at)}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {whById.get(s.warehouse_id)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {STAFF_ROLE_LABEL[s.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {s.can_inward && <Perm>Inward</Perm>}
                        {s.can_outward && <Perm>Outward</Perm>}
                        {s.can_inspect && <Perm>Inspect</Perm>}
                        {s.can_manage_pricing && <Perm>Pricing</Perm>}
                        {!s.can_inward && !s.can_outward && !s.can_inspect && !s.can_manage_pricing && (
                          <span className="text-[10px] text-slate-400">View only</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={s.status}
                        onChange={(e) => void handleStatus(s, e.target.value as WarehouseStaff["status"])}
                        className={`rounded-full border-0 px-2 py-0.5 text-[10px] font-bold ${
                          s.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(s);
                            setFormOpen(true);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(s)}
                          aria-label={`Remove ${s.full_name}`}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section>
        <SectionHeading title="Permission model" hint="Nobody gets more than their job needs" />
        <Panel title="What each role can do">
          <ul className="divide-y divide-slate-100">
            {STAFF_ROLES.map((role) => {
              const perms = defaultPermissions(role);
              return (
                <li key={role} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="w-40 text-[11.5px] font-semibold text-forest">{STAFF_ROLE_LABEL[role]}</span>
                  <div className="flex flex-wrap gap-1">
                    {perms.can_inward && <Perm>Inward</Perm>}
                    {perms.can_outward && <Perm>Outward</Perm>}
                    {perms.can_inspect && <Perm>Inspect</Perm>}
                    {!perms.can_inward && !perms.can_outward && !perms.can_inspect && (
                      <span className="text-[10px] text-slate-400">View only</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-[10.5px] leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
            <span>
              No staff role can change pricing, edit the warehouse or mark an invoice paid. Those stay
              with the owner account and, for payment, with the CenAGRI backend.
            </span>
          </div>
        </Panel>
      </section>

      {formOpen && (
        <StaffModal
          key={editing?.id ?? "new"}
          staffRow={editing}
          warehouses={warehouseList}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            staff.reload();
          }}
        />
      )}

      <Modal
        open={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        title="Remove this staff member?"
        subtitle={removeTarget?.full_name}
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-slate-600">
            They lose access to this warehouse immediately. Goods records they created keep their name,
            so the audit trail stays intact.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" /> {busy ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </Modal>
    </WarehouseLayout>
  );
}

function Perm({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9.5px] font-bold text-brand-800">
      {children}
    </span>
  );
}

function StaffModal({
  staffRow,
  warehouses,
  onClose,
  onSaved,
}: {
  staffRow: WarehouseStaff | null;
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeWarehouseError;
  const [warehouseId, setWarehouseId] = useState(staffRow?.warehouse_id ?? warehouses[0]?.id ?? "");
  const [fullName, setFullName] = useState(staffRow?.full_name ?? "");
  const [phone, setPhone] = useState(staffRow?.phone ?? "");
  const [role, setRole] = useState<StaffRole>(staffRow?.role ?? "inward");
  const [perms, setPerms] = useState({
    can_inward: staffRow?.can_inward ?? true,
    can_outward: staffRow?.can_outward ?? false,
    can_inspect: staffRow?.can_inspect ?? false,
    can_manage_pricing: false,
  });
  const [notes, setNotes] = useState(staffRow?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickRole(next: StaffRole) {
    setRole(next);
    setPerms({ ...defaultPermissions(next), can_manage_pricing: false });
  }

  async function handleSave() {
    if (fullName.trim().length < 2) {
      setError("Enter the staff member's name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        warehouse_id: warehouseId,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        role,
        ...perms,
        can_manage_pricing: false,
        notes: notes.trim() || null,
      };
      if (staffRow) await updateStaff(staffRow.id, payload);
      else await createStaff(payload);
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide title={staffRow ? "Edit staff" : "Add staff"}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} inputMode="tel" />
          </Field>
          <Field label="Warehouse" required>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role" required hint="Choosing a role sets the intended permissions.">
            <select value={role} onChange={(e) => pickRole(e.target.value as StaffRole)} className={inputClass}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Permissions">
          <div className="space-y-1.5">
            {(
              [
                ["can_inward", "Record goods inward (GRN)"],
                ["can_outward", "Release stock and issue gate passes"],
                ["can_inspect", "Record quality inspections"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={perms[key]}
                  onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-brand-700"
                />
                <span className="text-[11.5px] text-slate-700">{label}</span>
              </label>
            ))}
            <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] text-slate-500">
              Pricing, warehouse editing and payments are owner-only and cannot be granted here.
            </p>
          </div>
        </Field>

        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
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
            {busy ? "Saving…" : staffRow ? "Save changes" : "Add staff"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
