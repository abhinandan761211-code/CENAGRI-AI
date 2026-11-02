import { ArrowRight, BrainCircuit, CloudSun, Languages, Sprout, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useLang } from "@/i18n/LanguageContext";

/**
 * AI-powered agriculture.
 *
 * The advisory endpoint (`POST /advisory`) takes a question plus crop, district
 * and weather context, and returns an answer with a `mode` of "ai" or "demo" so
 * the UI never disguises rule-based guidance as a model answer.
 *
 * The "not yet" column exists on purpose. Claiming photo diagnosis or voice
 * input that do not work would send a farmer to a feature that silently fails.
 */
const CAPABILITIES = [
  {
    icon: Sprout,
    title: "ai.cap1Title",
    body: "ai.cap1Body",
  },
  {
    icon: CloudSun,
    title: "ai.cap2Title",
    body: "ai.cap2Body",
  },
  {
    icon: Languages,
    title: "ai.cap3Title",
    body: "ai.cap3Body",
  },
  {
    icon: BrainCircuit,
    title: "ai.cap4Title",
    body: "ai.cap4Body",
  },
] as const;

const NOT_YET = ["ai.notYet1", "ai.notYet2", "ai.notYet3"] as const;

export default function AISection() {
  const { t } = useLang();

  return (
    <section id="ai" className="bg-white py-14 sm:py-16 lg:py-20">
      <div className="container-x">
        <div className="overflow-hidden rounded-2xl bg-forest">
          <div className="grid gap-0 lg:grid-cols-2">
            {/* Copy */}
            <div className="p-5 sm:p-8 lg:p-10">
              <span className="landing-eyebrow landing-eyebrow-dark !rounded-full">
                {t("ai.eyebrow")}
              </span>
              <h2 className="mt-4 font-display text-[1.5rem] font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
                {t("ai.title1")}
                <span className="mt-1 block text-[#2ED3B7]">{t("ai.title2")}</span>
              </h2>
              <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-brand-100">
                {t("ai.body")}
              </p>

              <ul className="mt-6 space-y-3">
                {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[#2ED3B7]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white">{t(title)}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{t(body)}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Link to="/signup" className="landing-btn landing-btn-primary">
                  {t("ai.cta")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Honest limits panel */}
            <div className="border-t border-white/10 p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {t("ai.notYet")}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
                {t("ai.notYetBody")}
              </p>
              <ul className="mt-4 space-y-2">
                {NOT_YET.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300">
                      <X className="h-3 w-3" />
                    </span>
                    <span className="text-[12.5px] text-slate-300">{t(item)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 rounded-xl border border-[#2ED3B7]/25 bg-[#2ED3B7]/10 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#2ED3B7]">
                  {t("ai.live")}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">
                  {t("ai.liveBody")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
