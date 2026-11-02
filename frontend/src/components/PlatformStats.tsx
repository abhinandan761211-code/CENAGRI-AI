import { Boxes, Building2, Tractor, Warehouse as WarehouseIcon } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Platform statistics.
 *
 * There is no metrics endpoint (there is no admin analytics API this page can
 * call anonymously), so there are NO registration counts here. The earlier hero
 * claimed "48,000+ farmers" and "12L+ advisories" — those numbers were invented.
 *
 * What is shown instead is what the platform *is*: a countable, verifiable
 * description of the product. Swap `ITEMS` for a fetch when a public stats
 * endpoint exists, and pass the values in as props.
 */
const ITEMS = [
  { icon: Building2, value: "8", label: "stats.types", hint: "stats.typesHint" },
  { icon: Boxes, value: "13+", label: "stats.modules", hint: "stats.modulesHint" },
  { icon: Tractor, value: "5", label: "stats.equipment", hint: "stats.equipmentHint" },
  { icon: WarehouseIcon, value: "22", label: "stats.languages", hint: "stats.languagesHint" },
] as const;

export default function PlatformStats() {
  const { t } = useLang();

  return (
    <section aria-label={t("stats.aria")} className="border-y border-slate-200 bg-white">
      <div className="container-x py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, value, label, hint }) => (
            <div key={label} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 sm:p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-extrabold leading-none text-forest">{value}</p>
                <p className="mt-1 truncate text-[12px] font-semibold text-slate-700">{t(label)}</p>
                <p className="truncate text-[10.5px] text-slate-500">{t(hint)}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
          {t("stats.footnote")}
        </p>
      </div>
    </section>
  );
}
