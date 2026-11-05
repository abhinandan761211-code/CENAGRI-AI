import { CalendarCheck, ShoppingBasket, UserRoundPlus } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";

const STEPS = [
  {
    step: "01",
    title: "how.step1Title",
    body: "how.step1Body",
    icon: UserRoundPlus,
    detail: "how.step1Detail",
  },
  {
    step: "02",
    title: "how.step2Title",
    body: "how.step2Body",
    icon: CalendarCheck,
    detail: "how.step2Detail",
  },
  {
    step: "03",
    title: "how.step3Title",
    body: "how.step3Body",
    icon: ShoppingBasket,
    detail: "how.step3Detail",
  },
] as const;

export default function HowItWorks() {
  const { t } = useLang();

  return (
    <section
      id="how-it-works"
      className="border-y border-slate-200 bg-white py-14 sm:py-16 lg:py-20"
    >
      <div className="container-x">
        <div className="max-w-2xl">
          <span className="landing-eyebrow">{t("how.eyebrow")}</span>
          <h2 className="landing-h2 mt-3">{t("how.title")}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
            {t("how.body")}
          </p>
        </div>

        <ol className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-5">
          {STEPS.map(({ step, title, body, icon: Icon, detail }, index) => (
            <li key={step} className="relative">
              {/* Connector between steps on tablet and up. */}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute right-[-10px] top-12 hidden h-px w-5 bg-slate-200 sm:block"
                />
              )}

              <div className="landing-card h-full p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-2xl font-extrabold leading-none text-brand-200">
                    {step}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-base font-bold text-forest sm:text-lg">
                  {t(title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(body)}</p>
                <p className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  {t(detail)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
