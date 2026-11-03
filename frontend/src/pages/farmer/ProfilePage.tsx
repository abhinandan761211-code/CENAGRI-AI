import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  ChevronRight,
  FileText,
  Globe,
  Landmark,
  Leaf,
  LockKeyhole,
  MapPin,
  Phone,
  ShieldQuestion,
  Sprout,
  Tractor,
  User,
  UserCog,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import { Chip, PageHeader, Panel, ProgressBar, Stat } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import { LANGUAGES } from "@/i18n/languages";
import { listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import { listDocuments } from "@/lib/farmer";
import type { FarmerDocument } from "@/lib/farmer";

/**
 * My Profile — the account overview.
 *
 * Profile completion is computed from what the account actually has, item by
 * item, so the farmer can see exactly what is missing and jump straight to it.
 * Verification status comes from the documents the account has uploaded; it is
 * never assumed.
 */

type Task = {
  key: string;
  label: string;
  done: boolean;
  to: string;
};

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const { lang } = useLang();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [documents, setDocuments] = useState<FarmerDocument[]>([]);

  const details = profile?.details ?? {};

  const load = useCallback(async () => {
    if (!user) return;
    const [farmRows, cropRows, docRows] = await Promise.all([
      listFarms().catch(() => []),
      listCrops().catch(() => []),
      listDocuments().catch(() => []),
    ]);
    setFarms(farmRows);
    setCrops(cropRows);
    setDocuments(docRows);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Farmer";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const location = [details.village, details.block, details.district, details.state].filter(Boolean).join(", ");

  const language = LANGUAGES.find((l) => l.code === lang);

  /** Which of the five verification steps are complete. */
  const verified = documents.some((d) => d.status === "verified");
  const pending = documents.some((d) => d.status === "pending");
  const hasAadhaar = documents.some((d) => d.kind === "aadhaar");

  const tasks = useMemo<Task[]>(
    () => [
      { key: "name", label: "Your name", done: Boolean(profile?.full_name), to: "/account/personal" },
      { key: "phone", label: "Mobile number", done: Boolean(profile?.phone), to: "/account/personal" },
      { key: "location", label: "Village, district and state", done: Boolean(details.district && details.state), to: "/account/personal" },
      { key: "farm", label: "At least one farm", done: farms.length > 0, to: "/my-farm" },
      { key: "crop", label: "At least one crop", done: crops.length > 0, to: "/crops" },
      { key: "aadhaar", label: "Aadhaar uploaded", done: hasAadhaar, to: "/account/documents" },
      { key: "land", label: "Land record uploaded", done: documents.some((d) => d.kind === "land_record"), to: "/account/documents" },
      { key: "bank", label: "Bank details uploaded", done: documents.some((d) => d.kind === "bank_passbook"), to: "/account/documents" },
    ],
    [profile?.full_name, profile?.phone, details.district, details.state, farms, crops, hasAadhaar, documents]
  );

  const completion = Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
  const missing = tasks.filter((t) => !t.done);

  return (
    <FarmerShell>
      <PageHeader
        icon={User}
        title="My Profile"
        description="How your account looks to buyers, workers, transporters and advisors on CenAGRI — and how complete it is."
        actions={
          <Link to="/account/personal" className="creator-btn-primary inline-flex h-9 items-center gap-1.5 px-3.5 text-xs">
            <UserCog className="h-3.5 w-3.5" /> Edit details
          </Link>
        }
      />

      <section className="creator-card relative overflow-hidden rounded-xl2 bg-forest px-5 py-6 text-white sm:px-7">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 15%, #4ade80 0, transparent 45%), radial-gradient(circle at 60% 90%, #22c55e 0, transparent 40%)",
          }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-xl font-black ring-2 ring-white/30">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-16 w-16 object-cover" referrerPolicy="no-referrer" />
            ) : (
              initials || "CA"
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-xl font-extrabold">
              {name}
              {verified ? (
                <Chip tone="green" icon={BadgeCheck}>
                  Verified
                </Chip>
              ) : pending ? (
                <Chip tone="amber">Verification pending</Chip>
              ) : (
                <Chip tone="slate">Not verified</Chip>
              )}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/80">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {location || "Location not set"}
              </span>
              {profile?.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {profile.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3 w-3" /> {language?.native ?? "English"}
              </span>
            </p>
            <p className="mt-2 max-w-md text-[11px] text-white/65">
              {farms.length} farm{farms.length === 1 ? "" : "s"} · {crops.filter((c) => c.status !== "harvested").length} active
              crops · {documents.length} document{documents.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-white/10 p-3.5 text-center ring-1 ring-inset ring-white/15 sm:min-w-[140px]">
            <p className="text-[10px] uppercase tracking-wide text-white/70">Profile completion</p>
            <p className="mt-1 font-display text-2xl font-extrabold">{completion}%</p>
            <div className="mt-1.5">
              <ProgressBar value={completion} tone="teal" label="Profile completion" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Farms" value={farms.length} icon={Tractor} hint="Land records" />
        <Stat label="Active crops" value={crops.filter((c) => c.status !== "harvested").length} icon={Sprout} tone="teal" hint="On the land now" />
        <Stat
          label="Documents"
          value={documents.length}
          icon={FileText}
          tone="blue"
          hint={verified ? "At least one verified" : pending ? "Awaiting review" : "None verified"}
        />
        <Stat label="Account type" value="Farmer" icon={Leaf} tone="green" hint="Set at signup" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={missing.length === 0 ? "Everything is filled in" : "Finish your profile"}
          description={missing.length === 0 ? "Buyers and services can reach you with a complete profile." : `${missing.length} item${missing.length === 1 ? "" : "s"} still to do`}
          icon={BadgeCheck}
        >
          <ul className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <li key={task.key}>
                <Link to={task.to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                      task.done ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-400"
                    }`}
                  >
                    {task.done ? "✓" : ""}
                  </span>
                  <span className={`flex-1 text-xs ${task.done ? "text-slate-500" : "font-semibold text-forest"}`}>
                    {task.label}
                  </span>
                  {!task.done && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Account settings" icon={UserCog}>
          <ul className="divide-y divide-slate-100">
            {[
              { to: "/account/personal", label: "Personal information", body: "Name, phone, email and address", icon: UserCog },
              { to: "/account/farming", label: "Farming information", body: "Land, crops, soil and experience", icon: Tractor },
              { to: "/account/documents", label: "My Documents & KYC", body: "Aadhaar, land record, bank details", icon: FileText },
              { to: "/account/language", label: "Language", body: `${language?.native ?? "English"} — change any time`, icon: Globe },
              { to: "/account/notifications", label: "Notification settings", body: "What reaches you, and how", icon: BadgeCheck },
              { to: "/account/privacy", label: "Privacy & security", body: "Password, sessions and visibility", icon: LockKeyhole },
              { to: "/account/help", label: "Help & support", body: "FAQs, complaints and the helpline", icon: ShieldQuestion },
              { to: "/account/manage", label: "Account management", body: "Export data, close the account", icon: Landmark },
            ].map(({ to, label: text, body, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-forest">{text}</span>
                    <span className="block truncate text-[11px] text-slate-500">{body}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="text-[10px] leading-relaxed text-slate-400">
        Your farm records, documents and financial entries are visible only to your account. Buyers see your name,
        district and listings — nothing more.
      </p>
    </FarmerShell>
  );
}
