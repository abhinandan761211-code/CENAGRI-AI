import {
  BarChart3,
  ClipboardList,
  CloudSun,
  Compass,
  Languages,
  Package,
  ShieldCheck,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";
import { WHY_CHOOSE } from "@/lib/data";
import type { LucideIcon } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";

const ICONS = {
  compass: Compass,
  chat: Languages,
  shield: ShieldCheck,
  logo: Sprout,
} as const;

/** i18n keys for the four "why us" cards, in the same order as WHY_CHOOSE. */
const WHY_KEYS = [
  { title: "why.1Title", body: "why.1Body" },
  { title: "why.2Title", body: "why.2Body" },
  { title: "why.3Title", body: "why.3Body" },
  { title: "why.4Title", body: "why.4Body" },
] as const;

/** The modules a signed-in account actually gets, by role area. */
const MODULES: { title: string; body: string; icon: LucideIcon; tone: string }[] = [

  {
    title: "modules.pricesTitle",
    body: "modules.pricesBody",
    icon: TrendingUp,
    tone: "bg-teal-500/12 text-[#2ED3B7]",
  },
  {
    title: "modules.weatherTitle",
    body: "modules.weatherBody",
    icon: CloudSun,
    tone: "bg-sky-500/12 text-sky-300",
  },
  {
    title: "modules.marketplaceTitle",
    body: "modules.marketplaceBody",
    icon: Store,
    tone: "bg-amber-500/12 text-amber-300",
  },
  {
    title: "modules.farmTitle",
    body: "modules.farmBody",
    icon: ClipboardList,
    tone: "bg-violet-500/12 text-violet-300",
  },
  {
    title: "modules.equipmentTitle",
    body: "modules.equipmentBody",
    icon: Package,
    tone: "bg-orange-500/12 text-orange-300",
  },
  {
    title: "modules.transportTitle",
    body: "modules.transportBody",
    icon: Truck,
    tone: "bg-rose-500/12 text-rose-300",
  },
  {
    title: "modules.storageTitle",
    body: "modules.storageBody",
    icon: Warehouse,
    tone: "bg-cyan-500/12 text-cyan-300",
  },
];

export default function WhyChoose() {
  const { t } = useLang();

  return (
    <section id="solutions" className="bg-cream py-14 sm:py-16 lg:py-20">
      <div className="container-x">
        <div className="max-w-2xl">
          <span className="landing-eyebrow">{t("why.eyebrow")}</span>
          <h2 className="landing-h2 mt-3">{t("why.title")}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
            {t("why.body")}
          </p>
        </div>

        {/* Why-us cards */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {WHY_CHOOSE.map((f, i) => {
            const Icon = ICONS[f.icon];
            return (
              <article key={f.title} className="landing-card flex gap-3.5 p-4 sm:gap-4 sm:p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-[15px] font-bold text-forest sm:text-base">
                    {t(WHY_KEYS[i].title)}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600 sm:text-sm">
                    {t(WHY_KEYS[i].body)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        {/* Modules — dark panel, because this is the product itself. */}
        <div className="mt-10 rounded-2xl bg-forest-dark p-5 sm:mt-12 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="landing-eyebrow landing-eyebrow-dark">{t("modules.badge")}</span>
              <h3 className="mt-3 font-display text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                {t("modules.title")}
              </h3>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <BarChart3 className="h-3.5 w-3.5" /> {t("modules.plans")}
            </p>
          </div>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            {MODULES.map(({ title, body, icon: Icon, tone }) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 transition hover:border-[#16C784]/40 hover:bg-white/[0.07]"
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2.5 text-[13px] font-bold text-white">{t(title as Parameters<typeof t>[0])}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{t(body as Parameters<typeof t>[0])}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
