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
import { supabase } from "@/lib/supabase";

/**
 * Privacy & Security — password, sessions and what other accounts can see.
 *
 * Password strength is a local estimate. Signing out other devices uses
 * Supabase's `signOut({ scope: 'others' })`, which revokes every refresh token
 * except this browser's — the real, supported way to end sessions.
 */

function strengthOf(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const label = ["Very weak", "Weak", "Fair", "Good", "Strong", "Strong"][score] ?? "Weak";
  return { score: (score / 5) * 100, label };
}

export default function PrivacyPage() {
  const { user, signOut, updatePassword } = useAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [vis, setVis] = useState({ showLocation: true, showPhone: false, discoverable: true });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cenagri.privacy");
      if (saved) setVis(JSON.parse(saved) as typeof vis);
    } catch {
      /* ignore */
    }
  }, []);

  function saveVis(nextVis: typeof vis) {
    setVis(nextVis);
    try {
      localStorage.setItem("cenagri.privacy", JSON.stringify(nextVis));
      setOk("Privacy preferences saved on this device.");
      window.setTimeout(() => setOk(""), 2200);
    } catch {
      setError("Could not save the preference in this browser.");
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (next.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (next !== again) {
      setError("The two new passwords do not match.");
      return;
    }
    if (current && current !== next && current.length < 1) {
      setError("Enter your current password.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(next);
      setOk("Password changed. Other devices keep their session until they sign out.");
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
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
      setOk("Signed out of all other devices.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out other sessions.");
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
        title="Privacy & Security"
        description="Your password, your signed-in devices, and what other accounts can see about you."
        meta={<Chip tone="green" icon={ShieldCheck}>Account secured by Supabase</Chip>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Signed in as" value={user?.email?.split("@")[0] ?? "You"} icon={Laptop} hint={user?.email ?? "—"} />
        <Stat label="Password" value={strengthOf(next).label === "Very weak" ? "Set" : "Set"} icon={KeyRound} tone="green" hint="Change it below" />
        <Stat label="Sessions" value="This device" icon={Laptop} tone="blue" hint="Sign out others below" />
        <Stat label="Data sharing" value={vis.showPhone ? "Phone visible" : "Phone hidden"} icon={Eye} tone={vis.showPhone ? "amber" : "green"} hint="To people you message" />
      </div>

      {error && <ErrorNote message={error} />}
      {ok && <SuccessNote message={ok} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Change password" icon={KeyRound}>
          <form onSubmit={changePassword} className="space-y-3 p-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Current password
              </span>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Not required if you signed in with Google"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                New password
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
                    label="Password strength"
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">{strength.label}</span>
                </div>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Repeat new password
              </span>
              <Input
                type={show ? "text" : "password"}
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <p className="text-[10px] leading-relaxed text-slate-400">
              Use 8 or more characters with a mix of letters, numbers and a symbol. Do not reuse your bank PIN.
            </p>

            <div className="flex justify-end">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? "Saving…" : "Change password"}
              </PrimaryButton>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Sessions" icon={Laptop}>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-forest">This device</p>
                  <p className="truncate text-[10px] text-slate-500">{typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 70) : ""}</p>
                </div>
                <Chip tone="green" icon={CheckCircle2}>
                  Active
                </Chip>
              </div>
              <div className="flex flex-wrap gap-2">
                <GhostButton onClick={() => void signOutEverywhere()} disabled={busy}>
                  <LogOut className="h-3.5 w-3.5" /> Sign out other devices
                </GhostButton>
                <GhostButton onClick={() => void endThisSession()} disabled={busy}>
                  Sign out here
                </GhostButton>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Signing out other devices ends every session except this one. If you think someone else has your
                password, change it first, then sign out the rest.
              </p>
            </div>
          </Panel>

          <Panel title="What others can see" icon={Eye}>
            <ul className="divide-y divide-slate-100">
              {[
                { key: "showLocation" as const, label: "Show my district to buyers and workers", icon: MapPin },
                { key: "showPhone" as const, label: "Show my phone number to people I message", icon: Eye },
                { key: "discoverable" as const, label: "Let other farmers find me on CenFriend", icon: Eye },
              ].map(({ key, label: text, icon: Icon }) => (
                <li key={key} className="flex items-center gap-3 px-4 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1 text-[11px] text-slate-600">{text}</span>
                  <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={vis[key]}
                      onChange={(e) => saveVis({ ...vis, [key]: e.target.checked })}
                      aria-label={text}
                    />
                    <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </label>
                </li>
              ))}
            </ul>
            <p className="px-4 py-2 text-[10px] leading-relaxed text-slate-400">
              Farm records, documents and money entries are always private to your account.
            </p>
          </Panel>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Something looks wrong on your account?{" "}
          <Link to="/account/help" className="font-semibold text-brand-700 hover:underline">
            Contact support
          </Link>{" "}
          and mention the date you noticed it.
        </p>
      </div>
    </FarmerShell>
  );
}
