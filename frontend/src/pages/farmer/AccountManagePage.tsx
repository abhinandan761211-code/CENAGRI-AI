import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Download, FileJson, LogOut, Settings, Trash2, UserX } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  ErrorNote,
  GhostButton,
  Modal,
  PageHeader,
  Panel,
  PrimaryButton,
  Stat,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import { listFarms } from "@/lib/farms";
import { listCrops } from "@/lib/crops";
import {
  listActivities,
  listExpenses,
  listIrrigationLogs,
  listSoilTests,
  listTasks,
  farmerSchemaReady,
} from "@/lib/farmer";
import {
  hasPendingDeletion,
  requestAccountDeletion,
  storeLocalDeletion,
} from "@/lib/support";

/**
 * Account Management — status, preferences, data export and account closure.
 *
 * Export builds a real JSON file from the farmer's own rows and downloads it in
 * the browser. Closure is a *request*: the data belongs to the farmer and
 * deleting it is irreversible, so it goes to the support team with a typed
 * confirmation rather than being wiped by a mis-click.
 */

export default function AccountManagePage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { t, tf } = useLang();

  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);

  const [closeOpen, setCloseOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  const details = profile?.details ?? {};

  // A request filed on another device (or a previous session) must not show the
  // closure form again as if nothing had been sent.
  useEffect(() => {
    if (!user) return;
    hasPendingDeletion()
      .then((pending) => {
        if (pending) setClosed(true);
      })
      .catch(() => undefined);
  }, [user]);

  async function exportData() {
    setExporting(true);
    setError("");
    setExported(null);
    try {
      const [farms, crops, tasks, activities, expenses, soil, irrigation, ready] = await Promise.all([
        listFarms().catch(() => []),
        listCrops().catch(() => []),
        listTasks().catch(() => []),
        listActivities(1000).catch(() => []),
        listExpenses().catch(() => []),
        listSoilTests().catch(() => []),
        listIrrigationLogs().catch(() => []),
        farmerSchemaReady().catch(() => null),
      ]);
      setSchemaReady(ready);

      const payload = {
        exported_at: new Date().toISOString(),
        account: {
          id: user?.id,
          email: profile?.email ?? user?.email,
          full_name: profile?.full_name,
          phone: profile?.phone,
          role: profile?.role,
          location: {
            state: details.state,
            district: details.district,
            village: details.village,
          },
        },
        farms,
        crops,
        tasks,
        activities,
        expenses,
        soil_tests: soil,
        irrigation_logs: irrigation,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kalika-farmer-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Counts only — the labels would need four more keys for one chip.
      setExported(tf("acc.mgmt.saved", { summary: `${farms.length} · ${crops.length} · ${expenses.length} · ${activities.length}` }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("acc.mgmt.errExport"));
    } finally {
      setExporting(false);
    }
  }

  async function requestClosure() {
    if (confirmText.trim().toUpperCase() !== "DELETE") return;
    setClosing(true);
    setError("");
    try {
      // Admin review, not an instant wipe: `admin_deletion_requests` is what the
      // admin panel works from. The old version kept this in localStorage only.
      const result = await requestAccountDeletion(reason);
      storeLocalDeletion({
        email: profile?.email ?? user?.email,
        reason,
        at: new Date().toISOString(),
      });
      setClosed(true);
      setCloseOpen(false);
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("acc.mgmt.errClosure"));
    } finally {
      setClosing(false);
    }
  }

  async function signOutNow() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Settings}
        title={t("acc.mgmt.title")}
        description={t("acc.mgmt.desc")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("acc.mgmt.statType")} value="Farmer" icon={Settings} hint={t("acc.mgmt.statTypeHint")} />
        <Stat label={t("acc.mgmt.statStatus")} value={t("acc.mgmt.active")} icon={Settings} tone="green" hint={t("acc.mgmt.statStatusHint")} />
        <Stat
          label={t("acc.mgmt.statEmail")}
          value={(profile?.email ?? user?.email ?? "—").split("@")[0]}
          icon={Settings}
          tone="blue"
          hint={profile?.email ?? user?.email ?? ""}
        />
        <Stat label={t("acc.mgmt.statMember")} value={profile?.created_at ? new Date(profile.created_at).getFullYear().toString() : "—"} icon={Settings} tone="slate" hint={t("acc.mgmt.statEmailHint")} />
      </div>

      {error && <ErrorNote message={error} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("acc.mgmt.exportTitle")} description={t("acc.mgmt.exportDesc")} icon={Download}>
          <div className="space-y-3 p-4">
            <p className="text-[11px] leading-relaxed text-slate-500">{t("acc.mgmt.exportBody")}</p>
            {schemaReady === false && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-900">
                {t("acc.mgmt.schemaWarn")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={() => void exportData()} disabled={exporting}>
                <FileJson className="h-3.5 w-3.5" /> {exporting ? t("acc.mgmt.preparing") : t("acc.mgmt.download")}
              </PrimaryButton>
              {exported && <Chip tone="green">{exported}</Chip>}
            </div>
          </div>
        </Panel>

        <Panel title={t("acc.mgmt.preferences")} icon={Settings}>
          <ul className="divide-y divide-slate-100">
            {[
              { to: "/account/personal", label: t("acc.settings.personal") },
              { to: "/account/farming", label: t("acc.settings.farming") },
              { to: "/account/language", label: t("acc.settings.language") },
              { to: "/account/notifications", label: t("acc.settings.notifications") },
              { to: "/account/privacy", label: t("acc.settings.privacy") },
            ].map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-forest hover:bg-slate-50">
                  {item.label}
                  <span className="text-slate-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title={t("acc.mgmt.session")} icon={LogOut}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold text-forest">
              {tf("acc.mgmt.signedInAs", { email: profile?.email ?? user?.email ?? "—" })}
            </p>
            <p className="text-[11px] text-slate-500">{t("acc.mgmt.signOutBit")}</p>
          </div>
          <GhostButton onClick={() => void signOutNow()}>
            <LogOut className="h-3.5 w-3.5" /> {t("acc.mgmt.signOut")}
          </GhostButton>
        </div>
      </Panel>

      <Panel title={t("acc.mgmt.closeTitle")} icon={UserX}>
        <div className="space-y-3 p-4">
          <p className="text-[11px] leading-relaxed text-slate-600">{t("acc.mgmt.closeBody")}</p>

          {closed ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-900">{t("acc.mgmt.recorded")}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900">{t("acc.mgmt.recordedBody")}</p>
            </div>
          ) : (
            <GhostButton
              onClick={() => setCloseOpen(true)}
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("acc.mgmt.requestClosure")}
            </GhostButton>
          )}
        </div>
      </Panel>

      {closeOpen && (
        <Modal
          title={t("acc.mgmt.modalTitle")}
          description={t("acc.mgmt.modalDesc")}
          onClose={() => setCloseOpen(false)}
          footer={
            <>
              <GhostButton onClick={() => setCloseOpen(false)}>{t("acc.mgmt.cancel")}</GhostButton>
              <button
                type="button"
                onClick={() => void requestClosure()}
                disabled={closing || confirmText.trim().toUpperCase() !== "DELETE"}
                className="h-9 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {closing ? t("acc.mgmt.sending") : t("acc.mgmt.send")}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
              <p className="text-[11px] leading-relaxed text-rose-800">{t("acc.mgmt.warnDownload")}</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.mgmt.reason")}
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("acc.mgmt.reasonPlaceholder")}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.mgmt.confirm")}
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold tracking-widest outline-none focus:border-rose-500"
              />
            </label>
          </div>
        </Modal>
      )}
    </FarmerShell>
  );
}
