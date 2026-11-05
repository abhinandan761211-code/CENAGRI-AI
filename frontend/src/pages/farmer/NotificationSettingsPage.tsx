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
import { useLang } from "@/i18n/LanguageContext";
import type { TranslationKey } from "@/i18n/locales/en";
import { getAlertPrefs, saveAlertPrefs, farmerError } from "@/lib/farmer";
import type { AlertPrefs } from "@/lib/farmer";

/**
 * Notification Settings.
 *
 * The in-app bell works today; push and email are recorded as preferences and
 * are clearly marked as "coming" until a delivery service is connected. The
 * page never claims an SMS or WhatsApp alert will arrive.
 */

const IN_APP: {
  key: keyof AlertPrefs;
  labelKey: TranslationKey;
  bodyKey: TranslationKey;
  icon: typeof Bell;
}[] = [
  { key: "weather_alerts", labelKey: "acc.notif.weather", bodyKey: "acc.notif.weatherBody", icon: CloudSun },
  { key: "mandi_alerts", labelKey: "acc.notif.mandi", bodyKey: "acc.notif.mandiBody", icon: TrendingUp },
  { key: "task_reminders", labelKey: "acc.notif.tasks", bodyKey: "acc.notif.tasksBody", icon: Bell },
  { key: "booking_updates", labelKey: "acc.notif.booking", bodyKey: "acc.notif.bookingBody", icon: Bell },
  { key: "ai_updates", labelKey: "acc.notif.ai", bodyKey: "acc.notif.aiBody", icon: BellRing },
  { key: "community", labelKey: "acc.notif.community", bodyKey: "acc.notif.communityBody", icon: Bell },
];

export default function NotificationSettingsPage() {
  const { profile } = useAuth();
  const { toast, showToast } = useToast();
  const { t, tf } = useLang();

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
      setError(farmerError(err, t("acc.notif.errLoad")));
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
      setError(farmerError(err, t("acc.notif.errSave")));
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
        title={t("acc.notif.title")}
        description={t("acc.notif.desc")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("acc.notif.statInApp")} value={IN_APP.filter((a) => prefs?.[a.key]).length} icon={Bell} hint={t("acc.notif.statInAppHint")} />
        <Stat label={t("acc.notif.statPush")} value={pushState === "granted" ? t("acc.notif.allowed") : t("acc.notif.off")} icon={Smartphone} tone={pushState === "granted" ? "green" : "slate"} hint={t("acc.notif.statPushHint")} />
        <Stat label={t("acc.notif.statEmail")} value={prefs?.email_enabled ? t("acc.notif.on") : t("acc.notif.off")} icon={Mail} tone={prefs?.email_enabled ? "green" : "slate"} hint={t("acc.notif.statEmailHint")} />
        <Stat label={t("acc.notif.statSms")} value={t("acc.notif.notConnected")} icon={BellRing} tone="amber" hint={t("acc.notif.statSmsHint")} />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      {loading || !prefs ? (
        <Panel>
          <LoadingRows rows={5} />
        </Panel>
      ) : (
        <>
          <Panel title={t("acc.notif.choose")} icon={Bell} action={saved ? <Chip tone="green">{t("acc.personal.savedToast")}</Chip> : undefined}>
            <ul className="divide-y divide-slate-100">
              {IN_APP.map(({ key, labelKey, bodyKey, icon: Icon }) => (
                <li key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-forest">{t(labelKey)}</p>
                    <p className="text-[11px] text-slate-500">{t(bodyKey)}</p>
                  </div>
                  <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={Boolean(prefs[key])}
                      onChange={(e) => void update({ [key]: e.target.checked } as Partial<AlertPrefs>)}
                      disabled={saving}
                      aria-label={t(labelKey)}
                    />
                    <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 peer-focus-visible:ring-offset-1" />
                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </label>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("acc.notif.pushTitle")} icon={Smartphone}>
              <div className="space-y-3 p-4">
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {t("acc.notif.pushBody")}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Chip tone={pushState === "granted" ? "green" : pushState === "denied" ? "red" : "slate"}>
                    {tf("acc.notif.permission", { state: pushState })}
                  </Chip>
                  {pushState !== "granted" && (
                    <PrimaryButton onClick={() => void askPushPermission()}>
                      <BellRing className="h-3.5 w-3.5" /> {t("acc.notif.allow")}
                    </PrimaryButton>
                  )}
                </div>
                {pushState === "denied" && (
                  <p className="text-[10px] leading-relaxed text-rose-700">
                    {t("acc.notif.denied")}
                  </p>
                )}
              </div>
            </Panel>

            <Panel title={t("acc.notif.emailTitle")} icon={Mail}>
              <div className="space-y-3 p-4">
                <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                  {t("acc.notif.emailSend")}
                  <input
                    type="checkbox"
                    checked={prefs.email_enabled}
                    onChange={(e) => void update({ email_enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-700"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("acc.notif.emailAddress")}
                  </span>
                  <Input
                    type="email"
                    value={prefs.email_address ?? profile?.email ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, email_address: e.target.value })}
                    onBlur={() => void update({ email_address: prefs.email_address })}
                    placeholder="name@example.com"
                  />
                </label>
                <p className="text-[10px] leading-relaxed text-slate-400">{t("acc.notif.emailNote")}</p>
              </div>
            </Panel>
          </div>

          {saved && <SuccessNote message={t("acc.notif.saved")} />}
          <p className="flex items-center gap-1 inline-flex text-[10px] text-slate-400">
            <Check className="h-3 w-3" /> {t("acc.notif.changeAnytime")}
          </p>
        </>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}
