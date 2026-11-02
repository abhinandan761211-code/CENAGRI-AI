import { useState } from "react";
import { Check, Lock, Shield, UserCheck } from "lucide-react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Button,
  Dialog,
  ErrorNotice,
  Field,
  inputClass,
  Loading,
  Panel,
  toneFor,
} from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";
import type { RoleMatrix } from "@/lib/admin/api";

/**
 * Roles & permissions.
 *
 * The grid is the *backend's* matrix, read from `admin_role_permissions`.
 * Toggling a cell PATCHes the mapping and clears the API's permission cache, so
 * the change is live on the very next request. The Super Admin column is
 * read-only by design — the API refuses to let anyone edit it.
 */

type AdminRow = {
  user_id: string;
  role_key: string;
  role_label: string | null;
  is_active: boolean;
  mfa_required: boolean;
  created_at: string;
  profile: { full_name: string | null; email: string | null } | null;
};

export default function AdminRoles() {
  const { me, can } = useAdmin();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const matrix = useAdminData<RoleMatrix>(() => adminFetch<RoleMatrix>("/roles"), []);
  const admins = useAdminData<{ rows: AdminRow[] }>(() => adminFetch("/roles/admins"), []);

  if (!can("roles.view")) {
    return (
      <AdminLayout title="Roles & permissions">
        <NoAccess module="role management" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Roles & permissions"
      subtitle="Least-privilege access, enforced by the API on every request"
      action={
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Shield className="h-3.5 w-3.5" />
          You are {me?.role_label}
        </div>
      }
    >
      {notice && (
        <div
          className={`rounded-lg border px-3 py-2 text-[11.5px] font-medium ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
        >
          {notice.text}
        </div>
      )}

      {matrix.error && <ErrorNotice message={matrix.error} onRetry={matrix.reload} />}
      {matrix.loading && !matrix.data && <Loading label="Reading the permission matrix…" />}
      {matrix.data && (
        <MatrixTable
          data={matrix.data}
          canManage={can("roles.manage")}
          isSuperAdmin={me?.role_key === "super_admin"}
          onEditRole={setEditing}
        />
      )}

      <Panel title="Admin users" description="Who holds an admin role" flush>
        {admins.error && <div className="p-4"><ErrorNotice message={admins.error} onRetry={admins.reload} /></div>}
        {admins.loading && !admins.data ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(admins.data?.rows ?? []).map((row) => (
              <li key={row.user_id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <UserCheck className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-slate-800">
                    {row.profile?.full_name ?? row.profile?.email ?? row.user_id}
                  </p>
                  <p className="truncate text-[10.5px] text-slate-500">{row.profile?.email}</p>
                </div>
                <Badge tone="green">{row.role_label ?? row.role_key}</Badge>
                <Badge tone={row.is_active ? "sky" : "rose"}>{row.is_active ? "active" : "disabled"}</Badge>
                {row.mfa_required && <Badge tone={toneFor("approved")}>MFA</Badge>}
              </li>
            ))}
            {(admins.data?.rows ?? []).length === 0 && (
              <li className="px-4 py-8 text-center text-[11px] text-slate-500">
                No admin rows yet. Run the SQL at the end of <code>database/supabase/admin.sql</code> to promote the first Super Admin.
              </li>
            )}
          </ul>
        )}
      </Panel>

      {editing && matrix.data && (
        <RoleEditor
          role={editing}
          matrix={matrix.data}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setNotice({ tone: "ok", text });
            matrix.reload();
          }}
        />
      )}
    </AdminLayout>
  );
}


function RoleEditor({
  role,
  matrix,
  onClose,
  onSaved,
}: {
  role: string;
  matrix: RoleMatrix;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(matrix.grants[role] ?? []);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/roles/${role}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permission_keys: selected, reason: reason.trim() }),
      });
      onSaved(`${matrix.roles.find((r) => r.key === role)?.label ?? role} now has ${selected.length} permissions.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={`Edit ${matrix.roles.find((r) => r.key === role)?.label ?? role}`}
      subtitle="Removing a permission takes effect on the next request."
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || reason.trim().length < 3} onClick={() => void save()}>
            {busy ? "Saving…" : "Save mapping"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
        <ul className="divide-y divide-slate-100">
          {matrix.permissions.map((permission) => (
            <li key={permission.key}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(permission.key)}
                  onChange={() => toggle(permission.key)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                />
                <span className="flex-1 text-[12px] text-slate-700">{permission.label}</span>
                <span className="text-[10px] text-slate-400">{permission.module}</span>
                {permission.sensitive && <Badge tone="amber">sensitive</Badge>}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <Field label="Reason" hint="Stored in the audit log with the before/after permission list.">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * The matrix grid.
 *
 * Extracted from the page so the null check on `matrix.data` happens once:
 * inside this component `data` is plain `RoleMatrix`, which is what keeps the
 * permission lookups (and the TypeScript narrowing) simple.
 */
function MatrixTable({
  data,
  canManage,
  isSuperAdmin,
  onEditRole,
}: {
  data: RoleMatrix;
  canManage: boolean;
  isSuperAdmin: boolean;
  onEditRole: (role: string) => void;
}) {
  const editable = canManage && isSuperAdmin;
  return (
    <Panel
      title="Permission matrix"
      description="Each column is an admin role; each row is a capability the API checks"
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-[38%] px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Permission</th>
              {data.roles.map((role) => (
                <th
                  key={role.key}
                  className="whitespace-nowrap px-2 py-2 text-center align-bottom text-[10.5px] font-bold uppercase tracking-wide text-slate-500"
                >
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.permissions.map((permission) => (
              <tr key={permission.key} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-slate-800">
                    {permission.label}
                    {permission.sensitive && <Badge tone="amber">sensitive</Badge>}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {permission.module} · <code>{permission.key}</code>
                  </p>
                </td>
                {data.roles.map((role) => {
                  const granted = (data.grants[role.key] ?? []).includes(permission.key);
                  const locked = role.key === "super_admin" || !editable;
                  return (
                    <td key={role.key} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        aria-label={`${permission.label} for ${role.label}: ${granted ? "granted" : "not granted"}`}
                        disabled={locked}
                        onClick={() => onEditRole(role.key)}
                        title={locked ? "Super Admin is fixed; other roles need a Super Admin" : "Edit this role's permissions"}
                        className={`mx-auto grid h-5 w-5 place-items-center rounded-full ${
                          granted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-300"
                        } ${locked ? "cursor-default" : "cursor-pointer hover:ring-2 hover:ring-emerald-200"}`}
                      >
                        {granted ? <Check className="h-3 w-3" /> : <span className="h-1 w-1 rounded-full bg-current" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!editable && (
        <p className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-[10.5px] text-slate-500">
          <Lock className="h-3 w-3" />
          View only. Changing permissions needs a Super Admin.
        </p>
      )}
    </Panel>
  );
}
