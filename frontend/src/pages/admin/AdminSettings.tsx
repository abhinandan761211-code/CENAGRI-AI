import { Lock, Save, Settings as SettingsIcon, ShieldCheck, ToggleLeft } from "lucide-react";
import { useMemo, useState } from "react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Button,
  ErrorNotice,
  Field,
  inputClass,
  Loading,
  Panel,
} from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

type SettingRow = {
  key: string;
  value: unknown;
  category: string;
  label: string | null;
  kind: string;
  updated_at: string;
  is_set?: boolean;
};

type FlagRow = { key: string; description: string | null; enabled: boolean; updated_at: string };

const SECRET_MASK = "••••••••";

/**
 * Platform settings.
 *
 * Grouped by the categories the API stores. A `secret` setting is write-only:
 * the API returns a placeholder, so the form can show "set" without ever
 * handing the value back to the browser.
 */
export default function AdminSettings() {
  const { can } = useAdmin();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const settings = useAdminData<{ rows: SettingRow[] }>(() => adminFetch("/ops/settings"), []);
  const flags = useAdminData<{ rows: FlagRow[] }>(() => adminFetch("/ops/flags"), []);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const row of settings.data?.rows ?? []) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [settings.data]);

  if (!can("settings.view")) {
    return (
      <AdminLayout title="Platform settings">
        <NoAccess module="platform settings" />
      </AdminLayout>
    );
  }

  const dirty = Object.keys(draft).length > 0;

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const values: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(draft)) {
        const row = settings.data?.rows.find((r) => r.key === key);
        if (!row) continue;
        if (row.kind === "boolean") values[key] = raw === "true";
        else if (row.kind === "number") values[key] = Number(raw);
        else if (row.kind === "json") {
          try {
            values[key] = JSON.parse(raw);
          } catch {
            throw new Error(`${row.label ?? key} is not valid JSON.`);
          }
        } else values[key] = raw;
      }
      await adminFetch("/ops/settings", {
        method: "PATCH",
        body: JSON.stringify({ values, reason: reason.trim() }),
      });
      setDraft({});
      setReason("");
      setNotice({ tone: "ok", text: "Settings saved. The change and reason are in the audit log." });
      settings.reload();
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : "Could not save settings." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleFlag(flag: FlagRow) {
    const why = window.prompt(`Turn "${flag.key}" ${flag.enabled ? "off" : "on"}? Give a reason:`, "");
    if (!why || why.trim().length < 3) return;
    try {
      await adminFetch(`/ops/flags/${flag.key}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !flag.enabled, reason: why.trim() }),
      });
      flags.reload();
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : "Could not change the flag." });
    }
  }

  return (
    <AdminLayout
      title="Platform settings"
      subtitle="Configuration the platform owner controls. Secrets are write-only."
      action={
        can("settings.manage") ? (
          <Button icon={Save} disabled={!dirty || busy || reason.trim().length < 3} onClick={() => void save()}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        ) : undefined
      }
    >
      {notice && (
        <div
          className={`rounded-lg border px-3 py-2 text-[11.5px] ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
        >
          {notice.text}
        </div>
      )}

      {settings.error && <ErrorNotice message={settings.error} onRetry={settings.reload} />}
      {settings.loading && !settings.data && <Loading label="Reading settings…" />}

      {settings.data && settings.data.rows.length === 0 && (
        <Panel title="No settings installed">
          <p className="text-[12px] text-slate-600">
            The <code>platform_settings</code> table exists but has no rows. Seed it from{" "}
            <code>database/supabase/admin_seed.sql</code> to expose the settings groups.
          </p>
        </Panel>
      )}

      {dirty && (
        <Panel title="Change note (required)">
          <Field label="Reason" hint="Stored with every value you changed.">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Enable account approval for new retailers" />
          </Field>
        </Panel>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map(([category, rows]) => (
          <Panel key={category} title={category.replace(/_/g, " ")}>
            <div className="space-y-3">
              {rows.map((row) => {
                const value = draft[row.key] ?? (typeof row.value === "string" ? row.value : JSON.stringify(row.value));
                const disabled = !can("settings.manage");
                return (
                  <Field
                    key={row.key}
                    label={row.label ?? row.key}
                    hint={row.kind === "secret" ? "Write-only. Leave the placeholder to keep the current value." : undefined}
                  >
                    {row.kind === "boolean" ? (
                      <select
                        value={String(value)}
                        disabled={disabled}
                        onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
                        className={inputClass}
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    ) : row.kind === "secret" ? (
                      <div className="relative">
                        <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          value={value === SECRET_MASK ? "" : value}
                          disabled={disabled}
                          placeholder={row.value === SECRET_MASK ? "•••• set ••••" : "Not set"}
                          onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
                          className={`${inputClass} pl-8`}
                          autoComplete="new-password"
                        />
                      </div>
                    ) : row.kind === "json" ? (
                      <textarea
                        value={value}
                        disabled={disabled}
                        onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
                        rows={3}
                        className={inputClass}
                      />
                    ) : (
                      <input
                        type={row.kind === "number" ? "number" : "text"}
                        value={value}
                        disabled={disabled}
                        onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
                        className={inputClass}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="Feature flags" description="Turn a capability on or off without a deploy" flush>
        {flags.loading && !flags.data ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(flags.data?.rows ?? []).map((flag) => (
              <li key={flag.key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <ToggleLeft className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-slate-800">{flag.key}</p>
                  <p className="text-[10.5px] text-slate-500">{flag.description ?? "No description"}</p>
                </div>
                <Badge tone={flag.enabled ? "green" : "neutral"}>{flag.enabled ? "on" : "off"}</Badge>
                {can("settings.manage") && (
                  <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => void toggleFlag(flag)}>
                    Turn {flag.enabled ? "off" : "on"}
                  </Button>
                )}
              </li>
            ))}
            {(flags.data?.rows ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-[11px] text-slate-500">No feature flags defined yet.</li>
            )}
          </ul>
        )}
      </Panel>

      <p className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
        <ShieldCheck className="h-3 w-3" />
        Environment variables and service keys are never exposed by this page.
        <SettingsIcon className="ml-2 h-3 w-3" />
        MFA, session length and rate limits are server-side configuration.
      </p>
    </AdminLayout>
  );
}
