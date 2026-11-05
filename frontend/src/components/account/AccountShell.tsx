import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bell, Headphones, Languages, LogOut, Menu, Search, Settings, User, Video, X } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "@/components/Logo";
import type { LucideIcon } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";
import { LanguagePills } from "@/i18n/LanguageSelector";
import "@/styles/account.css";

/**
 * Shared account chrome for every role dashboard.
 *
 * Lifted from the farmer dashboard so all accounts share one base layout and
 * differ ONLY in their feature content:
 *
 *   sidebar (brand · nav · help card)  →  sticky header (search · bell ·
 *   settings · avatar)  →  optional hero banner  →  page content.
 *
 * Nothing role-specific lives here: the caller passes its own nav, search
 * index, hero and notifications. That keeps Farmer, Buyer and Retailer on the
 * same base while their features stay separate.
 *
 * Colour code: the Shop (retailer) account's light palette — cream page, white
 * surfaces, slate lines, forest headings and brand-700 green. `acct-root`
 * applies it to every account rendered through this shell, so a page written
 * against the dark creator tokens still comes out in the account colours. The
 * Content Creator studio has its own shell and is deliberately untouched.
 */

export type ShellNavItem = {
  label: string;
  /**
   * Translation key for `label`. The label text stays in English so the
   * existing nav arrays read naturally and the active-item logic is unchanged;
   * the shell renders `t(tkey)` when one is present. Without a key the label is
   * shown as written.
   */
  tkey?: string;
  icon: LucideIcon;
  /** Navigate to a route. */
  to?: string;
  /** Scroll to a section on the current page (e.g. "#orders"). */
  section?: string;
  /** Run a custom action (open a dialog, switch a tab …). */
  onSelect?: () => void;
  /** Count pill, e.g. pending orders. */
  badge?: number;
  /** Renders as the active item. */
  active?: boolean;
};

export type SearchEntry = {
  label: string;
  /** Optional translation key; when absent the label is shown as written. */
  tkey?: string;
  /** Space-separated words the search box matches on. */
  keywords: string;
  /** Small right-hand hint, e.g. "Orders". */
  section: string;
  /** Where the result goes: a route … */
  to?: string;
  /** … a section on this page … */
  anchor?: string;
  /** … or a custom action (dialog/tab). */
  onSelect?: () => void;
};

export type ShellNotification = {
  id: string;
  title: string;
  body: string;
  icon?: LucideIcon;
  /** Route to open when the row is clicked. */
  to?: string;
};

