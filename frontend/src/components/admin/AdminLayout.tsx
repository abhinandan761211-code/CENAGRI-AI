import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  Cloud,
  Compass,
  Database,
  ExternalLink,
  FileText,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  PanelLeftClose,
  ScrollText,
  Search,
  Settings,
  Shield,
  Store,
  ShoppingBag,
  UserCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAdmin } from "@/components/admin/AdminProvider";
import { useAuth } from "@/hooks/useAuth";
import { Badge, FOREST, PRIMARY } from "@/components/admin/ui";
import { KalikaMark } from "@/components/Logo";

/**
 * Chrome for every `/admin` screen: collapsible rail, sticky top bar with
 * global search, notification center, profile menu and breadcrumbs.
 *
 * The rail renders every module but *dims* the ones the signed-in admin has no
 * permission for, and hides them entirely when `can()` says no. That is a
 * clarity decision, not a security one: the backend refuses the request either
 * way (see `app/core/security.py`).
 */

export type AdminNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: string;
  /** Extra permissions that also unlock the entry (OR). */
  also?: string[];
  badge?: "kyc" | "reports" | "tickets";
};

export const ADMIN_NAV: { group: string; items: AdminNavItem[] }[] = [
  {
    group: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    group: "People",
    items: [
      { to: "/admin/users", label: "User Management", icon: Users, permission: "users.view" },
      { to: "/admin/roles", label: "Roles & Permissions", icon: Shield, permission: "roles.view" },
      { to: "/admin/kyc", label: "KYC & Verification", icon: UserCheck, permission: "kyc.view", badge: "kyc" },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/admin/content", label: "Content Management", icon: FileText, permission: "content.view" },
      { to: "/admin/video-hub", label: "Kisan Video Hub", icon: Video, permission: "hubs.view", also: ["content.view"] },
      { to: "/admin/creators", label: "Creator Management", icon: Compass, permission: "content.view" },
    ],
  },
  {
    group: "Business",
    items: [
      { to: "/admin/marketplace", label: "Marketplace", icon: Store, permission: "marketplace.view" },
      { to: "/admin/cenfriend", label: "CenFriend", icon: Users, permission: "cenfriend.view" },
      { to: "/admin/orders", label: "Orders & Transactions", icon: ShoppingBag, permission: "orders.view" },
    ],
  },
  {
    group: "Data & AI",
    items: [
      { to: "/admin/agri-data", label: "Mandi Data", icon: Database, permission: "agri_data.view" },
      { to: "/admin/weather", label: "Weather Management", icon: Cloud, permission: "agri_data.view" },
      { to: "/admin/ai-services", label: "AI Services", icon: Bot, permission: "ai.view" },
      { to: "/admin/analytics", label: "Analytics & Reports", icon: BarChart3, permission: "analytics.view" },
    ],
  },
  {
    group: "Operations",
    items: [
      { to: "/admin/support", label: "Support & Complaints", icon: Headphones, permission: "support.view", badge: "tickets" },
      { to: "/admin/notifications", label: "Notifications", icon: Megaphone, permission: "notifications.view", also: ["notifications.manage"] },
      { to: "/admin/cms", label: "CMS Management", icon: BookOpen, permission: "cms.view" },
    ],
  },
  {
    group: "System",
    items: [
      { to: "/admin/settings", label: "Platform Settings", icon: Settings, permission: "settings.view" },
      { to: "/admin/security", label: "Security & Audit", icon: ScrollText, permission: "security.audit" },
      { to: "/admin/health", label: "System Health", icon: Activity, permission: "system.health" },
    ],
  },
];

const BREADCRUMBS: Record<string, string> = Object.fromEntries(
  ADMIN_NAV.flatMap((group) => group.items.map((item) => [item.to, item.label]))
);

