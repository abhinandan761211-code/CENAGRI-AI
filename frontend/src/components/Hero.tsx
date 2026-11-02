import {
  ArrowRight,
  BadgeCheck,
  CloudSun,
  Droplets,
  Leaf,
  MapPin,
  PlayCircle,
  Sprout,
  TrendingUp,
  Wind,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Hero proof points.
 *
 * These are product facts, not usage figures. The previous version claimed
 * "48,000+ farmers" and "12L+ advisories served" — numbers nobody measured, on a
 * page whose whole job is to be trusted. If real counts become available from an
 * endpoint, pass them in as props instead of hardcoding them here.
 */
const PROOF = [
  { value: "8", label: "hero.proof1Label" },
  { value: "22", label: "hero.proof2Label" },
  { value: "₹0", label: "hero.proof3Label" },
] as const;

const FORECAST = [
  { day: "hero.today", icon: CloudSun, temp: "31°", rain: "20%" },
  { day: "hero.tue", icon: Droplets, temp: "29°", rain: "70%" },
  { day: "hero.wed", icon: CloudSun, temp: "30°", rain: "35%" },
  { day: "hero.thu", icon: Wind, temp: "28°", rain: "15%" },
] as const;

const PRICES = [
  { crop: "hero.crop1", price: "₹2,340", change: "+3.2%", up: true },
  { crop: "hero.crop2", price: "₹1,180", change: "+1.1%", up: true },
  { crop: "hero.crop3", price: "₹5,420", change: "−0.8%", up: false },
] as const;

/**
 * Landing hero.
 *
 * Mobile: text first, then one compact "today" card — nothing overlaps, all
 * touch targets are 48px. Tablet: two-column price/weather cards under the text.
 * Desktop: copy on the left, a phone-style advisory preview on the right.
 */
export default function Hero() {
  const { t } = useLang();

  return (
    <section id="home" className="landing-hero -mt-16 pt-16 lg:-mt-18 lg:pt-18">
      <div className="landing-hero-glow" aria-hidden="true" />

      <div className="container-x relative grid items-center gap-10 pb-14 pt-8 sm:gap-12 sm:pb-20 sm:pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pb-24 lg:pt-16">
        {/* ── Copy ── */}
        <div className="animate-fade-up">
          <span className="landing-eyebrow landing-eyebrow-dark !rounded-full">
            <Sprout className="h-3.5 w-3.5" />
            {t("hero.badge")}
          </span>

          <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.1] tracking-tight text-white sm:mt-5 sm:text-[2.75rem] lg:text-[3.4rem]">
            {t("hero.title1")}
            <span className="mt-1 block bg-gradient-to-r from-[#16C784] to-[#2ED3B7] bg-clip-text text-transparent">
              {t("hero.title2")}
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:mt-5 sm:text-lg">
            {t("hero.subtitle")}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/signup" className="landing-btn landing-btn-primary w-full sm:w-auto">
              {t("hero.cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="landing-btn landing-btn-ghost-dark w-full sm:w-auto"
            >
              <PlayCircle className="h-4 w-4" />
              {t("hero.explore")}
            </a>
          </div>

          <dl className="mt-8 grid grid-cols-3 gap-2.5 sm:mt-10 sm:gap-3">
            {PROOF.map((s) => (
              <div key={s.label} className="landing-stat">
                <dt className="font-display text-lg font-extrabold leading-none text-white sm:text-2xl">
                  {s.value}
                </dt>
                <dd className="mt-1.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
                  {t(s.label)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── Product preview ── */}
        <div
          className="relative animate-fade-up [animation-delay:120ms]"
          aria-label={t("hero.ariaPreview")}
        >
          <div className="landing-card-dark overflow-hidden shadow-2xl backdrop-blur">
            {/* Card header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#16C784] text-[11px] font-black text-forest-dark">
                  CA
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-white">{t("hero.previewTitle")}</p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                    <MapPin className="h-3 w-3" /> {t("hero.previewPlace")}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#16C784]/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#2ED3B7]">
                <BadgeCheck className="h-3 w-3" /> {t("hero.sample")}
              </span>
            </div>

            {/* Advisory */}
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#16C784]/25 bg-[#16C784]/10 p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#2ED3B7]">
                  <Leaf className="h-3.5 w-3.5" /> {t("hero.advisory")}
                </p>
                <p className="mt-1.5 text-sm font-semibold leading-snug text-white">
                  {t("hero.advisoryBangla")}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  {t("hero.advisoryBody")}
                </p>
              </div>

              {/* Forecast row */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("hero.forecast")}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {FORECAST.map(({ day, icon: Icon, temp, rain }) => (
                    <div
                      key={day}
                      className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-2 text-center"
                    >
                      <p className="text-[10px] font-semibold text-slate-400">{t(day)}</p>
                      <Icon className="mx-auto my-1 h-4 w-4 text-[#16C784]" />
                      <p className="text-[11px] font-bold text-white">{temp}</p>
                      <p className="text-[10px] text-slate-500">{rain}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prices */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <TrendingUp className="h-3 w-3 text-[#16C784]" /> {t("hero.mandi")}
                </p>
                <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/5">
                  {PRICES.map((row) => (
                    <li
                      key={row.crop}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="truncate text-[12px] text-slate-300">{t(row.crop)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[12px] font-bold text-white">{row.price}</span>
                        <span
                          className={`text-[10px] font-semibold ${row.up ? "text-[#16C784]" : "text-rose-400"
                            }`}
                        >
                          {row.change}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500">
                {t("hero.disclaimer")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
