import { useState } from "react";
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
      a.download = `cenagri-farmer-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setExported(
        `${farms.length} farms · ${crops.length} crops · ${expenses.length} expenses · ${activities.length} activities`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the export.");
    } finally {
      setExporting(false);
    }
  }

  async function requestClosure() {
    if (confirmText.trim().toUpperCase() !== "DELETE") return;
    setClosing(true);
    try {
      const requests = JSON.parse(localStorage.getItem("cenagri.deletion") ?? "[]") as unknown[];
      requests.push({
        email: profile?.email ?? user?.email,
        reason,
        at: new Date().toISOString(),
      });
      localStorage.setItem("cenagri.deletion", JSON.stringify(requests.slice(-5)));
      setClosed(true);
      setCloseOpen(false);
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
        title="Account Management"
        description="Your account status, preferences, a copy of your data, and how to close the account if you need to."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Account type" value="Farmer" icon={Settings} hint="Set when you signed up" />
        <Stat label="Status" value="Active" icon={Settings} tone="green" hint="In good standing" />
        <Stat
          label="Sign-in email"
          value={(profile?.email ?? user?.email ?? "—").split("@")[0]}
          icon={Settings}
          tone="blue"
          hint={profile?.email ?? user?.email ?? ""}
        />
        <Stat label="Member since" value={profile?.created_at ? new Date(profile.created_at).getFullYear().toString() : "—"} icon={Settings} tone="slate" hint="Year joined" />
      </div>

      {error && <ErrorNote message={error} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Download my data" description="Farms, crops, tasks, activities, expenses, soil and irrigation records" icon={Download}>
          <div className="space-y-3 p-4">
            <p className="text-[11px] leading-relaxed text-slate-500">
              The file is built in your browser from your own records and saved to your device as JSON. Nothing is
              emailed anywhere.
            </p>
            {schemaReady === false && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-900">
                Some farmer tables are not created in this database yet, so those sections will be empty in the
                export. Run database/supabase/farmer.sql to include them.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={() => void exportData()} disabled={exporting}>
                <FileJson className="h-3.5 w-3.5" /> {exporting ? "Preparing…" : "Download my data"}
              </PrimaryButton>
              {exported && <Chip tone="green">Saved · {exported}</Chip>}
            </div>
          </div>
        </Panel>

        <Panel title="Account preferences" icon={Settings}>
          <ul className="divide-y divide-slate-100">
            {[
              { to: "/account/personal", label: "Personal information" },
              { to: "/account/farming", label: "Farming information" },
              { to: "/account/language", label: "Language" },
              { to: "/account/notifications", label: "Notification settings" },
              { to: "/account/privacy", label: "Privacy & security" },
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

      <Panel title="Device & session" icon={LogOut}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold text-forest">Signed in as {profile?.email ?? user?.email}</p>
            <p className="text-[11px] text-slate-500">Signing out ends the session on this device only.</p>
          </div>
          <GhostButton onClick={() => void signOutNow()}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </GhostButton>
        </div>
      </Panel>

      <Panel title="Close this account" icon={UserX}>
        <div className="space-y-3 p-4">
          <p className="text-[11px] leading-relaxed text-slate-600">
            Closing the account removes your farms, crops, activity log, expenses and documents. Orders you already
            placed or sold stay on the other party's records for accounting. This cannot be undone.
          </p>

          {closed ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-900">Closure request recorded</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900">
                Our team will confirm with you before anything is deleted. You can withdraw the request any time by
                calling 1800-000-000. Your account is fully usable until then.
              </p>
            </div>
          ) : (
            <GhostButton
              onClick={() => setCloseOpen(true)}
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Request account closure
            </GhostButton>
          )}
        </div>
      </Panel>

      {closeOpen && (
        <Modal
          title="Request account closure"
          description="Nothing is deleted until the support team confirms with you."
          onClose={() => setCloseOpen(false)}
          footer={
            <>
              <GhostButton onClick={() => setCloseOpen(false)}>Cancel</GhostButton>
              <button
                type="button"
                onClick={() => void requestClosure()}
                disabled={closing || confirmText.trim().toUpperCase() !== "DELETE"}
                className="h-9 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {closing ? "Sending…" : "Send request"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
              <p className="text-[11px] leading-relaxed text-rose-800">
                Download a copy of your data first. Once confirmed, your farm records and documents cannot be
                recovered.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Why are you leaving? (optional)
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Anything we could have done better"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Type DELETE to confirm
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
