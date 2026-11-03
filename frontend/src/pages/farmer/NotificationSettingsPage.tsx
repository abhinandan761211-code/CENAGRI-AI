import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Check, CloudSun, Mail, Smartphone, TrendingUp } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  ErrorNote,
  Input,
  LoadingRows,
  PageHeader,
  Panel,
  PrimaryButton,
  Stat,
  SuccessNote,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { getAlertPrefs, saveAlertPrefs, farmerError } from "@/lib/farmer";
import type { AlertPrefs } from "@/lib/farmer";

/**
 * Notification Settings.
 *
 * The in-app bell works today; push and email are recorded as preferences and
 * are clearly marked as "coming" until a delivery service is connected. The
 * page never claims an SMS or WhatsApp alert will arrive.
 */

const IN_APP: { key: keyof AlertPrefs; label: string; body: string; icon: typeof Bell }[] = [
  { key: "weather_alerts", label: "Weather alerts", body: "Heavy rain, heat and wind warnings for your district.", icon: CloudSun },
  { key: "mandi_alerts", label: "Mandi price alerts", body: "Big price moves for the crops you grow.", icon: TrendingUp },
  { key: "task_reminders", label: "Task reminders", body: "Fertiliser, irrigation and pest-check dates.", icon: Bell },
  { key: "booking_updates", label: "Booking updates", body: "Machinery, transport and storage status changes.", icon: Bell },
  { key: "ai_updates", label: "AI advisory updates", body: "When a new answer or analysis is ready.", icon: BellRing },
  { key: "community", label: "Community activity", body: "Replies in groups and CenFriend.", icon: Bell },
];

export default function NotificationSettingsPage() {
  const { profile } = useAuth();
  const { toast, showToast } = useToast();

  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pushState, setPushState] = useState<NotificationPermission>("default");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPrefs(await getAlertPrefs());
    } catch (err) {
      setError(farmerError(err, "Could not load your notification settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (typeof Notification !== "undefined") setPushState(Notification.permission);
  }, [load]);

  async function update(patch: Partial<AlertPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    setSaved(false);
    try {
      await saveAlertPrefs(patch);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(farmerError(err, "Could not save the setting."));
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function askPushPermission() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setPushState(permission);
    if (permission === "granted" && prefs) await update({ push_enabled: true });
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Bell}
        title="Notification Settings"
        description="Choose what you want to hear about. The bell in the header already works; push and email need one more step."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In-app alerts" value={IN_APP.filter((a) => prefs?.[a.key]).length} icon={Bell} hint="Switched on" />
        <Stat label="Push" value={pushState === "granted" ? "Allowed" : "Off"} icon={Smartphone} tone={pushState === "granted" ? "green" : "slate"} hint="Browser permission" />
        <Stat label="Email" value={prefs?.email_enabled ? "On" : "Off"} icon={Mail} tone={prefs?.email_enabled ? "green" : "slate"} hint="Needs a delivery service" />
        <Stat label="SMS / WhatsApp" value="Not connected" icon={BellRing} tone="amber" hint="Ask the helpline for now" />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      {loading || !prefs ? (
        <Panel>
          <LoadingRows rows={5} />
        </Panel>
      ) : (
        <>
          <Panel title="What alerts do you want?" icon={Bell} action={saved ? <Chip tone="green">Saved</Chip> : undefined}>
            <ul className="divide-y divide-slate-100">
              {IN_APP.map(({ key, label: text, body, icon: Icon }) => (
                <li key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-forest">{text}</p>
                    <p className="text-[11px] text-slate-500">{body}</p>
                  </div>
                  <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={Boolean(prefs[key])}
                      onChange={(e) => void update({ [key]: e.target.checked } as Partial<AlertPrefs>)}
                      disabled={saving}
                      aria-label={text}
                    />
                    <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 peer-focus-visible:ring-offset-1" />
                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </label>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Push on this phone" icon={Smartphone}>
              <div className="space-y-3 p-4">
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Push needs the browser's permission. Even when allowed, alerts are only sent once the delivery
                  service is connected on the server.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Chip tone={pushState === "granted" ? "green" : pushState === "denied" ? "red" : "slate"}>
                    Permission: {pushState}
                  </Chip>
                  {pushState !== "granted" && (
                    <PrimaryButton onClick={() => void askPushPermission()}>
                      <BellRing className="h-3.5 w-3.5" /> Allow notifications
                    </PrimaryButton>
                  )}
                </div>
                {pushState === "denied" && (
                  <p className="text-[10px] leading-relaxed text-rose-700">
                    Permission was blocked. Open your browser settings for this site to allow notifications.
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="Email alerts" icon={Mail}>
              <div className="space-y-3 p-4">
                <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                  Send alerts by email
                  <input
                    type="checkbox"
                    checked={prefs.email_enabled}
                    onChange={(e) => void update({ email_enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-700"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Email address
                  </span>
                  <Input
                    type="email"
                    value={prefs.email_address ?? profile?.email ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, email_address: e.target.value })}
                    onBlur={() => void update({ email_address: prefs.email_address })}
                    placeholder="name@example.com"
                  />
                </label>
                <p className="text-[10px] leading-relaxed text-slate-400">
                  Your preference is saved now. Emails begin once the mail service is switched on for CenAGRI.
                </p>
              </div>
            </Panel>
          </div>

          {saved && <SuccessNote message="Notification preferences saved." />}
          <p className="flex items-center gap-1 inline-flex text-[10px] text-slate-400">
            <Check className="h-3 w-3" /> You can change these any time.
          </p>
        </>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}
