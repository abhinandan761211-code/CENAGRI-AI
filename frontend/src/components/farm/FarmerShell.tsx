import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ClipboardList,
  CloudSun,
  Droplets,
  FileText,
  Headphones,
  Home,
  Languages,
  HardHat,
  Layers,
  Leaf,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Play,
  Video,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Tractor,
  User,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { deriveAlerts, getWeather, isWeatherConfigured } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";
import type { LucideIcon } from "lucide-react";
import "@/styles/farmer.css";
import "@/styles/account.css";

/**
 * The one chrome every farmer screen uses.
 *
 * Colour code: the same light palette as the Shop (retailer) account — cream
 * page, white surfaces, slate lines, forest headings, brand-700 green — applied
 * through `acct-root`. The layout (sidebar, header, hover rail, search, bell)
 * is the creator studio's; only the colours differ. The Content Creator studio
 * itself keeps its dark theme.
 */

type NavEntry = {
  label: string;
  icon: LucideIcon;
  /** Own route (or `tel:` link) for a feature page. */
  to?: string;
  /** Dialog for a feature whose page does not exist yet. */
  panel?: string;
};

type NavGroup = {
  /** Section heading; the first group has none. */
  title?: string;
  items: NavEntry[];
};

/**
 * The farmer's full menu, grouped exactly like the dashboard's sidebar.
 * Everything the dashboard offers is listed here as well, so a feature page
 * never has a shorter menu than the dashboard itself.
 *
 * Groups are plain headings with their items always visible — no collapsible
 * dropdown rows — which keeps the whole list readable on every screen.
 */
export const FARMER_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Dashboard", icon: Home, to: "/farmer-account" }],
  },
  {
    title: "Farm Management",
    items: [
      { label: "My Farm", icon: Tractor, to: "/my-farm" },
      { label: "Crop Management", icon: Sprout, to: "/crops" },
      { label: "Crop Calendar", icon: CalendarDays, to: "/calendar" },
      { label: "Weather & Alerts", icon: CloudSun, to: "/weather" },
      { label: "Farm Activities", icon: ClipboardList, to: "/my-farm" },
    ],
  },
  {
    title: "AI & Agriculture",
    items: [
      { label: "AI Crop Advisory", icon: Sprout, to: "/advisory" },
      { label: "Disease Detection", icon: ScanLine, to: "/advisory" },
      { label: "Soil Health", icon: Layers, to: "/my-farm" },
      { label: "Irrigation Management", icon: Droplets, to: "/my-farm" },
    ],
  },
  {
    title: "Market & Business",
    items: [
      { label: "Mandi Prices", icon: TrendingUp, to: "/farmer-account#mandi" },
      { label: "Marketplace", icon: Store, to: "/marketplace" },
      { label: "My Orders & Sales", icon: ClipboardList, to: "/marketplace" },
      { label: "Expenses & Profit", icon: Wallet, panel: "Expenses & Profit" },
    ],
  },
  {
    title: "Farming Services",
    items: [
      { label: "Equipment Rental", icon: Package, to: "/equipment" },
      { label: "Transport Services", icon: Truck, to: "/transport" },
      { label: "Storage & Warehouse", icon: Warehouse, to: "/storage" },
      { label: "Farm Labour", icon: HardHat, panel: "Farm Labour" },
      { label: "Government Schemes", icon: BadgeCheck, panel: "Government Schemes" },
      { label: "Crop Insurance", icon: ShieldCheck, panel: "Crop Insurance" },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "CenFriend", icon: Users, to: "/cenfriend" },
      { label: "Kisan Video Hub", icon: Play, to: "/farmer-account#videos" },
      { label: "Creator Studio", icon: Video, to: "/creator/settings" },
      { label: "Farming Groups", icon: MessageSquare, panel: "Farming Groups" },
      { label: "Messages", icon: MessageSquare, panel: "Messages" },
      { label: "Notifications", icon: Bell, panel: "Notifications" },
    ],
  },
  {
    title: "My Account",
    items: [
      { label: "My Profile", icon: User, panel: "My Profile" },
      { label: "Personal Information", icon: User, to: "/complete-profile?next=/farmer-account" },
      { label: "Farming Information", icon: Tractor, to: "/complete-profile?next=/farmer-account" },
      { label: "My Documents & KYC", icon: FileText, panel: "My Documents & KYC" },
      { label: "Language Settings", icon: Languages, panel: "Language Settings" },
      { label: "Notification Settings", icon: Bell, panel: "Notification Settings" },
      { label: "Privacy & Security", icon: ShieldCheck, panel: "Privacy & Security" },
      { label: "Help & Support", icon: Headphones, to: "tel:1800" },
      { label: "Account Management", icon: Settings, panel: "Account Management" },
    ],
  },
];

