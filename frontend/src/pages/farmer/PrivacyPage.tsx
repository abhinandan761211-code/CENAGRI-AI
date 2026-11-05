import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  LogOut,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  ErrorNote,
  GhostButton,
  Input,
  PageHeader,
  Panel,
  PrimaryButton,
  ProgressBar,
  Stat,
  SuccessNote,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import type { TranslationKey } from "@/i18n/locales/en";
import { supabase } from "@/lib/supabase";

/**
 * Privacy & Security — password, sessions and what other accounts can see.
 *
 * Password strength is a local estimate. Signing out other devices uses
 * Supabase's `signOut({ scope: 'others' })`, which revokes every refresh token
 * except this browser's — the real, supported way to end sessions.
 */

const STRENGTH_KEYS: TranslationKey[] = [
  "acc.pwd.veryWeak",
  "acc.pwd.weak",
  "acc.pwd.fair",
  "acc.pwd.good",
  "acc.pwd.strong",
  "acc.pwd.strong",
];

/** Returns a 0–100 score and the translation key for its wording. */
function strengthOf(password: string): { score: number; labelKey: TranslationKey } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labelKey = STRENGTH_KEYS[score] ?? "acc.pwd.weak";
  return { score: (score / 5) * 100, labelKey };
}

export default function PrivacyPage() {
  const { user, profile, saveDetails, signOut, updatePassword } = useAuth();
  const { t } = useLang();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [vis, setVis] = useState({ showLocation: true, showPhone: false, discoverable: true });

  /**
   * Privacy choices live in `profiles.details.privacy`, not in this browser.
   * They decide what other accounts see, so a device-local copy was wrong: the
   * same farmer on a second phone would have had different visibility, and the
   * server had no idea what to hide.
   */
  useEffect(() => {
    const stored = profile?.details?.privacy;
    if (!stored) return;
    try {
      const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
      if (parsed && typeof parsed === "object") setVis((prev) => ({ ...prev, ...parsed }));
    } catch {
      /* a malformed value falls back to the defaults */
    }
  }, [profile?.details?.privacy]);

  async function saveVis(nextVis: typeof vis) {
    setVis(nextVis);
    setError("");
    try {
      await saveDetails({
        ...(profile?.details ?? {}),
        privacy: JSON.stringify(nextVis),
      });
      setOk(t("acc.priv.savedVis"));
      window.setTimeout(() => setOk(""), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("acc.priv.errVis"));
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (next.length < 8) {
      setError(t("acc.priv.errShort"));
      return;
    }
    if (next !== again) {
      setError(t("acc.priv.errMismatch"));
      return;
    }
    if (current && current !== next && current.length < 1) {
      setError(t("acc.priv.errCurrent"));
      return;
    }
    setBusy(true);
    try {
      await updatePassword(next);
      setOk(t("acc.priv.changed"));
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("acc.priv.errChange"));
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      await supabase.auth.signOut({ scope: "others" });
      setOk(t("acc.priv.signedOutOthers"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("acc.priv.errSignOut"));
    } finally {
      setBusy(false);
    }
  }

  async function endThisSession() {
    await signOut();
    window.location.href = "/login";
  }

  const strength = strengthOf(next);

  return (
    <FarmerShell>
      <PageHeader
        icon={ShieldCheck}
        title={t("acc.priv.title")}
        description={t("acc.priv.desc")}
        meta={<Chip tone="green" icon={ShieldCheck}>{t("acc.priv.badge")}</Chip>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("acc.priv.statSignedIn")} value={user?.email?.split("@")[0] ?? "—"} icon={Laptop} hint={user?.email ?? "—"} />
        <Stat label={t("acc.priv.statPassword")} value="••••••" icon={KeyRound} tone="green" hint={t("acc.priv.statPasswordHint")} />
        <Stat label={t("acc.priv.statSessions")} value={t("acc.priv.statSessionsValue")} icon={Laptop} tone="blue" hint={t("acc.priv.statSessionsHint")} />
        <Stat label={t("acc.priv.statSharing")} value={vis.showPhone ? t("acc.priv.phoneVisible") : t("acc.priv.phoneHidden")} icon={Eye} tone={vis.showPhone ? "amber" : "green"} hint={t("acc.priv.sharingHint")} />
      </div>

      {error && <ErrorNote message={error} />}
      {ok && <SuccessNote message={ok} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("acc.priv.changePassword")} icon={KeyRound}>
          <form onSubmit={changePassword} className="space-y-3 p-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.priv.current")}
              </span>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  placeholder={t("acc.priv.currentPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? t("acc.priv.hide") : t("acc.priv.show")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.priv.new")}
              </span>
              <Input
                type={show ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
              {next && (
                <div className="mt-1.5">
                  <ProgressBar
                    value={strength.score}
                    tone={strength.score < 40 ? "red" : strength.score < 80 ? "amber" : "green"}
                    label={t("acc.priv.strength")}
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">{t(strength.labelKey)}</span>
                </div>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.priv.repeat")}
              </span>
              <Input
                type={show ? "text" : "password"}
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <p className="text-[10px] leading-relaxed text-slate-400">{t("acc.priv.tip")}</p>

            <div className="flex justify-end">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? t("acc.priv.saving") : t("acc.priv.save")}
              </PrimaryButton>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title={t("acc.priv.sessions")} icon={Laptop}>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-forest">{t("acc.priv.thisDevice")}</p>
                  <p className="truncate text-[10px] text-slate-500">{typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 70) : ""}</p>
                </div>
                <Chip tone="green" icon={CheckCircle2}>
                  {t("acc.priv.active")}
                </Chip>
              </div>
              <div className="flex flex-wrap gap-2">
                <GhostButton onClick={() => void signOutEverywhere()} disabled={busy}>
                  <LogOut className="h-3.5 w-3.5" /> {t("acc.priv.signOutOthers")}
                </GhostButton>
                <GhostButton onClick={() => void endThisSession()} disabled={busy}>
                  {t("acc.priv.signOutHere")}
                </GhostButton>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400">{t("acc.priv.signOutNote")}</p>
            </div>
          </Panel>

          <Panel title={t("acc.priv.visibility")} icon={Eye}>
            <ul className="divide-y divide-slate-100">
              {[
                { key: "showLocation" as const, labelKey: "acc.priv.showLocation" as const, icon: MapPin },
                { key: "showPhone" as const, labelKey: "acc.priv.showPhone" as const, icon: Eye },
                { key: "discoverable" as const, labelKey: "acc.priv.discoverable" as const, icon: Eye },
              ].map(({ key, labelKey, icon: Icon }) => (
                <li key={key} className="flex items-center gap-3 px-4 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1 text-[11px] text-slate-600">{t(labelKey)}</span>
                  <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={vis[key]}
                      onChange={(e) => saveVis({ ...vis, [key]: e.target.checked })}
                      aria-label={t(labelKey)}
                    />
                    <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </label>
                </li>
              ))}
            </ul>
            <p className="px-4 py-2 text-[10px] leading-relaxed text-slate-400">{t("acc.priv.alwaysPrivate")}</p>
          </Panel>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          {t("acc.priv.wrongNote")}{" "}
          <Link to="/account/help" className="font-semibold text-brand-700 hover:underline">
            {t("acc.priv.contact")}
          </Link>{" "}
          {t("acc.priv.wrongNote2")}
        </p>
      </div>
    </FarmerShell>
  );
}
