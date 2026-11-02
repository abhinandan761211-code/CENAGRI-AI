import { useEffect, useState } from "react";
import { ArrowRight, LayoutDashboard, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
import LanguageSwitcher from "@/i18n/LanguageSwitcher";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/lib/roleHome";

/** Section anchors and the i18n key for each label. */
const NAV = [
  { key: "nav.home", href: "#home" },
  { key: "nav.modules", href: "#solutions" },
  { key: "nav.ai", href: "#ai" },
  { key: "nav.forWhom", href: "#for-whom" },
  { key: "nav.howItWorks", href: "#how-it-works" },
  { key: "nav.videos", href: "#resources" },
  { key: "nav.faq", href: "#faq" },
] as const;

/**
 * Landing header.
 *
 * One bar for every width: full links from `lg`, an inline call-to-action from
 * `sm`, and a full-width drawer below that — with the body scroll locked while
 * it is open, so the mobile menu never fights the page behind it.
 */
export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("#home");
  const { user, profile, loading } = useAuth();
  const { t } = useLang();

  const dashboardHref = user ? homeForRole(profile?.role) : "/dashboard";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** Highlight the nav link for whichever section is on screen. */
  useEffect(() => {
    const ids = NAV.map((item) => item.href.replace("#", ""));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(`#${visible.target.id}`);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  // Lock the page behind the mobile drawer, and close it on Escape.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A drawer left open while resizing up to desktop would trap the scroll.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={`landing-header sticky top-0 z-50 transition-colors duration-200 ${scrolled || open ? "is-solid" : "is-over-hero"}`}
    >
      <div className="container-x flex h-16 items-center justify-between gap-3 lg:h-18">
        <Logo variant={scrolled || open ? "dark" : "light"} />

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {NAV.map((item) => {
            const isActive = active === item.href;
            return (
              <a
                key={item.key}
                href={item.href}
                aria-current={isActive ? "true" : undefined}
                className={`landing-nav-link rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "is-active" : ""}`}
              >
                {t(item.key)}
              </a>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <LanguageSwitcher
            tone={scrolled || open ? "solid" : "hero"}
            className="hidden md:inline-flex"
          />

          {loading ? (
            <span className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
          ) : user ? (
            <Link to={dashboardHref} className="landing-btn landing-btn-primary !min-h-0 !py-2.5">
              <LayoutDashboard className="h-4 w-4" />
              {t("header.dashboard")}
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="landing-header-login rounded-lg px-3 py-2 text-sm font-semibold transition"
              >
                {t("header.login")}
              </Link>
              <Link to="/signup" className="landing-btn landing-btn-primary !min-h-0 !py-2.5">
                {t("header.getStarted")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="landing-header-burger grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
          aria-expanded={open}
          aria-controls="landing-mobile-nav"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label={t("header.closeMenu")}
            className="fixed inset-0 top-16 z-40 bg-forest-dark/40 lg:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            id="landing-mobile-nav"
            className="landing-drawer absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-slate-200 bg-white shadow-xl lg:hidden"
          >
            <nav className="container-x flex flex-col py-3" aria-label="Mobile">
              {NAV.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-3 text-[15px] font-medium transition ${active === item.href
                      ? "bg-brand-50 text-brand-800"
                      : "text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  {t(item.key)}
                </a>
              ))}

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                {user ? (
                  <Link
                    to={dashboardHref}
                    className="landing-btn landing-btn-primary col-span-2"
                    onClick={() => setOpen(false)}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    {t("header.goToDashboard")}
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="landing-btn landing-btn-ghost"
                      onClick={() => setOpen(false)}
                    >
                      {t("header.login")}
                    </Link>
                    <Link
                      to="/signup"
                      className="landing-btn landing-btn-primary"
                      onClick={() => setOpen(false)}
                    >
                      {t("header.getStarted")}
                    </Link>
                  </>
                )}
              </div>

              <div className="mt-3 flex justify-center pb-1">
                <LanguageSwitcher tone="solid" />
              </div>
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
