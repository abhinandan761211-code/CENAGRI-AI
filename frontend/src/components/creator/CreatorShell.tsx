import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Bookmark,
  Clapperboard,
  Coins,
  Compass,
  HelpCircle,
  History,
  Home,
  ListVideo,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Radio,
  Search,
  Settings,
  TrendingUp,
  Upload,
  User,
  Users,
  Video,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/lib/roleHome";
import {
  compactCount,
  listCreatorNotifications,
} from "@/lib/creator";
import type { CreatorNotification, CreatorProfile } from "@/lib/creator";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
// The light variant (`light`) collects its palette tokens from account.css.
import "@/styles/account.css";

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
/**
 * The Create mode of the hub page. Watching and creating are one screen now,
 * so the studio is a mode flag on the hub rather than a separate app at
 * `/creator` (that URL redirects here — see App.tsx).
 */
export const STUDIO_ROUTE = `${HUB_ROUTE}?mode=create`;
export const WATCH_ROUTE = "/watch";


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

/**
 * The single rail used everywhere in the module.
 *
 * Watch and Create are two groups of one navigation, not two products. A
 * farmer browsing the hub sees the studio entries in the same list, so
 * "where do I upload?" is answered on the same screen as "what can I watch?".
 * `studioOnly` marks an entry that needs the creator rail (channel, analytics
 * and so on) — those are filtered out for the browsing rail.
 */
export type VideoNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  studioOnly?: boolean;
};

export const VIDEO_NAV: { group: string; items: VideoNavItem[] }[] = [
  {
    group: "Watch",
    items: [
      { key: "home", label: "Kisan Video Hub", icon: Home, to: HUB_ROUTE },
      { key: "shorts", label: "Shorts", icon: Clapperboard, to: `${HUB_ROUTE}#shorts` },
      { key: "following", label: "Following", icon: Users, to: `${HUB_ROUTE}?tab=following` },
      { key: "live", label: "Live Streaming", icon: Radio, to: `${HUB_ROUTE}#live` },
      { key: "categories", label: "Categories", icon: Compass, to: `${HUB_ROUTE}#categories` },
      { key: "trending", label: "Trending Videos", icon: TrendingUp, to: `${HUB_ROUTE}?tab=trending` },
      { key: "saved", label: "Saved Videos", icon: Bookmark, to: `${HUB_ROUTE}?tab=saved` },
      { key: "history", label: "Watch History", icon: History, to: `${HUB_ROUTE}?tab=history` },
      { key: "playlists", label: "Playlists", icon: ListVideo, to: `${HUB_ROUTE}?tab=playlists` },
    ],
  },
  {
    group: "Create",
    items: [
      /* The studio is the Create mode of the same hub page, not a second app. */
      { key: "studio", label: "Creator Studio", icon: LayoutDashboard, to: STUDIO_ROUTE },
      { key: "upload", label: "Create content", icon: Upload, to: CREATOR_ROUTES.upload },
      { key: "channel", label: "My Videos", icon: User, to: CREATOR_ROUTES.channel },
      { key: "analytics", label: "Analytics", icon: BarChart3, to: CREATOR_ROUTES.analytics, studioOnly: true },
      { key: "comments", label: "Comments", icon: MessageSquare, to: CREATOR_ROUTES.comments, studioOnly: true },
      { key: "monetization", label: "Monetization", icon: Coins, to: CREATOR_ROUTES.monetization, studioOnly: true },
    ],
  },
];

/** Flat list of hub destinations, used by the mobile bar and the search index. */
export const HUB_NAV = VIDEO_NAV[0].items;

