import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  CloudSun,
  Headphones,
  Home,
  Leaf,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Play,
  Search,
  Settings,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Tractor,
  User,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { deriveAlerts, getWeather, isWeatherConfigured } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";
import type { LucideIcon } from "lucide-react";

/**
 * Shared chrome for every FARMER feature page.
 *
 * The farmer dashboard has this sidebar, header and hover-to-open rail built
 * in. Feature pages (Advisory, Mandi, Marketplace …) used a minimal back-link
 * shell, which made them feel like a different product. This component lifts
 * the dashboard chrome into one place so every farmer screen looks and
 * behaves identically, and the sidebar is the same on all of them.
 *
 * Nothing role-specific is here beyond the farmer's own nav list; the role
 * dashboards for buyer/retailer use `AccountShell` instead.
 */

type NavEntry = {
  label: string;
  icon: LucideIcon;
  to: string;
};

/** The farmer's feature destinations, in dashboard order. */
export const FARMER_NAV: NavEntry[] = [
  { label: "Dashboard", icon: Home, to: "/farmer-account" },
  { label: "My Farm", icon: Tractor, to: "/my-farm" },
  { label: "AI Crop Advisory", icon: Sprout, to: "/advisory" },
  { label: "Mandi Prices", icon: TrendingUp, to: "/farmer-account#mandi" },
  { label: "Weather & Alerts", icon: CloudSun, to: "/weather" },
  { label: "Marketplace", icon: Store, to: "/marketplace" },
  { label: "CenFriend", icon: Users, to: "/cenfriend" },
  { label: "Equipment Rental", icon: Package, to: "/equipment" },
  { label: "Kisan Video Hub", icon: Play, to: "/farmer-account#videos" },
  { label: "Transport Services", icon: Truck, to: "/transport" },
  { label: "Storage & Warehouse", icon: Warehouse, to: "/storage" },
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
  /** Page title; the dashboard passes undefined to keep its own hero. */
  title,
  subtitle,
  hero,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Optional green hero banner rendered above the page content. */
  hero?: ReactNode;
}) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarHoverTimer = useRef<number | null>(null);

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

  /** A nav entry is active on its own route, or when its anchor is open. */
  function isActive(entry: NavEntry) {
    const [path, anchor] = entry.to.split("#");
    if (anchor) return pathname === path && hash === `#${anchor}`;
    if (entry.label === "Dashboard") return pathname === "/farmer-account" && !hash;
    return pathname === path;
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
    <div className="min-h-screen bg-cream">
      <div className="flex">
        {/* Edge strip so the cursor finds the rail easily. */}
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
          aria-label="Farmer"
          className={`fixed inset-y-0 left-0 z-40 shrink-0 overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${sidebarHovered ? "w-64" : "w-64 lg:w-16"}`}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            {sidebarHovered ? <Logo /> : <Logo compact />}
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1 p-3" aria-label="Farmer features">
            {FARMER_NAV.map(({ label, icon: Icon, to }) => {
              const active = isActive({ label, icon: Icon, to });
              const className = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition ${
                active
                  ? "bg-brand-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-forest"
              } ${sidebarHovered ? "" : "lg:justify-center"}`;

              return (
                <Link
                  key={label}
                  to={to}
                  title={label}
                  onClick={() => setSidebarOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className={`truncate ${railLabel}`}>{label}</span>
                </Link>
              );
            })}

            <Link
              to="/complete-profile?next=/farmer-account"
              title="Profile & Settings"
              onClick={() => setSidebarOpen(false)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-forest ${
                sidebarHovered ? "" : "lg:justify-center"
              }`}
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span className={`flex-1 truncate ${railLabel}`}>Profile &amp; Settings</span>
            </Link>
          </nav>

          <div className="px-3 pb-4">
            {sidebarHovered ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-brand-800">
                  <Headphones className="h-4 w-4" /> Kisan Helpline
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-brand-700">
                  Talk to an expert in Bengali, Hindi or English.
                </p>
                <a
                  href="tel:1800"
                  className="mt-2.5 block rounded-md bg-white py-1.5 text-center text-xs font-bold text-brand-800 shadow-sm"
                >
                  1800-000-000
                </a>
              </div>
            ) : (
              <a
                href="tel:1800"
                title="Kisan Helpline · 1800-000-000"
                aria-label="Kisan Helpline 1800-000-000"
                className="hidden place-items-center rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-brand-700 transition hover:bg-brand-100 lg:grid"
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
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-forest lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>

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
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
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
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs hover:bg-slate-50"
                          >
                            <span className="font-semibold text-forest">{entry.label}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {weather && (
                  <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 md:inline-flex">
                    <CloudSun className="h-3.5 w-3.5 text-amber-500" />
                    {weather.temp}°C
                  </span>
                )}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotifOpen((v) => !v)}
                    className="relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
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
                        <p className="text-xs font-bold text-forest">Notifications</p>
                        <button
                          type="button"
                          onClick={() => setSeen(notifications.map((n) => n.id))}
                          className="text-[11px] font-semibold text-brand-700 hover:underline"
                        >
                          Mark all read
                        </button>
                      </div>
                      <ul className="max-h-72 overflow-y-auto">
                        {notifications.length === 0 && (
                          <li className="px-3.5 py-6 text-center text-[11px] text-slate-500">
                            No alerts right now. Weather warnings appear here.
                          </li>
                        )}
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            className={`border-b border-slate-50 px-3.5 py-2.5 last:border-0 ${
                              seen.includes(n.id) ? "opacity-60" : ""
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

                <div className="relative" ref={settingsRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      setSearchOpen(false);
                      setSettingsOpen((v) => !v);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label="Settings"
                    aria-haspopup="menu"
                    aria-expanded={settingsOpen}
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  {settingsOpen && (
                    <div
                      role="menu"
                      aria-label="Account settings"
                      className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                    >
                      <div className="border-b border-slate-100 px-3.5 py-2.5">
                        <p className="truncate text-xs font-bold text-forest">{name}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {profile?.email ?? user?.email}
                        </p>
                      </div>
                      <Link
                        to="/complete-profile?next=/farmer-account"
                        role="menuitem"
                        onClick={() => setSettingsOpen(false)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-forest"
                      >
                        <User className="h-[18px] w-[18px] shrink-0" />
                        Edit profile
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSettingsOpen(false);
                          void handleSignOut();
                        }}
                        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3.5 py-2.5 text-left text-[13px] font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <LogOut className="h-[18px] w-[18px] shrink-0" />
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
            {hero}

            {(title || subtitle) && (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
                    {title}
                  </h1>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <Leaf className="h-3 w-3" />
                    {subtitle ?? locationLine}
                  </p>
                </div>
              </div>
            )}

            {children}
          </main>
        </div>
      </div>
    </div>
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
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1.5 font-display text-xl font-extrabold text-forest">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-forest">
            {Icon && <Icon className="h-4 w-4 text-brand-700" />}
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
