import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Clapperboard,
  Coins,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Radio,
  Search,
  Settings,
  Upload,
  User,
  Users,
  Video,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  compactCount,
  listCreatorNotifications,
} from "@/lib/creator";
import type { CreatorNotification, CreatorProfile } from "@/lib/creator";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";

/**
 * Dark, YouTube-inspired chrome for the Content Creator module.
 *
 * Deliberately a separate palette from the farmer/retailer dashboards: this
 * module is a media platform, and the brief asks for deep navy + green/teal.
 * Every colour comes from the CSS variables in `creator.css` so the theme can
 * be tuned in one place.
 */

export const CREATOR_BASE = "/creator";

export type CreatorNavKey =
  | "home"
  | "channel"
  | "upload"
  | "shorts"
  | "live"
  | "analytics"
  | "monetization"
  | "comments"
  | "messages"
  | "notifications"
  | "settings"
  | "help";

export const CREATOR_ROUTES: Record<CreatorNavKey, string> = {
  home: CREATOR_BASE,
  channel: `${CREATOR_BASE}/channel`,
  upload: `${CREATOR_BASE}/upload`,
  shorts: `${CREATOR_BASE}/shorts`,
  live: `${CREATOR_BASE}/live`,
  analytics: `${CREATOR_BASE}/analytics`,
  monetization: `${CREATOR_BASE}/monetization`,
  comments: `${CREATOR_BASE}/comments`,
  messages: `${CREATOR_BASE}/messages`,
  notifications: `${CREATOR_BASE}/notifications`,
  settings: `${CREATOR_BASE}/settings`,
  help: `${CREATOR_BASE}/help`,
};

/** Public (non-creator) destinations that also live in this module. */
export const HUB_ROUTE = "/video-hub";
export const WATCH_ROUTE = "/watch";

const NAV: { key: CreatorNavKey; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "channel", label: "My Channel", icon: User },
  { key: "upload", label: "Upload Video", icon: Upload },
  { key: "shorts", label: "Shorts", icon: Clapperboard },
  { key: "live", label: "Live Streaming", icon: Radio },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "monetization", label: "Monetization", icon: Coins },
  { key: "comments", label: "Comments", icon: MessageSquare },
  { key: "messages", label: "Messages", icon: Users },
  { key: "notifications", label: "Notifications", icon: Bell },
];

const NOTIF_ICON: Record<CreatorNotification["kind"], LucideIcon> = {
  subscriber: Users,
  comment: MessageSquare,
  reply: MessageSquare,
  published: Video,
  processing: Video,
  moderation: Radio,
  system: Bell,
};

export type ShellSearch = { label: string; keywords: string; to: string };