export default function AccountShell({
  nav,
  search,
  searchPlaceholder,
  notifications = [],
  displayName,
  initials,
  avatarUrl,
  settingsTo,
  helpCard,
  onSignOut,
  children,
}: {
  nav: ShellNavItem[];
  /** Optional search index; the search box is hidden when omitted. */
  search?: SearchEntry[];
  searchPlaceholder?: string;
  notifications?: ShellNotification[];
  displayName: string;
  initials: string;
  avatarUrl?: string | null;
  settingsTo: string;
  /** Sidebar bottom card — the role's helpline / support block. */
  helpCard?: { title: string; body: string; phone: string };
  onSignOut: () => void;
  children: ReactNode;
}) {
  /*
   * The signed-in shell follows the account's language.
   *
   * This is the ONE place the language control lives for every account type
   * (retailer, worker, transporter, warehouse, equipment, employer …), so no
   * dashboard needs its own switcher and a language change applies to all of
   * them the same way.
   */
  const { t, lang, tf } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * Desktop hover-to-open. The sidebar is a narrow rail normally; moving the
   * cursor to the left edge expands it, and leaving it (after a short delay,
   * so a jittery mouse does not slam it shut) collapses it again.
   */
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  // Clear the pending hover timer if the component unmounts.
  useEffect(() => {
    return () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  function handleSidebarEnter() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setSidebarHovered(true);
  }

  function handleSidebarLeave() {
    hoverTimer.current = window.setTimeout(() => setSidebarHovered(false), 220);
  }

  // Close the search dropdown on an outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (search ?? []).filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) || entry.keywords.toLowerCase().includes(q)
    );
  }, [query, search]);

  const unread = notifications.filter((n) => !seen.includes(n.id)).length;

  function goTo(entry: SearchEntry) {
    setSearchOpen(false);
    setQuery("");
    setNotifOpen(false);
    if (entry.onSelect) return entry.onSelect();
    if (entry.anchor) {
      document
        .querySelector(entry.anchor)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="acct-root min-h-screen bg-cream">
      <div className="flex">
        {/* Thin hover strip: the rail is only 64px wide, so this gives the
            cursor an easy target at the very edge of the screen. */}
        <div
          aria-hidden="true"
          onMouseEnter={handleSidebarEnter}
          className="fixed inset-y-0 left-0 z-30 hidden w-3 lg:block"
        />

        {/* ── Sidebar ── */}
        <aside
          onMouseEnter={handleSidebarEnter}
          onMouseLeave={handleSidebarLeave}
          onFocusCapture={handleSidebarEnter}
          aria-label={t("s.sidebar")}
          className={`fixed inset-y-0 left-0 z-40 shrink-0 overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } ${sidebarHovered ? "w-64" : "w-64 lg:w-16"}`}
        >
          <div className={`flex h-16 items-center border-b border-slate-200 ${sidebarHovered ? "justify-between px-4" : "justify-between px-4 lg:justify-center lg:px-2"}`}>
            {/* Rail mode shows the mark only: the full wordmark is ~133px wide
                and would spill out of the 64px rail over the page content. */}
            <Logo compact={!sidebarHovered} className={sidebarHovered ? "" : "lg:[&>span:nth-child(2)]:hidden"} />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label={t("s.closeMenu")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1 p-3" aria-label={t("s.account")}>
            {nav.map(({ label: rawLabel, tkey, icon: Icon, to, section, onSelect, badge, active }) => {
              /* One translation point for every account type: the nav arrays
                 keep their English text, the shell renders the chosen language. */
              const label = tkey ? t(tkey as Parameters<typeof t>[0]) : rawLabel;
              const className = `relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition ${
                active
                  ? "bg-brand-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-forest"
              } ${sidebarHovered ? "justify-start" : "justify-start lg:justify-center"}`;

              /* In rail mode only the icon is shown, centred. `labelLong`
                 keeps the label for the expanded state; the tooltip covers
                 the rail state so the icon is never a mystery. */
              const content = (
                <>
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span
                    className={`flex-1 truncate transition-opacity duration-150 ${
                      sidebarHovered ? "opacity-100" : "opacity-100 lg:opacity-0"
                    }`}
                  >
                    {label}
                  </span>
                  {badge != null && badge > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? "bg-white/20 text-white" : "bg-brand-100 text-brand-800"
                      } ${sidebarHovered ? "" : "lg:hidden"}`}
                    >
                      {badge}
                    </span>
                  )}
                  {/* Unread dot shown only in rail mode, so the count is not lost. */}
                  {badge != null && badge > 0 && !sidebarHovered && (
                    <span className="absolute right-2 top-1.5 hidden h-1.5 w-1.5 rounded-full bg-brand-600 lg:block" />
                  )}
                </>
              );

              if (to) {
                return (
                  <Link
                    key={label}
                    to={to}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={className}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={label}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={className}
                  onClick={() => {
                    setSidebarOpen(false);
                    if (section) {
                      document
                        .querySelector(section)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                    onSelect?.();
                  }}
                >
                  {content}
                </button>
              );
            })}

              <Link
                to={settingsTo}
                onClick={() => setSidebarOpen(false)}
                title={t("s.profileSettings")}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-forest ${
                sidebarHovered ? "" : "lg:justify-center"
              }`}
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span
                className={`flex-1 truncate ${sidebarHovered ? "" : "lg:hidden"}`}
              >
                {t("s.profileSettings")}
              </span>
            </Link>
          </nav>

          {helpCard && (
            <div className="px-3 pb-4">
              {sidebarHovered ? (
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5">
                  <p className="flex items-center gap-1.5 text-[13px] font-bold text-brand-800">
                    <Headphones className="h-4 w-4" /> {helpCard.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-brand-700">
                    {helpCard.body}
                  </p>
                  <a
                    href={`tel:${helpCard.phone.replace(/[^0-9]/g, "")}`}
                    className="mt-2.5 block rounded-md bg-white py-1.5 text-center text-xs font-bold text-brand-800 shadow-sm"
                  >
                    {helpCard.phone}
                  </a>
                </div>
              ) : (
                /* Rail mode: just the phone icon, the full card returns on hover. */
                <a
                  href={`tel:${helpCard.phone.replace(/[^0-9]/g, "")}`}
                  title={`${helpCard.title} · ${helpCard.phone}`}
                  aria-label={`${helpCard.title} ${helpCard.phone}`}
                  className="hidden place-items-center rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-brand-700 transition hover:bg-brand-100 lg:grid"
                >
                  <Headphones className="h-[18px] w-[18px]" />
                </a>
              )}
            </div>
          )}
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            aria-label={t("s.closeMenu")}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-forest-dark/40 lg:hidden"
          />
        )}

        {/* ── Main column ── */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-forest lg:hidden"
                aria-label={t("s.openMenu")}
              >
                <Menu className="h-4 w-4" />
              </button>

              {search && search.length > 0 && (
                <div ref={searchRef} className="relative hidden min-w-0 flex-1 sm:block">
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-brand-500 focus-within:bg-white">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSearchOpen(true);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      placeholder={searchPlaceholder ?? t("s.search")}
                      aria-label={t("s.search")}
                      aria-expanded={searchOpen && query.trim().length > 0}
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label={t("s.clearSearch")}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {searchOpen && query.trim() && (
                    <ul className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {results.length === 0 ? (
                        <li className="px-3.5 py-3 text-xs text-slate-500">
                          {tf("s.noMatches", { query: query.trim() })}
                        </li>
                      ) : (
                        results.map((entry) => {
                          const inner = (
                            <>
                              <span className="font-semibold text-forest">{entry.label}</span>
                              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                                {entry.section}
                              </span>
                            </>
                          );
                          return (
                            <li key={entry.label}>
                              {entry.to ? (
                                <Link
                                  to={entry.to}
                                  onClick={() => {
                                    setSearchOpen(false);
                                    setQuery("");
                                  }}
                                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs hover:bg-slate-50"
                                >
                                  {inner}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => goTo(entry)}
                                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs hover:bg-slate-50"
                                >
                                  {inner}
                                </button>
                              )}
                            </li>
                          );
                        })
                      )}
                    </ul>
                  )}
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotifOpen((v) => !v)}
                    className="relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label={`${t("s.notifications")}${unread ? ` (${unread})` : ""}`}
                    aria-expanded={notifOpen}
                  >
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                        <p className="text-xs font-bold text-forest">{t("s.notifications")}</p>
                        <button
                          type="button"
                          onClick={() => setSeen(notifications.map((n) => n.id))}
                          className="text-[11px] font-semibold text-brand-700 hover:underline"
                        >
                          {t("s.markAllRead")}
                        </button>
                      </div>
                      <ul className="max-h-72 overflow-y-auto">
                        {notifications.length === 0 && (
                          <li className="px-3.5 py-6 text-center text-[11px] text-slate-500">
                            {t("s.noAlerts")}
                          </li>
                        )}
                        {notifications.map((n) => {
                          const Icon = n.icon ?? Bell;
                          const row = (
                            <>
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-forest">
                                <Icon className="h-3.5 w-3.5 text-brand-700" />
                                {n.title}
                              </p>
                              <p className="mt-0.5 pl-5 text-[11px] leading-relaxed text-slate-500">
                                {n.body}
                              </p>
                            </>
                          );
                          return (
                            <li
                              key={n.id}
                              className={`border-b border-slate-50 last:border-0 ${seen.includes(n.id) ? "opacity-60" : ""
                                }`}
                            >
                              {n.to ? (
                                <Link
                                  to={n.to}
                                  onClick={() => setNotifOpen(false)}
                                  className="block px-3.5 py-2.5 hover:bg-slate-50"
                                >
                                  {row}
                                </Link>
                              ) : (
                                <div className="px-3.5 py-2.5">{row}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Language — the same control on every account type. */}
                <div className="relative" ref={langRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      setSettingsOpen(false);
                      setLangOpen((v) => !v);
                    }}
                    aria-label={t("s.language")}
                    aria-haspopup="menu"
                    aria-expanded={langOpen}
                    title={t("s.language")}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 text-slate-600 hover:bg-slate-50"
                  >
                    <Languages className="h-4 w-4" />
                    <span className="text-[11px] font-bold uppercase">{lang}</span>
                  </button>
                  {langOpen && (
                    <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl">
                      <LanguagePills onPick={() => setLangOpen(false)} />
                      <Link
                        to="/account/language"
                        onClick={() => setLangOpen(false)}
                        className="mt-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        {t("s.langSettings")}
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Creator mode — same entry point for every account. Points at
                    the public switch rather than the guarded /creator tree, so
                    an account with the mode off can actually turn it on. */}
                <Link
                  to="/creator-mode"
                  className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                  title={t("s.creatorStudio")}
                  aria-label={t("s.creatorStudio")}
                >
                  <Video className="h-4 w-4" />
                </Link>

                <div className="relative" ref={settingsRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      setSearchOpen(false);
                      setSettingsOpen((v) => !v);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label={t("s.settings")}
                    aria-haspopup="menu"
                    aria-expanded={settingsOpen}
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  {settingsOpen && (
                    <div
                      role="menu"
                      aria-label={t("s.accountSettings")}
                      className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                    >
                      <div className="border-b border-slate-100 px-3.5 py-2.5">
                        <p className="truncate text-xs font-bold text-forest">{displayName}</p>
                        <p className="truncate text-[11px] text-slate-500">{t("s.profileSettings")}</p>
                      </div>
                      <Link
                        to={settingsTo}
                        role="menuitem"
                        onClick={() => setSettingsOpen(false)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-forest"
                      >
                        <User className="h-[18px] w-[18px] shrink-0" />
                        {t("s.profile")}
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSettingsOpen(false);
                          onSignOut();
                        }}
                        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3.5 py-2.5 text-left text-[13px] font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <LogOut className="h-[18px] w-[18px] shrink-0" />
                        {t("s.signOut")}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label={t("s.signOut")}
                  title={displayName}
                  className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-forest text-xs font-bold text-white ring-offset-2 hover:ring-2 hover:ring-brand-400"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-9 w-9 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    initials || "CA"
                  )}
                </button>
              </div>
            </div>
          </header>

          <main className="space-y-5 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

/** The green hero banner every account opens with. */
export function ShellHero({
  locationLine,
  greeting,
  subtitle,
  aside,
}: {
  locationLine: string;
  greeting: string;
  subtitle: string;
  /** Right-hand panel — weather for farmer, shop status for retailer … */
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl2 bg-forest px-5 py-6 text-white sm:px-7">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 15%, #4ade80 0, transparent 45%), radial-gradient(circle at 60% 90%, #22c55e 0, transparent 40%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]">
            {locationLine}
          </p>
          <h1 className="mt-3 font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
            {greeting}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/80">{subtitle}</p>
        </div>
        {aside && <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">{aside}</div>}
      </div>
    </section>
  );
}

/** Quick-action tile row — the farmer dashboard's shortcut grid, shared. */
export function ShellQuickActions({
  title,
  actions,
}: {
  title?: string;
  actions: { label: string; icon: LucideIcon; onClick: () => void }[];
}) {
  const { t } = useLang();
  return (
    <section>
      <h2 className="mb-3 font-display text-[15px] font-bold text-forest">
        {title ?? t("r.c.quickActions")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="group rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card"
          >
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="mt-2 block text-xs font-semibold text-forest">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