/** Searchable destinations, mirrored from the dashboard's search index. */
const FARMER_SEARCH = [
  { label: "AI Crop Advisory", keywords: "advisory ai crop disease pest help", to: "/advisory" },
  { label: "Mandi Prices", keywords: "mandi price rate market commodity", to: "/farmer-account#mandi" },
  { label: "Weather & Alerts", keywords: "weather rain forecast humidity temperature", to: "/weather" },
  { label: "Marketplace", keywords: "market buy sell produce listing", to: "/marketplace" },
  { label: "CenFriend", keywords: "community farmers friends post ask", to: "/cenfriend" },
  { label: "Equipment Rental", keywords: "tractor harvester pump rent equipment", to: "/equipment" },
  { label: "Transport Services", keywords: "truck transport delivery logistics", to: "/transport" },
  { label: "Storage & Warehouse", keywords: "storage godown cold warehouse", to: "/storage" },
  { label: "My Farm", keywords: "farm land acres plot crops soil irrigation", to: "/my-farm" },
  { label: "Kisan Video Hub", keywords: "video tutorial watch learn", to: "/farmer-account#videos" },
];

export function FarmerShell({
  children,
  /** Page title; omitted when the page brings its own hero. */
  title,
  subtitle,
  hero,
  /**
   * Shown when a sidebar entry has no page yet. The dashboard passes the real
   * "what this needs" dialogs; other pages fall back to a short note.
   */
  panelContent,
  /**
   * Replaces the body of the "Notifications" sidebar entry. The dashboard
   * passes the same weather + mandi alerts its bell shows; the default repeats
   * the bell list.
   */
  notificationsPanel,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Optional green hero banner rendered above the page content. */
  hero?: ReactNode;
  panelContent?: (panel: string, close: () => void) => ReactNode;
  notificationsPanel?: (close: () => void) => ReactNode;
}) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * The rail starts EXPANDED so the full feature list is readable without
   * hunting for the hover strip; it collapses to icons only when the pointer
   * leaves the sidebar.
   */
  const [sidebarHovered, setSidebarHovered] = useState(true);
  const sidebarHoverTimer = useRef<number | null>(null);
  /** Sidebar entry whose "not built yet" dialog is open. */
  const [panel, setPanel] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  // Live weather for the header greeting — the same source the dashboard uses.
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const details = profile?.details ?? {};
  const district = details.district;

  useEffect(() => {
    if (!district || !isWeatherConfigured) return;
    let alive = true;
    getWeather(district, details.state, details.village)
      .then((data) => {
        if (alive && data) setWeather(data);
      })
      .catch(() => {
        /* the header simply shows no weather chip */
      });
    return () => {
      alive = false;
    };
  }, [district, details.state, details.village]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      if (sidebarHoverTimer.current) window.clearTimeout(sidebarHoverTimer.current);
    };
  }, []);

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Farmer";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const locationLine =
    [details.village, details.district].filter(Boolean).join(", ") || "Location not set";

  // Weather alerts for the bell, same derivation as the dashboard.
  const notifications = useMemo(
    () =>
      deriveAlerts(weather)
        .slice(0, 4)
        .map((alert) => ({ id: alert.id, title: alert.title, body: alert.body })),
    [weather]
  );
  const unread = notifications.filter((n) => !seen.includes(n.id)).length;

  /**
   * A nav entry is active on its own route, or when its anchor is open. Only
   * ONE entry may be active: entries sharing a route (Advisory / Disease
   * Detection both open /advisory) fall back to an exact label match so two
   * rows never light up together.
   */
  function isActive(entry: NavEntry) {
    if (entry.panel) return panel === entry.panel;
    if (!entry.to || entry.to.startsWith("tel:")) return false;
    const [path, anchor] = entry.to.split("#");
    if (pathname !== path) return false;
    if (anchor) return hash === `#${anchor}`;
    if (hash) return false;

    const siblings = FARMER_NAV_GROUPS.flatMap((group) => group.items).filter(
      (item) => item.to === entry.to
    );
    if (siblings.length > 1) {
      return siblings[0].label === entry.label;
    }
    return true;
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FARMER_SEARCH.filter(
      (entry) => entry.label.toLowerCase().includes(q) || entry.keywords.includes(q)
    );
  }, [query]);

  function handleSidebarEnter() {
    if (sidebarHoverTimer.current) {
      window.clearTimeout(sidebarHoverTimer.current);
      sidebarHoverTimer.current = null;
    }
    setSidebarHovered(true);
  }

  function handleSidebarLeave() {
    sidebarHoverTimer.current = window.setTimeout(() => setSidebarHovered(false), 220);
  }

  function goTo(path: string) {
    setSearchOpen(false);
    setQuery("");
    navigate(path);
  }

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  const railLabel = sidebarHovered ? "" : "lg:hidden";

  return (
    <div className="acct-root min-h-screen bg-cream">
      <div className="flex min-h-screen">
        {/* Edge strip so the cursor finds the collapsed rail easily. */}
        <div
          aria-hidden="true"
          onMouseEnter={handleSidebarEnter}
          className="fixed inset-y-0 left-0 z-30 hidden w-3 lg:block"
        />

        {/* ── Sidebar — the light rail every account uses ── */}
        <aside
          onMouseEnter={handleSidebarEnter}
          onMouseLeave={handleSidebarLeave}
          onFocusCapture={handleSidebarEnter}
          aria-label="Farmer"
          className={`creator-sidebar fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col overflow-hidden border-r transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${sidebarHovered ? "w-64" : "w-64 lg:w-16"}`}
        >
          <div className="farmer-sidebar-head flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
            <Link
              to="/farmer-account"
              title="CenAGRI — Farmer account"
              onClick={() => setSidebarOpen(false)}
              className="flex min-w-0 items-center gap-2"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-sm font-black text-white">
                CA
              </span>
              <span className={`truncate text-sm font-bold text-forest ${railLabel}`}>
                CenAGRI Farm
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* The list scrolls on its own; the logo and helpline stay put. */}
          <nav
            className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2"
            aria-label="Farmer features"
          >
            {FARMER_NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.title ?? "dashboard"}>
                {group.title && (
                  <>
                    {groupIndex > 0 && <div className="farmer-nav-divider" />}
                    <p className={`farmer-nav-title ${railLabel}`}>{group.title}</p>
                  </>
                )}

                {group.items.map(({ label, icon: Icon, to, panel: entryPanel }) => {
                  const active = isActive({ label, icon: Icon, to, panel: entryPanel });
                  const className = `creator-nav-item ${active ? "is-active" : ""} ${
                    sidebarHovered ? "" : "lg:justify-center"
                  }`;

                  const inner = (
                    <>
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className={`flex-1 truncate ${railLabel}`}>{label}</span>
                    </>
                  );

                  // `tel:` entries go straight to the phone dialler.
                  if (to?.startsWith("tel:")) {
                    return (
                      <a
                        key={label}
                        href={to}
                        title={label}
                        onClick={() => setSidebarOpen(false)}
                        className={className}
                      >
                        {inner}
                      </a>
                    );
                  }

                  if (to) {
                    return (
                      <Link
                        key={label}
                        to={to}
                        title={label}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={className}
                      >
                        {inner}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={label}
                      type="button"
                      title={label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        setSidebarOpen(false);
                        setSearchOpen(false);
                        setSettingsOpen(false);
                        if (entryPanel) setPanel(entryPanel);
                      }}
                      className={className}
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="farmer-sidebar-foot shrink-0 border-t border-slate-200 px-3 py-2">
            {sidebarHovered ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-brand-800">
                  <Headphones className="h-3.5 w-3.5" /> Kisan Helpline
                </p>
                <a
                  href="tel:1800"
                  title="Talk to an expert in Bengali, Hindi or English"
                  className="mt-1.5 block rounded-md bg-white py-1 text-center text-[11px] font-bold text-brand-800 shadow-sm"
                >
                  1800-000-000
                </a>
              </div>
            ) : (
              <a
                href="tel:1800"
                title="Kisan Helpline · 1800-000-000"
                aria-label="Kisan Helpline 1800-000-000"
                className="hidden place-items-center rounded-lg border border-brand-200 bg-brand-50 py-2.5 text-brand-700 transition hover:bg-brand-100 lg:grid"
              >
                <Headphones className="h-[18px] w-[18px]" />
              </a>
            )}
          </div>
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-forest-dark/40 lg:hidden"
          />
        )}

        {/* ── Main column ── */}
        <div className="min-w-0 flex-1">
          <header className="creator-header sticky top-0 z-20">
            <div className="flex h-16 min-w-0 flex-nowrap items-center gap-2 px-3 sm:gap-3 sm:px-6">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-forest lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>

                <div ref={searchRef} className="relative hidden min-w-0 flex-1 basis-0 sm:block">
                <div className="creator-search">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Search crops, mandi, schemes…"
                    aria-label="Search farming tools"
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {searchOpen && query.trim() && (
                  <ul className="creator-menu absolute left-0 right-0 top-full z-40 mt-1.5">
                    {results.length === 0 ? (
                      <li className="px-3.5 py-3 text-xs text-slate-500">
                        No matches for “{query.trim()}”.
                      </li>
                    ) : (
                      results.map((entry) => (
                        <li key={entry.label}>
                          <button
                            type="button"
                            onClick={() => goTo(entry.to)}
                            className="block w-full px-3.5 py-2.5 text-left text-xs font-semibold text-forest hover:bg-slate-50"
                          >
                            {entry.label}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                <Link
                  to="/advisory"
                  className="creator-btn-primary hidden h-9 items-center gap-1.5 whitespace-nowrap px-3 text-xs sm:inline-flex sm:px-3.5"
                >
                  <Sprout className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Ask AI</span>
                </Link>

                {weather && (
                  <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 md:inline-flex">
                    <CloudSun className="h-3.5 w-3.5 text-brand-700" />
                    {weather.temp}°C
                  </span>
                )}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotifOpen((v) => !v)}
                    className="creator-icon-btn"
                    aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                    aria-expanded={notifOpen}
                  >
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                      <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                        {unread > 99 ? "99" : unread}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="creator-menu absolute right-0 top-full z-40 mt-2 w-80">
                      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                        <p className="text-xs font-bold text-forest">Notifications</p>
                        <button
                          type="button"
                          onClick={() => setSeen(notifications.map((n) => n.id))}
                          className="text-[11px] font-semibold text-brand-700 hover:underline"
                        >
                          Mark all read
                        </button>
                      </div>
                      <ul className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 && (
                          <li className="px-3.5 py-6 text-center text-[11px] text-slate-500">
                            No alerts right now. Weather warnings appear here.
                          </li>
                        )}
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            className={`border-b border-slate-50 px-3.5 py-2.5 last:border-0 ${
                              seen.includes(n.id) ? "opacity-55" : ""
                            }`}
                          >
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-forest">
                              <CloudSun className="h-3.5 w-3.5 text-brand-700" />
                              {n.title}
                            </p>
                            <p className="mt-0.5 pl-5 text-[11px] leading-relaxed text-slate-500">
                              {n.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Creator mode — same entry point for every account. */}
                <Link
                  to="/creator/settings"
                  className="creator-icon-btn"
                  title="Creator Studio"
                  aria-label="Creator Studio"
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
                    className="creator-icon-btn"
                    aria-label="Settings"
                    aria-haspopup="menu"
                    aria-expanded={settingsOpen}
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  {settingsOpen && (
                    <div role="menu" className="creator-menu absolute right-0 top-full z-40 mt-2 w-60">
                      <div className="border-b border-slate-100 px-3.5 py-3">
                        <p className="truncate text-xs font-bold text-forest">{name}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {profile?.email ?? user?.email}
                        </p>
                      </div>
                      <Link
                        to="/complete-profile?next=/farmer-account"
                        role="menuitem"
                        onClick={() => setSettingsOpen(false)}
                        className="creator-menu-item"
                      >
                        <User className="h-[18px] w-[18px]" />
                        Edit profile
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSettingsOpen(false);
                          setPanel("Privacy & Security");
                        }}
                        className="creator-menu-item"
                      >
                        <ShieldCheck className="h-[18px] w-[18px]" />
                        Privacy &amp; security
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSettingsOpen(false);
                          void handleSignOut();
                        }}
                        className="creator-menu-item border-t border-slate-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <LogOut className="h-[18px] w-[18px]" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>

                <Link
                  to="/complete-profile?next=/farmer-account"
                  aria-label="Open my profile"
                  className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-forest text-xs font-bold text-white ring-offset-2 hover:ring-2 hover:ring-brand-400"
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-9 w-9 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    initials || "CA"
                  )}
                </Link>
              </div>
            </div>
          </header>

          <main className="space-y-5 p-4 sm:p-6">
            {(title || subtitle) && (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
                    {title ?? "Welcome back"}
                  </h1>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <Leaf className="h-3 w-3 text-brand-700" />
                    {subtitle ?? locationLine}
                  </p>
                </div>
              </div>
            )}

            {hero}

            {children}
          </main>
        </div>
      </div>

      {panel && (
        <PanelDialog title={panel} onClose={() => setPanel(null)}>
          {panel === "Notifications" && notificationsPanel
            ? notificationsPanel(() => setPanel(null))
            : panelContent?.(panel, () => setPanel(null)) ?? (
                <SidebarPanelNote onClose={() => setPanel(null)} />
              )}
        </PanelDialog>
      )}
    </div>
  );
}

