import { ArrowRight, Check, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { useLang } from "@/i18n/LanguageContext";

const PERKS = ["cta.perk1", "cta.perk2", "cta.perk3"] as const;

export default function CTA() {
  const { t } = useLang();

  return (
    <section id="signup" className="bg-cream pb-14 sm:pb-16 lg:pb-20">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-2xl bg-forest px-5 py-10 sm:px-10 sm:py-14 lg:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(60% 120% at 10% 0%, #2b6350 0%, rgba(43,99,80,0) 70%), radial-gradient(50% 100% at 95% 100%, #16c784 0%, rgba(22,199,132,0) 70%)",
            }}
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-2xl text-center">
            <span className="landing-eyebrow landing-eyebrow-dark !rounded-full">
              {t("cta.eyebrow")}
            </span>

            <h2 className="mt-4 font-display text-[1.6rem] font-extrabold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
              {t("cta.title")}
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-brand-100 sm:text-base">
              {t("cta.body")}
            </p>

            <ul className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {PERKS.map((perk) => (
                <li
                  key={perk}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/85"
                >
                  <Check className="h-3.5 w-3.5 text-[#16C784]" />
                  {t(perk)}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link to="/signup" className="landing-btn bg-white !text-forest hover:bg-brand-50">
                {t("cta.create")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#home" className="landing-btn landing-btn-ghost-dark">
                <Smartphone className="h-4 w-4" />
                {t("cta.getApp")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
