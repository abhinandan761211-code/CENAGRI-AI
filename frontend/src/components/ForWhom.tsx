import { ArrowRight } from "lucide-react";
import RoleCard from "./RoleCard";
import { ROLES } from "@/lib/data";
import { useLang } from "@/i18n/LanguageContext";

export default function ForWhom() {
  const { t } = useLang();

  return (
    <section id="for-whom" className="bg-cream py-14 sm:py-16 lg:py-20">
      <div className="container-x">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="landing-eyebrow">{t("forWhom.eyebrow")}</span>
            <h2 className="landing-h2 mt-3">{t("forWhom.title")}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
              {t("forWhom.body")}
            </p>
          </div>
          <a
            href="#solutions"
            className="landing-btn landing-btn-ghost self-start sm:self-auto sm:shrink-0"
          >
            {t("forWhom.viewAll")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {ROLES.map((role) => (
            <RoleCard key={role.title} role={role} />
          ))}
        </div>
      </div>
    </section>
  );
}