export default function CreatorShell({
  title,
  subtitle,
  action,
  onSearch,
  searchEntries,
  searchPlaceholder = "Search your videos…",
  hub = false,
  suggestions,
  light = true,
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
  /**
   * True while browsing (Video Hub, Shorts, Watch). The rail is the same in
   * both modes — Watch + Create groups — the flag only decides which entries
   * light up, whether studio-only rows such as Analytics are shown, and
   * whether the mobile bottom bar replaces the drawer.
   */
  hub?: boolean;
  /** Suggestion rows shown under the hub search box. */
  suggestions?: ShellSearch[];
  /**
   * Light account palette. ON by default: the creator module now matches the
   * Farmer / Buyer / Retailer / Worker accounts instead of being a dark island.
   * Pass `light={false}` only for a deliberately dark surface.
   *
   * Every colour is driven by the `.acct-root` tokens in creator.css, so the
   * module and the rest of the app share one palette.
   */
  light?: boolean;
  children: ReactNode;
}) {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

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

  const { channel, state: channelState, canCreate } = useCreatorChannel();

  /** The hub page's Create tab — same URL, `?mode=create`. */
  const studioMode = pathname === HUB_ROUTE && searchParams.get("mode") === "create";

  /**
   * Creator mode is open to EVERY account, not just the "Content Creator"
   * role: a farmer, buyer or retailer can open a studio inside their own
   * account, and the role only describes their primary business.
   *
   * Gating on the channel *state* rather than the role means an account with
   * no channel still gets in and is shown the "create your channel" form —
   * that form is what actually enables creator mode. Errors are excluded so a
   * broken table does not silently present an empty studio.
   */
  const isCreator = channelState === "ready";

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

  /**
   * The account this studio was opened from — a farmer goes back to the farmer
   * dashboard, a buyer to the buyer dashboard and so on. A pure Content Creator
   * already lives here, so they get no back button.
   */
  const accountHome = homeForRole(profile?.role);
  const showBackToAccount = accountHome !== CREATOR_BASE;

  const displayName = channel?.channel_name ?? profile?.full_name ?? user?.email?.split("@")[0] ?? "Creator";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const unread = notifications.filter((n) => !n.read_at && !seen.includes(n.id)).length;


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
    <div className={light ? "creator-root acct-root" : "creator-root"}>
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
          className={`creator-sidebar fixed inset-y-0 left-0 z-40 shrink-0 overflow-y-auto overflow-x-hidden border-r transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
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

          <nav className="space-y-1 p-2" aria-label="Kisan Video Hub">
            {VIDEO_NAV.map(({ group, items }) => {
              const shown = items.filter((item) => !item.studioOnly || !hub);
              if (shown.length === 0) return null;
              return (
                <div key={group} className="pb-1">
                  {/* Group headings only make sense on the expanded rail. */}
                  <p
                    className={`px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${
                      hovered ? "" : "lg:hidden"
                    }`}
                  >
                    {group}
                  </p>
                  {shown.map(({ key, label, icon: Icon, to }) => {
                    const active = hub
                      ? key === "home" && !studioMode
                      : Object.entries(CREATOR_ROUTES).find(([, path]) => path === pathname)?.[0] === key;
                    return (
                      <Link
                        key={key}
                        to={to}
                        title={label}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`creator-nav-item ${active ? "is-active" : ""} ${
                          hovered ? "" : "lg:justify-center"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className={`flex-1 truncate ${railLabel}`}>{label}</span>
                      </Link>
                    );
                  })}
                </div>
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

            {!hub && (
              <>
                <div className="my-2 border-t border-white/10" />
                <Link
                  to={HUB_ROUTE}
                  title="Browse Kisan Video Hub"
                  onClick={() => setSidebarOpen(false)}
                  className={`creator-nav-item ${hovered ? "" : "lg:justify-center"}`}
                >
                  <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
                  <span className={`flex-1 truncate ${railLabel}`}>Watch videos</span>
                </Link>
              </>
            )}

            {/* Back out of the studio into the account that opened it. */}
            {showBackToAccount && (
              <Link
                to={accountHome}
                title="Back to my account"
                onClick={() => setSidebarOpen(false)}
                className={`creator-nav-item ${hovered ? "" : "lg:justify-center"}`}
              >
                <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
                <span className={`flex-1 truncate ${railLabel}`}>Back to my account</span>
              </Link>
            )}
          </nav>

          {hovered && channel && (
            <div className="px-3 pb-4">
              <div className="creator-rail-card rounded-xl p-3">
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
                <div ref={searchRef} className={`relative min-w-0 flex-1 ${hub ? "" : "hidden sm:block"}`}>
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
                    <button
                      type="button"
                      aria-label="Search"
                      onClick={() => {
                        setSearchOpen(false);
                        if (onSearch) onSearch(query);
                      }}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-slate-300 hover:text-white"
                    >
                      <Search className="h-3.5 w-3.5" />
                    </button>
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

                  {/* Suggestions: popular searches and topics under a \
                      focused, empty box; local matches once something is typed. */}
                  {searchOpen && suggestions && !onSearch && (
                    <ul className="creator-menu absolute left-0 right-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto">
                      <li className="px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {query.trim() ? "Matches" : "Try searching for"}
                      </li>
                      {(query.trim() ? results : suggestions).slice(0, 7).map((entry) => (
                        <li key={`${entry.label}-${entry.to}`}>
                          <Link
                            to={entry.to}
                            onClick={() => {
                              setSearchOpen(false);
                              setQuery("");
                            }}
                            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white"
                          >
                            <Search className="h-3 w-3 shrink-0 text-slate-500" />
                            {entry.label}
                          </Link>
                        </li>
                      ))}
                      {query.trim() && results.length === 0 && (
                        <li className="px-3.5 py-6 text-center text-[11px] text-slate-400">
                          No suggestion for “{query.trim()}”. Press Enter to search the hub.
                        </li>
                      )}
                    </ul>
                  )}

                  {searchOpen && !onSearch && !suggestions && query.trim() && results.length > 0 && (
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
                {/* Way back to the account the studio was opened from, so a
                    farmer / buyer / shop can leave the studio without hunting
                    through the menu. Hidden on phones to keep the bar light —
                    the drawer's "Back to my account" entry covers it there. */}
                {showBackToAccount && (
                  <Link
                    to={accountHome}
                    title="Back to my account"
                    aria-label="Back to my account"
                    className="creator-icon-btn hidden sm:inline-flex"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                )}

                {/* Present in both modes: watching and publishing are the same
                    module, so the studio is never more than one click away. */}
                <Link
                  to={CREATOR_ROUTES.upload}
                  title={canCreate ? "Upload a video" : "Open a creator channel"}
                  className="creator-btn-primary hidden h-9 items-center gap-1.5 px-3.5 text-xs sm:inline-flex"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Create
                </Link>

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
                      <div className="creator-menu-head flex items-center justify-between px-3.5 py-2.5">
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
                            <li
                              key={n.id}
                              className={`creator-menu-row ${read ? "opacity-55" : ""}`}
                            >
                              <Link
                                to={n.link ?? CREATOR_ROUTES.notifications}
                                onClick={() => {
                                  setNotifOpen(false);
                                  setSeen((s) => [...s, n.id]);
                                }}
                                className="creator-menu-row-link block px-3.5 py-2.5"
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
                        className="creator-menu-foot block px-3.5 py-2 text-center text-[11px] font-semibold text-[#16C784]"
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
                    className="creator-avatar grid h-9 w-9 place-items-center overflow-hidden rounded-full text-xs font-bold"
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
                      <div className="creator-menu-head px-3.5 py-3">
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
                      {/* Leave the studio and go back to this account's own
                          dashboard (farmer / buyer / shop). */}
                      {showBackToAccount && (
                        <Link
                          to={accountHome}
                          role="menuitem"
                          onClick={() => setProfileOpen(false)}
                          className="creator-menu-item"
                        >
                          <ArrowLeft className="h-[18px] w-[18px]" />
                          Back to my account
                        </Link>
                      )}
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
                        className="creator-menu-item creator-menu-danger"
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

          <main className={`space-y-5 p-4 sm:p-6 ${hub ? "pb-24 lg:pb-6" : ""}`}>
            {(title || subtitle || action) && (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  {title && (
                    <h1 className="creator-page-title text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="creator-page-subtitle mt-0.5 text-xs text-slate-400">{subtitle}</p>
                  )}
                </div>
                {action}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom bar: the four destinations a phone user reaches for
          most. Everything else stays in the drawer behind the menu button. */}
      {hub && (
        <nav
          aria-label="Kisan Video Hub"
          className="creator-mobile-bar fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t lg:hidden"
        >
          {[
            { to: HUB_ROUTE, label: "Home", icon: Home },
            { to: `/video-hub#shorts`, label: "Shorts", icon: Clapperboard },
            { to: `/video-hub#live`, label: "Live", icon: Radio },
            { to: `/video-hub?tab=saved`, label: "Saved", icon: Bookmark },
            { to: CREATOR_BASE, label: "Studio", icon: User },
          ].map(({ to, label, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="creator-mobile-tab flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold"
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
      )}
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
    green: "creator-stat-green",
    teal: "creator-stat-teal",
    violet: "creator-stat-violet",
    amber: "creator-stat-amber",
  } as const;

  return (
    <div className="creator-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="creator-stat-value mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
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
      <div className="creator-section-head flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div>
          <h2 className="creator-section-title text-sm font-bold">{title}</h2>
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