export default function AdminLayout({
  children,
  title,
  subtitle,
  action,
  badges,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Counts for the notification center / sidebar pills. */
  badges?: { kyc?: number | null; reports?: number | null; tickets?: number | null };
}) {
  const { me, can } = useAdmin();
  const { signOut, profile, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  /**
   * Desktop rail. Same behaviour as the account dashboards (AccountShell): a
   * narrow icon rail that expands on hover/focus, with the click toggle kept as
   * a manual override for keyboard and touch users.
   */
  const [collapsed, setCollapsed] = useState(false);
  /** The cursor is on the rail or inside the sidebar — opens it temporarily. */
  const [railHovered, setRailHovered] = useState(false);
  /**
   * Pinned open by the "Collapse" button, and the cursor has since left.
   *
   * Without this latch the rail springs straight back open after a manual
   * collapse: clicking the button leaves the cursor ON the sidebar, so the
   * delayed `setRailHovered(false)` is immediately followed by another
   * `mouseenter`. `collapsed` was true, `railHovered` became true again, and
   * `expanded` (below) came out true — the click looked like it did nothing.
   */
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Drop the pending hover timer on unmount.
  useEffect(() => {
    return () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  function handleRailEnter() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setRailHovered(true);
  }

  function handleRailLeave() {
    // Short delay so a jittery cursor does not slam the rail shut.
    hoverTimer.current = window.setTimeout(() => {
      setRailHovered(false);
      // The cursor has genuinely left, so a manual collapse may take effect
      // again on the next hover.
      setManuallyCollapsed(false);
    }, 220);
  }

  /**
   * Narrow the rail.
   *
   * `collapsed` is set (what the button's aria-pressed reports) and the expand
   * is blocked until the pointer leaves or the button is pressed again —
   * pressing it while the cursor still rests on the sidebar is the only way to
   * re-open without moving away.
   */
  function collapseRail() {
    setCollapsed(true);
    setManuallyCollapsed(true);
    setRailHovered(false);
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function expandRailNow() {
    setCollapsed(false);
    setManuallyCollapsed(false);
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Global search: modules only. It looks for a screen, never for user data —
  // a global "search everyone" box would widen what a support role can see.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = ADMIN_NAV.flatMap((g) => g.items);
    if (!q) return items.slice(0, 8);
    return items.filter((item) => item.label.toLowerCase().includes(q) || item.to.includes(q)).slice(0, 8);
  }, [query]);

  const displayName = profile?.full_name ?? me?.email ?? user?.email ?? "Administrator";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const notifications = [
    badges?.kyc ? `KYC requests waiting: ${badges.kyc}` : null,
    badges?.reports ? `Pending content reports: ${badges.reports}` : null,
    badges?.tickets ? `Open support tickets: ${badges.tickets}` : null,
  ].filter((v): v is string => Boolean(v));

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  const visibleGroups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      can([item.permission, ...(item.also ?? [])])
    ),
  })).filter((group) => group.items.length > 0);

  // Expanded = manually opened, OR hovered — unless the user just collapsed it
  // and has not moved the cursor away yet. `railHidden` hides labels whenever the
  // rail is narrow, so a hover always brings them back without a click.
  const expanded = !collapsed || (railHovered && !manuallyCollapsed);
  const railHidden = expanded ? "" : "lg:hidden";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#172033]">
      {/* Edge strip: the rail is only 64px wide, so this gives the cursor an
          easy target at the very edge of the screen. Moving the mouse here
          opens the sidebar; moving it away closes it again — no click needed.
          Same affordance as the account dashboards (AccountShell). */}
      <div
        aria-hidden="true"
        onMouseEnter={handleRailEnter}
        className="fixed inset-y-0 left-0 z-30 hidden w-3 lg:block"
      />

      {/* ── Sidebar ── */}
      <aside
        aria-label="Admin navigation"
        onMouseEnter={handleRailEnter}
        onMouseLeave={handleRailLeave}
        onFocusCapture={handleRailEnter}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-x-hidden border-r border-slate-200 bg-white transition-[transform,width] duration-200 ease-out lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          } ${expanded ? "lg:w-64" : "lg:w-16"}`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-slate-100 ${expanded ? "justify-between px-4" : "lg:justify-center lg:px-0"}`}>
          <Link to="/admin" className="flex min-w-0 items-center gap-2" aria-label="Kalika admin home" title="Kalika admin">
            {/* The mark always renders. The wordmark is hidden in rail mode so it
                cannot clip inside the 64px rail. */}
            <KalikaMark size={36} />
            <span className={`font-display text-[15px] font-extrabold tracking-tight ${railHidden}`} style={{ color: FOREST }}>
              Kalika
            </span>
            <span className={`truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 ${railHidden}`}>
              Admin
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
          {visibleGroups.map((group) => (
            <div key={group.group} className="mb-3">
              <p className={`px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${railHidden}`}>
                {group.group}
              </p>
              {/* Rail mode keeps a hairline so groups stay legible as blocks. */}
              <div className={`mx-2 mb-1 hidden border-t border-slate-100 lg:block ${expanded ? "lg:hidden" : ""}`} />
              <ul className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, badge }) => {
                  const active = pathname === to || (to !== "/admin" && pathname.startsWith(`${to}/`));
                  const count = badge ? badges?.[badge] : null;
                  return (
                    <li key={to}>
                      <Link
                        to={to}
                        title={label}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition ${active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          } ${expanded ? "" : "lg:justify-center lg:px-2"}`}
                      >
                        <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-emerald-700" : "text-slate-400"}`} />
                        <span className={`flex-1 truncate ${railHidden}`}>{label}</span>
                        {count ? (
                          <span className={`rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700 ${railHidden}`}>
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                        {/* Rail mode: badges collapse to a dot so the count is not lost. */}
                        {count ? (
                          <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 lg:hidden ${expanded ? "lg:hidden" : "lg:block"}`} />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-2">
          <button
            type="button"
            onClick={() => (collapsed ? expandRailNow() : collapseRail())}
            className="hidden w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            <span className={railHidden}>Collapse</span>
          </button>
          <Link
            to="/"
            title="Back to Kalika"
            className={`mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 ${expanded ? "" : "lg:justify-center lg:px-2"}`}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className={railHidden}>Back to Kalika</span>
          </Link>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      )}

      {/* ── Main column ── */}
      <div className={`transition-[padding] duration-200 ${expanded ? "lg:pl-64" : "lg:pl-16"}`}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div ref={searchRef} className="relative w-full max-w-md">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Search admin modules…"
                  aria-label="Search admin modules"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
                {query && (
                  <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-slate-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {searchOpen && (
                <ul className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  {results.length === 0 && <li className="px-3 py-4 text-center text-[11px] text-slate-500">No module matches.</li>}
                  {results.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          onClick={() => {
                            setSearchOpen(false);
                            setQuery("");
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Icon className="h-3.5 w-3.5 text-slate-400" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-label="Notifications"
                  aria-expanded={notifOpen}
                  className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Bell className="h-4 w-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
                      {notifications.length}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-3.5 py-2.5">
                      <p className="text-xs font-bold" style={{ color: FOREST }}>Needs attention</p>
                    </div>
                    <ul>
                      {notifications.length === 0 && (
                        <li className="px-3.5 py-6 text-center text-[11px] text-slate-500">Nothing queued right now.</li>
                      )}
                      {badges?.kyc ? (
                        <NotificationRow to="/admin/kyc" icon={UserCheck} text={`${badges.kyc} KYC requests waiting`} onClick={() => setNotifOpen(false)} />
                      ) : null}
                      {badges?.reports ? (
                        <NotificationRow to="/admin/content" icon={AlertTriangle} text={`${badges.reports} content reports pending`} onClick={() => setNotifOpen(false)} />
                      ) : null}
                      {badges?.tickets ? (
                        <NotificationRow to="/admin/support" icon={Headphones} text={`${badges.tickets} open support tickets`} onClick={() => setNotifOpen(false)} />
                      ) : null}
                    </ul>
                  </div>
                )}
              </div>

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  aria-label="Admin profile"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 py-1 pl-1 pr-2.5 hover:bg-slate-50"
                >
                  <span
                    className="grid h-7 w-7 place-items-center rounded-md text-[11px] font-bold text-white"
                    style={{ backgroundColor: FOREST }}
                  >
                    {initials || "AD"}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[140px] truncate text-[11.5px] font-semibold text-slate-800">{displayName}</span>
                    <span className="block text-[10px] text-slate-500">{me?.role_label ?? "Admin"}</span>
                  </span>
                </button>
                {profileOpen && (
                  <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-3.5 py-3">
                      <p className="truncate text-xs font-bold" style={{ color: FOREST }}>{displayName}</p>
                      <p className="truncate text-[11px] text-slate-500">{me?.email}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge tone="green">{me?.role_label}</Badge>
                        <Badge tone={me?.mfa === "aal2" ? "green" : "amber"}>{me?.mfa === "aal2" ? "MFA on" : "MFA off"}</Badge>
                      </div>
                    </div>
                    <Link
                      to="/admin/security"
                      role="menuitem"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ScrollText className="h-4 w-4 text-slate-400" />
                      My admin activity
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleSignOut()}
                      className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3.5 py-2.5 text-left text-[12.5px] font-medium text-rose-600 hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Breadcrumbs ── */}
          <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-1.5 text-[11px] text-slate-500 sm:px-6">
            <Link to="/admin" className="hover:text-slate-800">Admin</Link>
            {pathname !== "/admin" && (
              <>
                <span aria-hidden="true">/</span>
                <span className="font-semibold text-slate-700">{BREADCRUMBS[pathname] ?? "Module"}</span>
              </>
            )}
          </div>
        </header>

        <main className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl" style={{ color: FOREST }}>
                {title}
              </h1>
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
            {action}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function NotificationRow({
  to,
  icon: Icon,
  text,
  onClick,
}: {
  to: string;
  icon: LucideIcon;
  text: string;
  onClick: () => void;
}) {
  return (
    <li className="border-b border-slate-50 last:border-0">
      <Link to={to} onClick={onClick} className="flex items-center gap-2 px-3.5 py-2.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50">
        <Icon className="h-3.5 w-3.5 text-emerald-700" />
        {text}
      </Link>
    </li>
  );
}

/** A guarded shell section: what an admin sees when their role lacks a module. */
export function NoAccess({ module }: { module: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500">
        <PanelLeftClose className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold" style={{ color: FOREST }}>
        Your role cannot open {module}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
        Ask a Super Admin to review your admin role. The API refuses this module for your
        role regardless of what the browser shows.
      </p>
      <span className="mt-3 inline-block text-[10px] font-bold uppercase tracking-wide" style={{ color: PRIMARY }}>
        least-privilege access
      </span>
    </div>
  );
}