export default function CreatorShell({
  title,
  subtitle,
  action,
  onSearch,
  searchEntries,
  searchPlaceholder = "Search your videos…",
  children,
}: {
  title?: string;
  subtitle?: string;
  /** Right-hand header button. */
  action?: ReactNode;
  /**
   * When given, the header search box calls this instead of filtering a local
   * index — the Video Hub uses it to drive a server query.
   */
  onSearch?: (query: string) => void;
  /** Local search index used by the creator-side pages. */
  searchEntries?: ShellSearch[];
  searchPlaceholder?: string;
  children: ReactNode;
}) {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<number | null>(null);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<CreatorNotification[]>([]);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const { channel, canCreate } = useCreatorChannel();
  const role = profile?.role;

  // Same role gate as the other dashboards; a farmer can *watch* videos but
  // only a Content Creator reaches the studio pages.
  const isCreator = role === "Content Creator" || Boolean(channel);

  useEffect(() => {
    if (!user || !isCreator) return;
    let alive = true;
    listCreatorNotifications()
      .then((rows) => {
        if (alive) setNotifications(rows);
      })
      .catch(() => {
        /* a missing table must not break navigation */
      });
    return () => {
      alive = false;
    };
  }, [user, isCreator, pathname]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  const displayName = channel?.channel_name ?? profile?.full_name ?? user?.email?.split("@")[0] ?? "Creator";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const unread = notifications.filter((n) => !n.read_at && !seen.includes(n.id)).length;

  const activeKey: CreatorNavKey | null =
    (Object.entries(CREATOR_ROUTES).find(([, path]) => path === pathname)?.[0] as
      | CreatorNavKey
      | undefined) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchEntries) return [];
    return searchEntries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.keywords.toLowerCase().includes(q)
    );
  }, [query, searchEntries]);

  function enter() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHovered(true);
  }

  function leave() {
    hoverTimer.current = window.setTimeout(() => setHovered(false), 220);
  }

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  const railLabel = hovered ? "" : "lg:hidden";

  return (
    <div className="creator-root">
      <div className="flex min-h-screen">
        {/* Edge strip so the collapsed rail is easy to hit. */}
        <div
          aria-hidden="true"
          onMouseEnter={enter}
          className="fixed inset-y-0 left-0 z-30 hidden w-3 lg:block"
        />

        {/* ── Sidebar ── */}
        <aside
          onMouseEnter={enter}
          onMouseLeave={leave}
          onFocusCapture={enter}
          aria-label="Creator studio"
          className={`creator-sidebar fixed inset-y-0 left-0 z-40 shrink-0 overflow-y-auto overflow-x-hidden border-r transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${hovered ? "w-64" : "w-64 lg:w-16"}`}
        >
          <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-3">
            <Link
              to={HUB_ROUTE}
              className="flex min-w-0 items-center gap-2"
              title="Kisan Video Hub"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#16C784] text-sm font-black text-[#0B1020]">
                CA
              </span>
              <span className={`truncate text-sm font-bold text-white ${railLabel}`}>
                Kisan Video
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1 p-2" aria-label="Creator">
            {NAV.map(({ key, label, icon: Icon }) => {
              const active = key === activeKey;
              const locked = key === "live" || key === "monetization";
              return (
                <Link
                  key={key}
                  to={CREATOR_ROUTES[key]}
                  title={label}
                  onClick={() => setSidebarOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`creator-nav-item ${active ? "is-active" : ""} ${
                    hovered ? "" : "lg:justify-center"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className={`flex-1 truncate ${railLabel}`}>{label}</span>
                  {locked && hovered && (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-300">
                      soon
                    </span>
                  )}
                </Link>
              );
            })}

            <div className="my-2 border-t border-white/10" />

            <Link
              to={CREATOR_ROUTES.settings}
              title="Settings"
              onClick={() => setSidebarOpen(false)}
              className={`creator-nav-item ${hovered ? "" : "lg:justify-center"}`}
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span className={`flex-1 truncate ${railLabel}`}>Settings</span>
            </Link>

            <Link
              to={CREATOR_ROUTES.help}
              title="Help & Support"
              onClick={() => setSidebarOpen(false)}
              className={`creator-nav-item ${hovered ? "" : "lg:justify-center"}`}
            >
              <HelpCircle className="h-[18px] w-[18px] shrink-0" />
              <span className={`flex-1 truncate ${railLabel}`}>Help &amp; Support</span>
            </Link>

            <div className="my-2 border-t border-white/10" />

            <Link
              to={HUB_ROUTE}
              title="Kisan Video Hub"
              onClick={() => setSidebarOpen(false)}
              className={`creator-nav-item ${hovered ? "" : "lg:justify-center"}`}
            >
              <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
              <span className={`flex-1 truncate ${railLabel}`}>Kisan Video Hub</span>
            </Link>
          </nav>

          {hovered && channel && (
            <div className="px-3 pb-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="truncate text-[12px] font-bold text-white">{channel.channel_name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {compactCount(channel.subscriber_count)} subscribers
                </p>
                <p className="text-[11px] text-slate-400">
                  {compactCount(channel.total_views)} lifetime views
                </p>
              </div>
            </div>
          )}
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          />
        )}

        {/* ── Main column ── */}
        <div className="min-w-0 flex-1">
          <header className="creator-header sticky top-0 z-20">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-slate-300 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>

              {(onSearch || (searchEntries && searchEntries.length > 0)) && (
                <div ref={searchRef} className="relative hidden min-w-0 flex-1 sm:block">
                  <div className="creator-search">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSearchOpen(true);
                        if (onSearch) onSearch(e.target.value);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && onSearch) {
                          setSearchOpen(false);
                          onSearch(query);
                        }
                      }}
                      placeholder={searchPlaceholder}
                      aria-label="Search"
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          if (onSearch) onSearch("");
                        }}
                        aria-label="Clear search"
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {searchOpen && !onSearch && query.trim() && results.length > 0 && (
                    <ul className="creator-menu absolute left-0 right-0 top-full z-40 mt-1.5">
                      {results.map((entry) => (
                        <li key={entry.to}>
                          <Link
                            to={entry.to}
                            onClick={() => {
                              setSearchOpen(false);
                              setQuery("");
                            }}
                            className="block px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {entry.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                {canCreate && (
                  <Link
                    to={CREATOR_ROUTES.upload}
                    className="creator-btn-primary hidden h-9 items-center gap-1.5 px-3.5 text-xs sm:inline-flex"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Create
                  </Link>
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
                      <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#16C784] px-1 text-[9px] font-bold text-[#0B1020]">
                        {unread > 99 ? "99" : unread}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="creator-menu absolute right-0 top-full z-40 mt-2 w-80">
                      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
                        <p className="text-xs font-bold text-white">Notifications</p>
                        <button
                          type="button"
                          onClick={() => setSeen(notifications.map((n) => n.id))}
                          className="text-[11px] font-semibold text-[#16C784] hover:underline"
                        >
                          Mark all read
                        </button>
                      </div>
                      <ul className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 && (
                          <li className="px-3.5 py-6 text-center text-[11px] text-slate-400">
                            No notifications yet.
                          </li>
                        )}
                        {notifications.slice(0, 8).map((n) => {
                          const Icon = NOTIF_ICON[n.kind] ?? Bell;
                          const read = Boolean(n.read_at) || seen.includes(n.id);
                          return (
                            <li key={n.id} className={`border-b border-white/5 last:border-0 ${read ? "opacity-55" : ""}`}>
                              <Link
                                to={n.link ?? CREATOR_ROUTES.notifications}
                                onClick={() => {
                                  setNotifOpen(false);
                                  setSeen((s) => [...s, n.id]);
                                }}
                                className="block px-3.5 py-2.5 hover:bg-white/5"
                              >
                                <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                                  <Icon className="h-3.5 w-3.5 text-[#16C784]" />
                                  {n.title}
                                </p>
                                {n.body && (
                                  <p className="mt-0.5 pl-5 text-[11px] leading-relaxed text-slate-400">
                                    {n.body}
                                  </p>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                      <Link
                        to={CREATOR_ROUTES.notifications}
                        onClick={() => setNotifOpen(false)}
                        className="block border-t border-white/10 px-3.5 py-2 text-center text-[11px] font-semibold text-[#16C784]"
                      >
                        View all
                      </Link>
                    </div>
                  )}
                </div>

                <div className="relative" ref={profileRef}>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((v) => !v)}
                    className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#16C784] text-xs font-bold text-[#0B1020] ring-offset-2 ring-offset-[#10182A] hover:ring-2 hover:ring-[#16C784]"
                    aria-label="Creator profile"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                  >
                    {channel?.avatar_url ? (
                      <img src={channel.avatar_url} alt="" className="h-9 w-9 object-cover" />
                    ) : (
                      initials || "CA"
                    )}
                  </button>

                  {profileOpen && (
                    <div role="menu" className="creator-menu absolute right-0 top-full z-40 mt-2 w-60">
                      <div className="border-b border-white/10 px-3.5 py-3">
                        <p className="truncate text-xs font-bold text-white">{displayName}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {profile?.email ?? user?.email}
                        </p>
                        {channel?.handle && (
                          <p className="mt-0.5 text-[11px] text-[#16C784]">@{channel.handle}</p>
                        )}
                      </div>
                      <Link
                        to={CREATOR_ROUTES.channel}
                        role="menuitem"
                        onClick={() => setProfileOpen(false)}
                        className="creator-menu-item"
                      >
                        <User className="h-[18px] w-[18px]" />
                        My channel
                      </Link>
                      <Link
                        to={CREATOR_ROUTES.settings}
                        role="menuitem"
                        onClick={() => setProfileOpen(false)}
                        className="creator-menu-item"
                      >
                        <Settings className="h-[18px] w-[18px]" />
                        Settings
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileOpen(false);
                          void handleSignOut();
                        }}
                        className="creator-menu-item border-t border-white/10 text-rose-400 hover:text-rose-300"
                      >
                        <LogOut className="h-[18px] w-[18px]" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="space-y-5 p-4 sm:p-6">
            {(title || subtitle || action) && (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  {title && (
                    <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                      {title}
                    </h1>
                  )}
                  {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
                </div>
                {action}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/** Big number tile used across the dashboard and analytics. */
export function CreatorStat({
  label,
  value,
  icon: Icon,
  hint,
  tone = "green",
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: string;
  tone?: "green" | "teal" | "violet" | "amber";
}) {
  const tones = {
    green: "text-[#16C784] bg-[#16C784]/10",
    teal: "text-[#2ED3B7] bg-[#2ED3B7]/10",
    violet: "text-violet-300 bg-violet-400/10",
    amber: "text-amber-300 bg-amber-400/10",
  } as const;

  return (
    <div className="creator-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** Dark card section with an optional header action. */
export function CreatorSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="creator-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CreatorEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5 text-[#16C784]">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function CreatorLoading({ label }: { label: string }) {
  return <p className="py-16 text-center text-sm text-slate-400">{label}</p>;
}

export function CreatorError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
      <p className="text-xs font-semibold text-rose-300">Could not load this screen</p>
      <p className="mt-1 text-[11px] leading-relaxed text-rose-200/80">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-[11px] font-bold text-rose-200 underline">
          Try again
        </button>
      )}
    </div>
  );
}
