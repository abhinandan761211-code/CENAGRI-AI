import { useMemo, useState } from "react";
import { Plus, ShieldCheck, Trash2, UserCog, UserRound } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { OperatorPrivacyNotice, SectionHeading } from "@/components/equipment/ui";
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
  OPERATOR_STATUSES,
  OPERATOR_STATUS_LABEL,
  createOperator,
  deleteOperator,
  describeEquipmentError,
  formatDate,
  licenceState,
  listBookings,
  listOperators,
  updateOperator,
} from "@/lib/equipment";
import type { EquipmentBooking, EquipmentOperator, OperatorStatus } from "@/lib/equipment";
import type { OperatorInput } from "@/lib/equipment";

const SKILL_SUGGESTIONS = [
  "Tractor",
  "Combine Harvester",
  "Rotavator",
  "Seed Drill",
  "Sprayer",
  "Drone",
  "Pump",
  "Transplanter",
];

/**
 * Operator Management.
 *
 * An operator belongs to the owner and is private to them. Their licence
 * document is never exposed to a renter — a renter sees a name and a phone
 * number on their own booking, nothing more.
 */
export default function EquipmentOperators() {
  const D = describeEquipmentError;
  const operators = useWorkerData<EquipmentOperator[]>(() => listOperators(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentOperator | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EquipmentOperator | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const operatorList = operators.data ?? [];
  const bookingList = bookings.data ?? [];

  /** Completed jobs per operator — work history at a glance. */
  const history = useMemo(() => {
    const map = new Map<string, { jobs: number; lastOn: string | null }>();
    for (const b of bookingList) {
      if (!b.operator_id) continue;
      const row = map.get(b.operator_id) ?? { jobs: 0, lastOn: null };
      if (["payment_confirmed", "closed", "work_completed"].includes(b.status)) {
        row.jobs += 1;
        if (!row.lastOn || b.starts_on > row.lastOn) row.lastOn = b.starts_on;
      }
      map.set(b.operator_id, row);
    }
    return map;
  }, [bookingList]);

  async function handleRemove() {
    if (!removeTarget) return;
    setBusy(true);
    setError("");
    try {
      await deleteOperator(removeTarget.id);
      operators.reload();
      setRemoveTarget(null);
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(op: EquipmentOperator, status: OperatorStatus) {
    setError("");
    try {
      await updateOperator(op.id, { status });
      operators.reload();
    } catch (err) {
      setError(D(err));
    }
  }

  if (operators.state === "loading") {
    return (
      <EquipmentLayout title="Operator Management">
        <Loading label="Loading operators…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout
      title="Operator Management"
      subtitle="Who drives your machines"
      action={
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setError("");
            setFormOpen(true);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add operator
        </button>
      }
    >
      {operators.state === "error" && <ErrorNotice message={operators.error} onRetry={operators.reload} />}
      {error && <ErrorNotice message={error} />}

      <OperatorPrivacyNotice />

      <Panel title="Operators" description={`${operatorList.length} on your team`}>
        {operatorList.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No operator added"
            description="Add the people who drive your machines. You can then assign one to a booking, and the database will refuse a double booking for the same dates."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[11.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-bold">Operator</th>
                  <th className="px-4 py-2 font-bold">Skills</th>
                  <th className="px-4 py-2 font-bold">Licence</th>
                  <th className="px-4 py-2 font-bold">Jobs</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                  <th className="px-4 py-2 font-bold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operatorList.map((op) => {
                  const lic = licenceState(op);
                  const hist = history.get(op.id);
                  return (
                    <tr key={op.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-forest">{op.full_name}</p>
                        <p className="text-[10px] text-slate-500">
                          {op.phone ?? "No phone"} · {op.experience_years} yr
                          {op.phone_verified && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-700">
                              <ShieldCheck className="h-2.5 w-2.5" /> verified
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {op.skills.length === 0 ? (
                            <span className="text-[10px] text-slate-400">None listed</span>
                          ) : (
                            op.skills.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[9.5px] font-bold text-brand-800"
                              >
                                {s}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {op.licence_no ? (
                          <>
                            <p className="font-mono text-[10px] text-slate-600">{op.licence_no}</p>
                            <p
                              className={`text-[10px] ${
                                lic.expired ? "font-bold text-rose-700" : lic.expiringSoon ? "font-bold text-amber-700" : "text-slate-500"
                              }`}
                            >
                              {op.licence_expiry ? `expires ${formatDate(op.licence_expiry)}` : "no expiry on file"}
                            </p>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">Not recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-700">{hist?.jobs ?? 0}</p>
                        <p className="text-[9.5px] text-slate-400">
                          {hist?.lastOn ? `last ${formatDate(hist.lastOn)}` : "no jobs yet"}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={op.status}
                          onChange={(e) => void handleStatus(op, e.target.value as OperatorStatus)}
                          className="rounded-full border-0 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700"
                        >
                          {OPERATOR_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {OPERATOR_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(op);
                              setFormOpen(true);
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(op)}
                            aria-label={`Remove ${op.full_name}`}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      <section>
        <SectionHeading title="Assignment rules" hint="Checked by the database, not just this screen" />
        <Panel title="What prevents a clash">
          <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
            <li className="flex gap-1.5">
              <UserRound className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              An operator cannot be assigned to two bookings whose dates overlap.
            </li>
            <li className="flex gap-1.5">
              <UserRound className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              Operators on leave or inactive are disabled in the assignment list.
            </li>
            <li className="flex gap-1.5">
              <UserRound className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              Removing an operator deactivates them — past jobs keep their name on record.
            </li>
          </ul>
        </Panel>
      </section>

      {formOpen && (
        <OperatorModal
          key={editing?.id ?? "new"}
          operator={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            operators.reload();
          }}
        />
      )}

      <Modal
        open={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        title="Remove this operator?"
        subtitle={removeTarget?.full_name}
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-slate-600">
            They will no longer be assignable to jobs. Past bookings keep their name, so the record stays
            accurate.
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
    </EquipmentLayout>
  );
}

function OperatorModal({
  operator,
  onClose,
  onSaved,
}: {
  operator: EquipmentOperator | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeEquipmentError;
  const [fullName, setFullName] = useState(operator?.full_name ?? "");
  const [phone, setPhone] = useState(operator?.phone ?? "");
  const [phoneVerified, setPhoneVerified] = useState(operator?.phone_verified ?? false);
  const [experience, setExperience] = useState(String(operator?.experience_years ?? 0));
  const [skills, setSkills] = useState<string[]>(operator?.skills ?? []);
  const [licenceNo, setLicenceNo] = useState(operator?.licence_no ?? "");
  const [licenceExpiry, setLicenceExpiry] = useState(operator?.licence_expiry ?? "");
  const [status, setStatus] = useState<OperatorStatus>(operator?.status ?? "available");
  const [notes, setNotes] = useState(operator?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleSkill(skill: string) {
    setSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]));
  }

  async function handleSave() {
    if (fullName.trim().length < 2) {
      setError("Enter the operator's name.");
      return;
    }
    const payload: OperatorInput = {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      phone_verified: phoneVerified,
      experience_years: Math.max(Number(experience) || 0, 0),
      skills,
      licence_no: licenceNo.trim() || null,
      licence_expiry: licenceExpiry || null,
      status,
      notes: notes.trim() || null,
    };
    setBusy(true);
    setError("");
    try {
      if (operator) await updateOperator(operator.id, payload);
      else await createOperator(payload);
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide title={operator ? "Edit operator" : "Add operator"}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} inputMode="tel" />
          </Field>
          <Field label="Experience (years)">
            <input value={experience} onChange={(e) => setExperience(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as OperatorStatus)} className={inputClass}>
              {OPERATOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OPERATOR_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Licence number" hint="Required for road-going machines.">
            <input value={licenceNo} onChange={(e) => setLicenceNo(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Licence expiry">
            <input type="date" value={licenceExpiry} onChange={(e) => setLicenceExpiry(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label="Skills">
          <div className="flex flex-wrap gap-1.5">
            {SKILL_SUGGESTIONS.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                aria-pressed={skills.includes(skill)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  skills.includes(skill) ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <input
            type="checkbox"
            checked={phoneVerified}
            onChange={(e) => setPhoneVerified(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-700"
          />
          <span className="text-[11.5px] text-slate-700">
            Phone number verified with the operator
          </span>
        </label>

        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </Field>

        <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500">
          Licence and ID photographs are uploaded under Documents & Verification and stay private — a
          renter never sees them.
        </p>

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
            {busy ? "Saving…" : operator ? "Save changes" : "Add operator"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