/** Dialog used by the sidebar entries that have no page yet. */
function PanelDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="creator-card relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <h2 className="text-base font-bold text-forest">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-forest"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Fallback body for a sidebar dialog: it names the screen that already holds
 * that feature today instead of showing an empty box.
 */
function SidebarPanelNote({ onClose }: { onClose: () => void }) {
  return (
    <>
      <p className="text-sm leading-relaxed text-slate-600">
        This feature opens from the farmer account. Go there to use it with your farm
        profile selected.
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="creator-btn-ghost h-9 px-4 text-xs">
          Close
        </button>
        <Link to="/farmer-account" className="creator-btn-primary h-9 px-4 text-xs">
          Go to dashboard
        </Link>
      </div>
    </>
  );
}

/** Hero banner shared by the farmer feature pages. */
export function FarmerHero({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <section className="creator-card relative overflow-hidden rounded-xl2 bg-forest px-5 py-6 text-white sm:px-7">
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
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
            {title}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/80">{description}</p>
        </div>
        {aside && <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">{aside}</div>}
      </div>
    </section>
  );
}

/** Stat tile used in the feature-page summary rows. */
export function FarmerStat({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <div className="creator-card p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-400 sm:text-[11px]">
          {label}
        </p>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#16C784]/10 text-[#16C784] sm:h-8 sm:w-8">
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
      </div>
      <p className="mt-1.5 truncate text-lg font-extrabold tracking-tight text-white sm:mt-2 sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-slate-400 sm:text-[11px]">{hint}</p>}
    </div>
  );
}

export { MessageSquare };

/** Summary row of 2–4 tiles, the dashboard's stat pattern for feature pages. */
export function FarmerStats({
  items,
}: {
  items: { label: string; value: ReactNode; icon: LucideIcon; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      {items.map(({ label, value, icon, hint }) => (
        <FarmerStat key={label} label={label} value={value} icon={icon} hint={hint} />
      ))}
    </div>
  );
}

/**
 * A dashboard-style card section: title row with an optional action, then
 * content. Feature pages use this instead of hand-rolled boxes so their
 * spacing and headings match the dashboard exactly.
 */
export function FarmerSection({
  title,
  description,
  icon: Icon,
  action,
  id,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  /** Anchor target, so other pages can deep-link to this section. */
  id?: string;
  /** Extra classes — e.g. `order-*` for responsive stacking. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`creator-card scroll-mt-20 overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            {Icon && <Icon className="h-4 w-4 text-[#16C784]" />}
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
