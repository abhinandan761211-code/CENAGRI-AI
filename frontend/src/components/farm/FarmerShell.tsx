import { useEffect, useMemo, useRef, useState } from "react";
import { KalikaMark } from "@/components/Logo";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CloudSun,
  ClipboardList,
  Droplets,
  FileText,
  Headphones,
  HelpCircle,
  Home,
  Languages,
  HardHat,
  LayoutDashboard,
  Leaf,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Pin,
  MessageSquare,
  Package,
  Play,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  Store,
  Tractor,
  TrendingUp,
  Truck,
  User,
  UserCog,
  Users,
  Video,
  Wallet,
  Warehouse,
  Wifi,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCreatorMode } from "@/hooks/useCreatorMode";
import { useLang } from "@/i18n/LanguageContext";
import type { TranslationKey } from "@/i18n/locales/en";
import LanguageSwitcher from "@/i18n/LanguageSwitcher";
import { deriveAlerts, getWeather, isWeatherConfigured } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";
import { homeForRole } from "@/lib/roleHome";
import { Panel, Stat } from "@/components/farm/farmerUI";
import "@/styles/farmer.css";
import "@/styles/account.css";

// Re-exported for pages that imported the role router from this module.
export { homeForRole };

/**
 * The one chrome every farmer screen uses — dashboard, feature pages and the
 * account settings pages.
 *
 * Structure (identical on every account type, only the items differ):
 *
 *   sidebar (brand · grouped nav · help card)
 *     → sticky header (search · Ask AI · weather · bell · creator · menu)
 *       → breadcrumb · page title/description · primary action
 *         → page body
 *
 * Desktop  : 256px rail, collapsible to 72px icons.
 * Tablet   : same rail, hover/click expands it.
 * Mobile   : off-canvas drawer + a bottom bar for the six key sections.
 *
 * Colour comes from `.acct-root` (account.css / farmer.css) so the farmer
 * account shares one palette with every other account. No new CSS system.
 */

/* ── Navigation model ─────────────────────────────────────────────────── */

export type FarmerNavItem = {
  /** Translation key for the label. */
  key: TranslationKey;
  icon: LucideIcon;
  to?: string;
  /** Highlighted when the URL matches `to` exactly. */
  end?: boolean;
  /** Only shown to accounts with Creator Mode. */
  creatorOnly?: boolean;
};

export type FarmerNavGroup = {
  key: TranslationKey;
  icon: LucideIcon;
  items: FarmerNavItem[];
  /** The dashboard link sits alone with no heading. */
  bare?: boolean;
};

/**
 * The farmer's full menu, in the exact grouping the product spec asks for.
 * Order here IS the sidebar order; the mobile "More" sheet lists the rest.
 */
