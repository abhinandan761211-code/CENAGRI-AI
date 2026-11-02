import { MessageSquareQuote } from "lucide-react";
import { Link } from "react-router-dom";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Success stories.
 *
 * The previous version showed three named people with quotes and five stars.
 * Those were not real — no farmer said them, and no rating was collected. On a
 * page whose only job is trust, a fabricated review is the worst possible debt
 * to take on.
 *
 * So this section states plainly that no verified feedback has been published
 * yet. When real reviews exist (the `equipment_reviews`, worker and warehouse
 * review tables already store verified, booking-tied feedback), this becomes a
 * carousel of those rows — server-side, with the booking id as proof.
 */
export default function Testimonials() {
  const { t } = useLang();

  return (
    <section id="stories" className="bg-cream py-14 sm:py-16 lg:py-20">
      <div className="container-x">
        <div className="max-w-2xl">
          <span className="landing-eyebrow">{t("story.eyebrow")}</span>
          <h2 className="landing-h2 mt-3">{t("story.title")}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
            {t("story.body")}
          </p>
        </div>

        <div className="landing-card mt-8 flex flex-col items-start gap-4 p-5 sm:mt-10 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <MessageSquareQuote className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold text-forest">
              {t("story.noneTitle")}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600 sm:text-sm">
              {t("story.noneBody")}
            </p>
          </div>
          <Link
            to="/signup"
            className="landing-btn landing-btn-ghost w-full shrink-0 sm:w-auto"
          >
            {t("story.cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
