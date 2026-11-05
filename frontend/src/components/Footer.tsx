import { useState } from "react";
import { ChevronDown, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
import LanguageSwitcher from "@/i18n/LanguageSwitcher";
import { useLang } from "@/i18n/LanguageContext";

const COLUMNS = [
  {
    title: "footer.colPlatform",
    links: [
      { label: "footer.marketplace", to: "/signup" },
      { label: "footer.equipmentRental", to: "/signup" },
      { label: "footer.transport", to: "/signup" },
      { label: "footer.warehouseStorage", to: "/signup" },
      { label: "footer.videoHub", to: "/video-hub" },
    ],
  },
  {
    // Each of these scrolls to a section that exists on this page. There is no
    // separate /about or /press route yet, so they are not faked as links.
    title: "footer.colExplore",
    links: [
      { label: "footer.howItWorks", to: "#how-it-works" },
      { label: "footer.accountTypes", to: "#for-whom" },
      { label: "footer.platformFaq", to: "#faq" },
      { label: "footer.signIn", to: "/login" },
      { label: "footer.createAccount", to: "/signup" },
    ],
  },
  {
    title: "footer.colAccounts",
    links: [
      { label: "role.name.Farmer", to: "/signup?role=Farmer" },
      { label: "role.name.Buyer", to: "/signup?role=Buyer" },
      { label: "role.name.Retailer", to: "/signup?role=Retailer" },
      { label: "role.name.Worker", to: "/signup?role=Worker" },
      { label: "role.name.Transporter", to: "/signup?role=Transporter" },
      { label: "role.name.Content Creator", to: "/signup?role=Content%20Creator" },
    ],
  },
] as const;

export default function Footer() {
  const [open, setOpen] = useState<string | null>(null);
  const { t } = useLang();

  return (
    <footer className="bg-forest-dark text-brand-100">
      <div className="container-x py-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_2.7fr] lg:gap-10">
          <div>
            <Logo variant="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-200/80">
              {t("footer.tagline")}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="tel:1800"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-white/10"
              >
                <Phone className="h-3.5 w-3.5" /> {t("footer.helpline")}
              </a>
              <a
                href="mailto:hello@kalika.example"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-white/10"
              >
                <Mail className="h-3.5 w-3.5" /> {t("footer.email")}
              </a>
            </div>

            <p className="mt-4 text-xs text-brand-200/60">
              {t("footer.sdg")}
            </p>
          </div>

          {/* Accordion on phones so four columns don't stack into a wall. */}
          <div className="md:hidden">
            {COLUMNS.map((col) => {
              const isOpen = open === col.title;
              return (
                <div key={col.title} className="border-b border-white/10">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : col.title)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                      {t(col.title)}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-brand-200/70 transition-transform ${isOpen ? "rotate-180" : ""
                        }`}
                    />
                  </button>
                  {isOpen && (
                    <ul className="space-y-1 pb-3">
                      {col.links.map((link) => (
                        <li key={link.label}>
                          <Link
                            to={link.to}
                            className="block py-1.5 text-[13.5px] text-brand-200/80 hover:text-white"
                          >
                            {t(link.label)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* Full columns from md. */}
          <div className="hidden grid-cols-3 gap-8 sm:grid md:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                  {t(col.title)}
                </h3>
                <ul className="mt-3 space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-[13px] text-brand-200/80 transition hover:text-white"
                      >
                        {t(link.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-brand-200/60">
            © {new Date().getFullYear()} Kalika. {t("footer.rights")}
          </p>
          <LanguageSwitcher tone="dark" />
        </div>
      </div>
    </footer>
  );
}