export const FARMER_NAV_GROUPS: FarmerNavGroup[] = [
  {
    key: "f.nav.dashboard",
    icon: Home,
    bare: true,
    items: [{ key: "f.nav.overview", icon: LayoutDashboard, to: "/farmer-account", end: true }],
  },
  {
    key: "f.nav.farmManagement",
    icon: Tractor,
    items: [
      { key: "f.nav.myFarm", icon: Tractor, to: "/my-farm" },
      { key: "f.nav.crops", icon: Sprout, to: "/crops" },
      { key: "f.nav.calendar", icon: CalendarDays, to: "/calendar" },
      { key: "f.nav.weather", icon: CloudSun, to: "/weather" },
    ],
  },
  {
    key: "f.nav.farmActivities",
    icon: ClipboardList,
    items: [
      { key: "f.nav.soil", icon: Leaf, to: "/soil-health" },
      { key: "f.nav.irrigation", icon: Droplets, to: "/irrigation" },
      { key: "f.nav.farmActivities", icon: ClipboardList, to: "/farm-activities" },
    ],
  },
  {
    key: "f.nav.ai",
    icon: Sprout,
    items: [
      { key: "f.nav.advisory", icon: Sprout, to: "/advisory" },
      { key: "f.nav.disease", icon: ScanLine, to: "/disease-detection" },
    ],
  },
  {
    key: "f.nav.market",
    icon: TrendingUp,
    items: [
      { key: "f.nav.mandi", icon: TrendingUp, to: "/mandi" },
      { key: "f.nav.marketplace", icon: Store, to: "/marketplace" },
      { key: "f.nav.orders", icon: ShoppingBag, to: "/orders-sales" },
      { key: "f.nav.expenses", icon: Wallet, to: "/expenses" },
    ],
  },
  {
    key: "f.nav.services",
    icon: Package,
    items: [
      { key: "f.nav.equipment", icon: Package, to: "/equipment" },
      { key: "f.nav.transport", icon: Truck, to: "/transport" },
      { key: "f.nav.storage", icon: Warehouse, to: "/storage" },
      { key: "f.nav.labour", icon: HardHat, to: "/farm-labour" },
      { key: "f.nav.schemes", icon: BadgeCheck, to: "/schemes" },
      { key: "f.nav.insurance", icon: ShieldCheck, to: "/crop-insurance" },
    ],
  },
  {
    key: "f.nav.community",
    icon: Users,
    items: [
      // "CenFriend" (/cenfriend) used to sit here next to "CenFriend Explore".
      // Once you are inside CenFriend, its own rail already offers Home, and
      // the two entries pointed at the same page — so this one is gone. The
      // Explore entry stays as the single door into the community.
      { key: "f.nav.cenfriendExplore", icon: Search, to: "/cenfriend/explore" },
      { key: "f.nav.videoHub", icon: Play, to: "/video-hub" },
      { key: "f.nav.creatorStudio", icon: Video, to: "/video-hub?mode=create", creatorOnly: true },
      { key: "f.nav.groups", icon: MessageSquare, to: "/farming-groups" },
      // Messages (/messages) is intentionally NOT listed here. CenFriend's own
      // rail already has a Messages entry pointing at the same page, so the
      // outer copy was a second door to one room.
      { key: "f.nav.notifications", icon: Bell, to: "/notifications" },
    ],
  },
  {
    key: "f.nav.account",
    icon: User,
    items: [
      { key: "f.nav.profile", icon: User, to: "/account/profile" },
      { key: "f.nav.personal", icon: UserCog, to: "/account/personal" },
      { key: "f.nav.farmingInfo", icon: Tractor, to: "/account/farming" },
      { key: "f.nav.documents", icon: FileText, to: "/account/documents" },
      { key: "f.nav.language", icon: Languages, to: "/account/language" },
      { key: "f.nav.notifSettings", icon: Bell, to: "/account/notifications" },
      { key: "f.nav.privacy", icon: LockKeyhole, to: "/account/privacy" },
      { key: "f.nav.help", icon: HelpCircle, to: "/account/help" },
      { key: "f.nav.accountMgmt", icon: Settings, to: "/account/manage" },
    ],
  },
];

/** Six destinations in the phone bottom bar; the rest live under "More". */
export const MOBILE_PRIMARY: TranslationKey[] = [
  "f.nav.dashboard",
  "f.nav.myFarm",
  "f.nav.crops",
  "f.nav.advisory",
  "f.nav.market",
];

