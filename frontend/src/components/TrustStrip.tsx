import { CloudSun, Landmark, Leaf, ShieldCheck, Sprout, Truck, Store } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";

const ICONS = [CloudSun, Sprout, Landmark, Truck, Store, ShieldCheck, Leaf];

/**
 * Source strip under the hero. On phones it scrolls horizontally instead of
 * wrapping into four uneven rows, which keeps the fold short.
 */
export default function TrustStrip() {
  const { t, tList } = useLang();
  const labels = tList("trust.items");
  const items = ICONS.map((icon, i) => ({ icon, label: labels[i] ?? "" }));

  return (
    <section aria-label={t("trust.aria")} className="border-b border-slate-200 bg-white">
      <div className="container-x flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:gap-6">
        <p className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {t("trust.heading")}
        </p>

        {/* Marquee below lg; the static row takes over where there is room. */}
        <div className="relative -mx-4 overflow-hidden sm:-mx-6 lg:hidden">
          <div className="landing-marquee-mask">
            <ul className="landing-marquee px-4 sm:px-6">
              {[...items, ...items].map(({ icon: Icon, label }, index) => (
                <li
                  key={`${label}-${index}`}
                  className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-500"
                >
                  <Icon className="h-4 w-4 text-brand-600" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ul className="hidden flex-1 flex-nowrap items-center justify-end gap-x-5 lg:flex xl:gap-x-6">
          {items.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-slate-500 xl:text-[13px]"
            >
              <Icon className="h-4 w-4 text-brand-600" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
