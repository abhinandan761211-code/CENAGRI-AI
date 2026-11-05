import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, CloudSun, Languages, TrendingUp } from "lucide-react";
import Logo from "../Logo";
import LanguageSwitcher from "@/i18n/LanguageSwitcher";
import { useLang } from "@/i18n/LanguageContext";

const HIGHLIGHT_KEYS = [
  { icon: CloudSun, title: "auth.hl1Title", body: "auth.hl1Body" },
  { icon: TrendingUp, title: "auth.hl2Title", body: "auth.hl2Body" },
  { icon: Languages, title: "auth.hl3Title", body: "auth.hl3Body" },
] as const;

export default function AuthLayout({
  children,
  badge,
  wide = false,
}: {
  children: ReactNode;
  /** i18n key of the pill above the form. */
  badge?: string;
  wide?: boolean;
}) {
  const { t } = useLang();

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ── Left: brand panel ── */}
      <aside className="relative hidden overflow-hidden bg-forest lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(70% 60% at 15% 0%, #2b6350 0%, rgba(43,99,80,0) 65%), radial-gradient(60% 60% at 90% 100%, #16a34a 0%, rgba(22,163,74,0) 70%)",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(70% 70% at 50% 40%, #000 30%, transparent 100%)",
          }}
          aria-hidden="true"
        />

        <div className="relative flex flex-1 flex-col p-10 xl:p-12">
          <Logo variant="light" />

          <div className="mt-auto max-w-md">
            <span className="eyebrow rounded-full bg-white/10 px-3 py-1.5 text-brand-200">
              <Check className="h-3.5 w-3.5" />
              {t("auth.brandBadge")}
            </span>

            <h2 className="mt-5 font-display text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-[2.35rem]">
              {t("auth.brandTitle1")}
              <span className="text-brand-300">{t("auth.brandTitle2")}</span>
            </h2>

            <ul className="mt-8 space-y-5">
              {HIGHLIGHT_KEYS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3.5">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-white/15">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{t(title)}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-brand-100/75">
                      {t(body)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-9 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600/20 text-brand-200 ring-1 ring-white/10">
                <Check className="h-4 w-4" />
              </span>
              <p className="text-xs leading-snug text-brand-100/80">
                {t("auth.bottomNote")}
              </p>
            </div>
          </div>

          <p className="mt-auto pt-10 text-[11px] text-brand-200/50">
            © {new Date().getFullYear()} Kalika · {t("auth.sdg")}
          </p>
        </div>
      </aside>

      {/* ── Right: form ── */}
      <main className="relative flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-5 sm:px-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="flex items-center gap-3 lg:ml-auto">
            <LanguageSwitcher tone="panel" />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-forest"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("auth.backHome")}
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-8 sm:px-8">
          <div className={`w-full ${wide ? "max-w-[560px]" : "max-w-[440px]"}`}>
            {badge && (
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">
                {badge}
              </span>
            )}
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