/** Extra words the header search matches, per route. */
const SEARCH_KEYWORDS: Record<string, string> = {
  "/farmer-account": "dashboard overview home today",
  "/my-farm": "farm land acres plot soil irrigation photo",
  "/crops": "crop sowing variety growth stage harvest health",
  "/calendar": "calendar sowing fertiliser irrigation pest harvest task reminder",
  "/weather": "weather rain forecast humidity temperature alert",
  "/soil-health": "soil ph npk organic carbon test report lab",
  "/irrigation": "irrigation water pump drip sprinkler hours log",
  "/farm-activities": "activity log ploughing sowing spraying weeding",
  "/advisory": "ai advisory question assistant chat disease pest",
  "/disease-detection": "disease photo image leaf spot scan",
  "/mandi": "mandi price rate market commodity modal arrival",
  "/marketplace": "market buy sell listing produce",
  "/orders-sales": "order sales purchase invoice transaction",
  "/expenses": "expense cost profit loss money seed fertiliser labour",
  "/equipment": "tractor harvester pump rent machinery",
  "/transport": "truck transport delivery logistics quote",
  "/storage": "storage godown cold warehouse booking",
  "/farm-labour": "labour worker hire wage job",
  "/schemes": "scheme subsidy government eligibility documents",
  "/crop-insurance": "insurance premium claim policy fasal bima",
  "/cenfriend": "community farmers friends follow connect",
  "/video-hub": "video shorts tutorial watch learn",
  "/farming-groups": "groups discussion members",
  "/messages": "messages chat conversation",
  "/notifications": "notifications alerts reminders",
  "/account/profile": "profile completion verification",
  "/account/personal": "name phone email address personal",
  "/account/farming": "farming experience crops preferences",
  "/account/documents": "kyc aadhaar land record bank document",
  "/account/language": "language hindi bengali odia english",
  "/account/notifications": "notification settings push email",
  "/account/privacy": "password security session privacy",
  "/account/help": "help support faq complaint ticket",
  "/account/manage": "account management export delete",
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** The one item that belongs to the current URL. */
function activeItem(pathname: string): FarmerNavItem | null {
  const all = FARMER_NAV_GROUPS.flatMap((g) => g.items);
  // Longest match first so /account/personal doesn't also light /account.
  const matches = all
    .filter((item) => item.to && !item.to.startsWith("/farmer-account") && pathname.startsWith(item.to.split("?")[0]))
    .sort((a, b) => (b.to?.length ?? 0) - (a.to?.length ?? 0));
  if (matches[0]) return matches[0];
  return all.find((item) => item.end && item.to === pathname) ?? null;
}

/** Which group owns a URL — used to auto-open that group. */
function groupForKey(pathname: string): TranslationKey | null {
  for (const group of FARMER_NAV_GROUPS) {
    if (group.items.some((i) => i.to && pathname.startsWith(i.to.split("?")[0]) && !i.end)) {
      return group.key;
    }
  }
  return null;
}

/** Remembers whether the farmer pinned the sidebar open on this device. */
const SIDEBAR_PREF_KEY = "kalika.farmer.sidebar";

/* ── Component ────────────────────────────────────────────────────────── */

export function FarmerShell({
  children,
  title,
  breadcrumb,
  bottomBar = true,
  // Accepted for backwards compatibility with pages that still pass it; every
  // sidebar entry now has its own page, so no panel dialog is shown.
  panelContent: _legacyPanel,
  notificationsPanel,
}: {
  children: ReactNode;
  title?: string;
  breadcrumb?: [string, string][];
  bottomBar?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  panelContent?: (name: string, close: () => void) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notificationsPanel?: (close: () => void) => any;
}) {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLang();
  // Creator Mode is an explicit account setting (see useCreatorMode), not a
  // side effect of having a channel — otherwise every farmer gained the
  // publishing entries as soon as they opened the studio once.
  const { enabled: creatorMode } = useCreatorMode();
  void _legacyPanel;
  void notificationsPanel;

  const [drawerOpen, setDrawerOpen] = useState(false);
  /**
   * Sidebar collapses to a 72px icon rail on its own — the same behaviour the
   * Buyer, Shop, Worker and Transporter accounts already have.
   *
   *   • The rail starts collapsed, so the page gets the full width.
   *   • Moving the pointer to the left edge (or over the rail) expands it.
   *   • Leaving it collapses again after a short delay, so a twitchy mouse does
   *     not make it flicker.
   *   • The pin button makes that a choice: pinned open (or pinned shut) and
   *     the automatic behaviour stops until the farmer unpins it again.
   *   • The choice is remembered on this device, so a farmer who prefers icons
   *     does not have to set it again on every page.
   */
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_PREF_KEY) !== "pinned";
    } catch {
      return true;
    }
  });
  /** True while the pointer is on the rail, i.e. the temporary expanded state. */
  const [railHovered, setRailHovered] = useState(false);
  /** Set once the farmer pins the sidebar themselves. */
  const [pinned, setPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_PREF_KEY) === "pinned";
    } catch {
      return false;
    }
  });
  const hoverTimer = useRef<number | null>(null);
  /** The rail is visually open when pinned open, or while hovered. */
  const sidebarExpanded = !collapsed || railHovered;
  /**
   * Mirror of `sidebarExpanded` for event handlers. A click can land after the
   * pointer has left the rail has already queued a collapse; reading the ref
   * keeps "pin it open" meaning what the farmer saw when they pressed it.
   */
  const expandedRef = useRef(sidebarExpanded);
  expandedRef.current = sidebarExpanded;
  const [openGroups, setOpenGroups] = useState<TranslationKey[]>(() => {
    const owning = groupForKey(pathname);
    // Only the group that owns the current page starts open — otherwise a
    // 34-row list fills the whole rail before the farmer has scrolled once.
    if (owning) return [owning];
    return [FARMER_NAV_GROUPS[1].key];
  });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [weather, setWeather] = useState<WeatherNow | null>(null);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* ── Auto-collapse ─────────────────────────────────────────────────── */

  function expandRail() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setRailHovered(true);
  }

  /** Collapse after a short delay so a jittery mouse does not slam it shut. */
  function scheduleCollapse() {
    if (pinned) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setRailHovered(false), 220);
  }

  /** Pin the rail open or shut; the choice is remembered on this device. */
  function togglePin() {
    // Always decide from the SAVED preference, never from the hover state: a
    // hovered rail looks expanded, and clicking then must mean "pin it".
    const nextOpen = !pinned;
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setPinned(nextOpen);
    setCollapsed(!nextOpen);
    setRailHovered(false);
    try {
      localStorage.setItem(SIDEBAR_PREF_KEY, nextOpen ? "pinned" : "auto");
    } catch {
      /* private mode — the choice simply does not persist */
    }
  }

  /** The nav's "open menu" row — expands only, never collapses a hovered rail. */
  function openRail() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setPinned(true);
    setCollapsed(false);
    try {
      localStorage.setItem(SIDEBAR_PREF_KEY, "pinned");
    } catch {
      /* ignore */
    }
  }

  // Clear a pending timer on unmount so it never fires into a dead component.
  useEffect(() => {
    return () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  const details = profile?.details ?? {};
  const district = details.district;

  // Live weather for the header chip — same source as the dashboard.
  useEffect(() => {
    if (!district || !isWeatherConfigured) return;
    let alive = true;
    getWeather(district, details.state, details.village)
      .then((data) => {
        if (alive && data) setWeather(data);
      })
      .catch(() => {
        /* no chip is better than a fake one */
      });
    return () => {
      alive = false;
    };
  }, [district, details.state, details.village]);

  // Close popovers on outside click / Escape.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setMenuOpen(false);
        setDrawerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Lock the page scroll while the mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Farmer";
  const firstName = name.split(" ").filter(Boolean)[0] ?? "Farmer";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const locationLine =
    [details.village, details.district, details.state].filter(Boolean).join(", ") ||
    t("f.locationNotSet");

  // Bell: real forecast alerts only. No price row is invented here.
  const notifications = useMemo(
    () => deriveAlerts(weather).slice(0, 5).map((a) => ({ id: a.id, title: a.title, body: a.body })),
    [weather]
  );
  const unread = notifications.filter((n) => !seen.includes(n.id)).length;

  const active = activeItem(pathname);
  const activeGroup = groupForKey(pathname);

  // Open the group that owns the page we just navigated to.
  useEffect(() => {
    if (activeGroup && !openGroups.includes(activeGroup)) {
      setOpenGroups((prev) => [...prev, activeGroup]);
    }
    setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const visibleGroups = useMemo(
    () =>
      FARMER_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.creatorOnly || creatorMode),
      })),
    [creatorMode]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return visibleGroups
      .flatMap((g) => g.items)
      .filter((item) => {
        const label = t(item.key).toLowerCase();
        const words = SEARCH_KEYWORDS[item.to?.split("?")[0] ?? ""] ?? "";
        return label.includes(q) || words.includes(q);
      })
      .slice(0, 8);
  }, [query, visibleGroups, t]);

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  function toggleGroup(key: TranslationKey) {
    setOpenGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function go(to?: string) {
    if (!to) return;
    setDrawerOpen(false);
    setSearchOpen(false);
    setQuery("");
    navigate(to);
  }

  /* ── Sidebar ──────────────────────────────────────────────────────── */

  /**
   * Icon-only mode applies to the DESKTOP rail only. The phone drawer always
   * shows full labels, so it passes `false` and the `lg:` variants never fire.
   */
  const renderSidebar = (iconOnly: boolean) => (
    <>
      <div className="farmer-sidebar-head flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
        <Link
          to="/farmer-account"
          onClick={() => setDrawerOpen(false)}
          className="flex min-w-0 items-center gap-2"
          title="Kalika"
        >
          <KalikaMark size={36} />
          <span className={`truncate font-display text-sm font-extrabold tracking-tight text-forest ${iconOnly ? "lg:hidden" : ""}`}>
            Kalika
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label={t("f.closeMenu")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-2" aria-label="Farmer features">
        {visibleGroups.map((group) => {
          const isBare = group.bare;
          const isOpen = isBare || openGroups.includes(group.key);
          const GroupIcon = group.icon;
          const hasActive = group.items.some((i) => i === active);

          return (
            <div key={group.key}>
              {!isBare && (
                <div className={iconOnly ? "lg:hidden" : ""}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={isOpen}
                    className={`farmer-nav-group ${hasActive ? "is-current" : ""}`}
                  >
                    <GroupIcon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate text-left">{t(group.key)}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    />
                  </button>
                </div>
              )}

              {/* Rail mode: each group becoming a hover flyout would fight the
                  page; instead only the active item's group is shown. */}
              {(isOpen || iconOnly) && (
                <div
                  className={`space-y-0.5 ${!isBare && !iconOnly ? "ml-2 border-l border-slate-200 pl-1.5" : ""}`}
                >
                  {group.items
                    .filter((item) => isBare || isOpen || item === active || iconOnly)
                    .filter((item) => {
                      if (iconOnly && !isBare && !isOpen) return item === active;
                      return true;
                    })
                    .map((item) => {
                      const Icon = item.icon;
                      const isActive = item === active;
                      return (
                        <Link
                          key={item.key}
                          to={item.to ?? "#"}
                          title={t(item.key)}
                          aria-current={isActive ? "page" : undefined}
                          className={`creator-nav-item ${isActive ? "is-active" : ""} ${
                            iconOnly ? "lg:justify-center lg:px-0" : ""
                          }`}
                        >
                          <Icon className="h-[17px] w-[17px] shrink-0" />
                          <span className={`flex-1 truncate ${iconOnly ? "lg:hidden" : ""}`}>
                            {t(item.key)}
                          </span>
                        </Link>
                      );
                    })}
                </div>
              )}
              {!isBare && <div className="farmer-nav-divider" />}
            </div>
          );
        })}

        {/* Rail mode: one tap expands the whole menu and pins it. */}
        {iconOnly && (
          <button
            type="button"
            onClick={openRail}
            title={t("f.expand")}
            aria-label={t("f.expand")}
            className="creator-nav-item hidden w-full justify-center lg:flex"
          >
            <Menu className="h-[17px] w-[17px]" />
          </button>
        )}
      </nav>

      <div className="farmer-sidebar-foot shrink-0 border-t border-slate-200 px-3 py-2">
        {/* Language lives in the sidebar too, not only behind the settings
            menu: on a phone the drawer is the one place a farmer looks for it,
            and a menu that closes on the first tap made it hard to find. */}
        <div className={`mb-1.5 ${iconOnly ? "lg:hidden" : ""}`}>
          <LanguageSwitcher
            tone="panel"
            className="w-full [&>button]:w-full [&>button]:justify-start"
            label={t("f.nav.language")}
          />
        </div>
        <button
          type="button"
          onClick={togglePin}
          aria-pressed={pinned}
          aria-label={pinned ? "Use auto-hide menu" : "Keep the menu open"}
          title={pinned ? "Use auto-hide" : "Keep the menu open"}
          className="farmer-pin-btn mb-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-forest"
        >
          <Pin className="h-3.5 w-3.5 shrink-0" />
          <span className={`truncate ${iconOnly ? "lg:hidden" : ""}`}>
            {pinned ? "Menu stays open" : "Auto-hide menu"}
          </span>
        </button>
        {iconOnly ? (
          <a
            href="tel:1800000000"
            title={`${t("f.helpline")} · 1800-000-000`}
            aria-label={`${t("f.helpline")} 1800-000-000`}
            className="hidden place-items-center rounded-lg border border-brand-200 bg-brand-50 py-2.5 text-brand-700 transition hover:bg-brand-100 lg:grid"
          >
            <Headphones className="h-[18px] w-[18px]" />
          </a>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-brand-800">
              <Headphones className="h-3.5 w-3.5" /> {t("f.helpline")}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-brand-700">{t("f.helplineNote")}</p>
            <a
              href="tel:1800000000"
              className="mt-1.5 block rounded-md bg-white py-1 text-center text-[11px] font-bold text-brand-800 shadow-sm"
            >
              1800-000-000
            </a>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="acct-root min-h-screen bg-cream">
      <div className="flex min-h-screen">
        {/* Edge strip: a 72px rail is a small target, so the cursor finds it
            at the very edge of the screen. Invisible and aria-hidden. */}
        <div
          aria-hidden="true"
          onMouseEnter={expandRail}
          className="fixed inset-y-0 left-0 z-30 hidden w-2 lg:block"
        />

        {/* ── Desktop sidebar: a rail that expands on hover ── */}
        <aside
          aria-label="Farmer navigation"
          onMouseEnter={expandRail}
          onMouseLeave={scheduleCollapse}
          onFocusCapture={expandRail}
          className={`creator-sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 ease-out lg:flex ${
            sidebarExpanded ? "w-64" : "w-[72px]"
          }`}
        >
          {/* The inner column clips (so labels cannot spill during the width
              animation) while the aside itself does NOT. */}
          <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderSidebar(!sidebarExpanded)}</div>
        </aside>

        {/* ── Mobile drawer ── */}
        {drawerOpen && (
          <>
            <button
              type="button"
              aria-label={t("f.closeMenu")}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-forest-dark/50 lg:hidden"
            />
            <aside
              aria-label="Farmer menu"
              className="creator-sidebar fixed inset-y-0 left-0 z-50 flex w-[84%] max-w-[300px] flex-col border-r lg:hidden"
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderSidebar(false)}</div>
            </aside>
          </>
        )}

        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="creator-header sticky top-0 z-30">
            <div className="flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-6">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-forest lg:hidden"
                aria-label={t("f.openMenu")}
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
                    placeholder={t("f.searchPlaceholder")}
                    aria-label={t("f.searchPlaceholder")}
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
                  <ul className="creator-menu absolute left-0 right-0 top-full z-40 mt-1.5" role="listbox">
                    {results.length === 0 ? (
                      <li className="px-3.5 py-3 text-xs text-slate-500">
                        No matches for “{query.trim()}”.
                      </li>
                    ) : (
                      results.map((item) => (
                        <li key={item.key} role="option" aria-selected={item === active}>
                          <button
                            type="button"
                            onClick={() => go(item.to)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-forest hover:bg-slate-50"
                          >
                            <item.icon className="h-3.5 w-3.5 text-brand-700" />
                            {t(item.key)}
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
                  <span className="hidden md:inline">{t("f.askAi")}</span>
                </Link>

                {weather && (
                  <Link
                    to="/weather"
                    className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 md:inline-flex"
                    title={`${weather.place} · ${weather.description}`}
                  >
                    <CloudSun className="h-3.5 w-3.5 text-brand-700" />
                    {weather.temp}°C
                  </Link>
                )}

                <div className="relative" ref={notifRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen((v) => !v);
                      setMenuOpen(false);
                    }}
                    className="creator-icon-btn bg-white"
                    aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                    aria-expanded={notifOpen}
                  >
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                      <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                        {unread > 99 ? "99" : unread}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="creator-menu absolute right-0 top-full z-40 mt-2 w-[85vw] max-w-80">
                      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                        <p className="text-xs font-bold text-forest">{t("f.nav.notifications")}</p>
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
                            No weather alerts for your district right now.
                          </li>
                        )}
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            className={`border-b border-slate-50 px-3.5 py-2.5 last:border-0 ${seen.includes(n.id) ? "opacity-55" : ""
                              }`}
                          >
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-forest">
                              <CloudSun className="h-3.5 w-3.5 text-brand-700" />
                              {n.title}
                            </p>
                            <p className="mt-0.5 pl-5 text-[11px] leading-relaxed text-slate-500">{n.body}</p>
                          </li>
                        ))}
                      </ul>
                      <Link
                        to="/notifications"
                        onClick={() => setNotifOpen(false)}
                        className="block border-t border-slate-100 px-3.5 py-2.5 text-center text-[11px] font-bold text-brand-700 hover:bg-slate-50"
                      >
                        {t("f.viewAll")}
                      </Link>
                    </div>
                  )}
                </div>

                {creatorMode && (
                  <Link
                    to="/video-hub?mode=create"
                    className="creator-icon-btn hidden bg-white sm:grid"
                    title={t("f.nav.creatorStudio")}
                    aria-label={t("f.nav.creatorStudio")}
                  >
                    <Video className="h-4 w-4" />
                  </Link>
                )}

                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen((v) => !v);
                      setNotifOpen(false);
                    }}
                    className="creator-icon-btn bg-white"
                    aria-label="Settings"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  {menuOpen && (
                    <div role="menu" className="creator-menu absolute right-0 top-full z-40 mt-2 w-60">
                      <div className="border-b border-slate-100 px-3.5 py-3">
                        <p className="truncate text-xs font-bold text-forest">{name}</p>
                        <p className="truncate text-[11px] text-slate-500">{profile?.email ?? user?.email}</p>
                      </div>
                      <Link to="/account/profile" role="menuitem" className="creator-menu-item" onClick={() => setMenuOpen(false)}>
                        <User className="h-[18px] w-[18px]" />
                        {t("f.nav.profile")}
                      </Link>
                      <Link to="/account/privacy" role="menuitem" className="creator-menu-item" onClick={() => setMenuOpen(false)}>
                        <ShieldCheck className="h-[18px] w-[18px]" />
                        {t("f.nav.privacy")}
                      </Link>
                      <Link to="/account/help" role="menuitem" className="creator-menu-item" onClick={() => setMenuOpen(false)}>
                        <HelpCircle className="h-[18px] w-[18px]" />
                        {t("f.nav.help")}
                      </Link>
                      <div className="border-t border-slate-100 px-3.5 py-2.5">
                        <LanguageSwitcher compact />
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleSignOut()}
                        className="creator-menu-item border-t border-slate-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <LogOut className="h-[18px] w-[18px]" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>

                <Link
                  to="/account/profile"
                  aria-label={t("f.nav.profile")}
                  title={name}
                  className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-forest text-xs font-bold text-white ring-offset-2 hover:ring-2 hover:ring-brand-400"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-9 w-9 object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    initials || "CA"
                  )}
                </Link>
              </div>
            </div>
          </header>

          <main className={`min-w-0 flex-1 space-y-5 p-4 sm:p-6 ${bottomBar ? "pb-24 lg:pb-8" : ""}`}>
            {/* Breadcrumb — every page, including the dashboard. */}
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
              <Link to="/farmer-account" className="inline-flex items-center gap-1 font-semibold hover:text-brand-700">
                <Home className="h-3 w-3" />
                {t("f.breadcrumbHome")}
              </Link>
              {(breadcrumb ?? (active ? [[t(active.key), active.to ?? "/farmer-account"]] : [])).map(
                ([label, to], i, arr) => (
                  <span key={`${label}-${i}`} className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-slate-300" />
                    {i === arr.length - 1 || !to ? (
                      <span className="font-semibold text-forest">{label}</span>
                    ) : (
                      <Link to={to} className="hover:text-brand-700">
                        {label}
                      </Link>
                    )}
                  </span>
                )
              )}
            </nav>

            {/* Only screens that do NOT bring their own <PageHeader> set this,
                so every page renders exactly one page title and one <h1>. */}
            {title && (
              <div className="min-w-0">
                <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">{title}</h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3 w-3 text-brand-700" />
                  {locationLine}
                </p>
              </div>
            )}

            {needsRole || needsDetails ? (
              <div className="creator-card p-6 text-center">
                <p className="text-sm font-semibold text-forest">
                  Finish your profile to use the farmer account.
                </p>
                <Link
                  to={`/complete-profile?next=${encodeURIComponent(pathname)}`}
                  className="creator-btn-primary mt-3 inline-flex h-9 items-center px-4 text-xs"
                >
                  Complete profile
                </Link>
              </div>
            ) : (
              children
            )}

            <p className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-slate-400">
              <Wifi className="h-3 w-3" />
              {t("f.serverNote")} · {firstName}
            </p>
          </main>
        </div>
      </div>

      {/* ── Phone bottom bar ── */}
      {bottomBar && (
        <nav
          aria-label="Quick sections"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="flex items-stretch">
            {MOBILE_PRIMARY.map((key) => {
              const item = FARMER_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === key);
              if (!item) return null;
              const Icon = item.icon;
              const isActive = item === active;
              return (
                <li key={key} className="flex-1">
                  <Link
                    to={item.to ?? "/farmer-account"}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${isActive ? "text-brand-700" : "text-slate-500"
                      }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="max-w-full truncate px-0.5">{t(key)}</span>
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-slate-500"
              >
                <Menu className="h-[18px] w-[18px]" />
                {t("f.moreNav")}
              </button>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}

export default FarmerShell;

/** Kept for existing pages that import the hero + stat helpers from here. */
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

export { MessageSquare };

/* ── Legacy helpers used by the existing feature pages ────────────────── */

/**
 * Summary row kept for the pages built before `farmerUI.tsx`; new pages use
 * `<Stat>` from `farmerUI`. Same tiles, same colours, same responsive grid.
 */
export function FarmerStats({
  items,
}: {
  items: { label: string; value: ReactNode; icon: LucideIcon; hint?: ReactNode }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon, hint }) => (
        <Stat key={label} label={label} value={value} icon={icon} hint={hint} />
      ))}
    </div>
  );
}

/**
 * Card container kept for the existing pages: an optional title/description
 * header with a slot on the right, then the body. Delegates to `<Panel>`.
 */
export function FarmerSection({
  id,
  title,
  description,
  icon,
  action,
  className,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Panel id={id} title={title} description={description} icon={icon} action={action} className={className}>
      {children}
    </Panel>
  );
}
