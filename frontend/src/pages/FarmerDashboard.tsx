import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  CloudSun,
  Droplets,
  FileText,
  Headphones,
  Home,
  Languages,
  Layers,
  Leaf,
  Lock,
  MapPin,
  Menu,
  LogOut,
  MessageSquare,
  Package,
  Play,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sprout,
  Store,
  ThumbsUp,
  Tractor,
  TrendingUp,
  Truck,
  User,
  Users,
  Wallet,
  Warehouse,
  Wind,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { LOCATION_FIELD_NAMES, ROLE_FIELDS } from "@/lib/roleFields";
import { formatLocation } from "@/lib/locations";
import { homeForRole } from "@/lib/roleHome";
import { acresToHa, deleteFarm, haToAcres, listFarms, saveFarm } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { deriveAlerts, getWeather, isWeatherConfigured, titleCase } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";
import {
  MANDI_TABS,
  arrivalLabel,
  getMandiPrices,
  mandiErrorMessage,
  rowsForTab,
} from "@/lib/mandi";
import type { MandiPrice, MandiTab } from "@/lib/mandi";
import type { UserRole } from "@/types";

/* ── Static data (replace with API calls when the endpoints land) ──── */

/** Placeholder strip shown while the forecast loads (no fake temperatures). */
const FALLBACK_FORECAST = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => ({
  day,
  date: `placeholder-${i}`,
  temp: null as number | null,
  tempMin: 0,
  tempMax: 0,
  icon: "cloud" as const,
  description: "",
  rainChance: 0,
}));

const TRENDING = [
  {
    title: "Organic Farming Complete Guide",
    poster: "/images/video-1.jpg",
    time: "10:15",
    views: "523K views",
    age: "5 days ago",
    likes: "24K",
    comments: "688",
  },
  {
    title: "Tractor Maintenance Tips",
    poster: "/images/video-2.jpg",
    time: "7:32",
    views: "421K views",
    age: "6 days ago",
    likes: "18K",
    comments: "420",
  },
  {
    title: "Best Fertilizer for Healthy Crops",
    poster: "/images/video-3.jpg",
    time: "12:20",
    views: "389K views",
    age: "1 week ago",
    likes: "16K",
    comments: "377",
  },
  {
    title: "Smart Irrigation System",
    poster: "/images/video-4.jpg",
    time: "9:45",
    views: "278K views",
    age: "1 week ago",
    likes: "14K",
    comments: "298",
  },
];

type NavItem = {
  label: string;
  icon: typeof Home;
  /** Own route for a feature page. */
  href?: string;
  /** Anchor on this dashboard. */
  section?: string;
  /** Dialog opened on this dashboard. */
  panel?: string;
};

type NavGroup = {
  /** Section heading; the dashboard itself has no heading. */
  title?: string;
  icon: typeof Home;
  items: NavItem[];
};

/**
 * Sidebar destinations, grouped like a real farm-management console.
 * `href` navigates to a feature page; `section` scrolls to a block on this
 * dashboard; `panel` opens a dialog here. Entries that have no destination yet
 * open an informational panel instead of being a dead button.
 */
const SIDEBAR_GROUPS: NavGroup[] = [
  {
    title: undefined,
    icon: Home,
    items: [{ label: "Dashboard", icon: Home }],
  },
  {
    title: "Farm Management",
    icon: Tractor,
    items: [
      { label: "My Farm", icon: Tractor, href: "/my-farm" },
      { label: "Crop Management", icon: Sprout, section: "#my-farm" },
      { label: "Crop Calendar", icon: CalendarDays, panel: "Crop Calendar" },
      { label: "Farm Activities", icon: ClipboardList, panel: "Farm Activities" },
    ],
  },
  {
    title: "AI & Agriculture",
    icon: Sprout,
    items: [
      { label: "AI Crop Advisory", icon: Sprout, href: "/advisory" },
      { label: "Disease Detection", icon: ScanLine, href: "/advisory" },
      { label: "Soil Health", icon: Layers, panel: "Soil Health" },
      { label: "Irrigation Management", icon: Droplets, panel: "Irrigation Management" },
      { label: "Weather & Alerts", icon: CloudSun, href: "/weather" },
    ],
  },
  {
    title: "Market & Business",
    icon: TrendingUp,
    items: [
      { label: "Mandi Prices", icon: TrendingUp, section: "#mandi" },
      { label: "Marketplace", icon: Store, href: "/marketplace" },
      { label: "My Orders & Sales", icon: ClipboardList, panel: "My Orders & Sales" },
      { label: "Expenses & Profit", icon: Wallet, panel: "Expenses & Profit" },
    ],
  },
  {
    title: "Farming Services",
    icon: Package,
    items: [
      { label: "Equipment Rental", icon: Package, href: "/equipment" },
      { label: "Transport Services", icon: Truck, href: "/transport" },
      { label: "Storage & Warehouse", icon: Warehouse, href: "/storage" },
      { label: "Farm Labour", icon: Users, panel: "Farm Labour" },
      { label: "Government Schemes", icon: BadgeCheck, panel: "Government Schemes" },
      { label: "Crop Insurance", icon: ShieldCheck, panel: "Crop Insurance" },
    ],
  },
  {
    title: "Community",
    icon: Users,
    items: [
      { label: "CenFriend", icon: Users, href: "/cenfriend" },
      { label: "Kisan Video Hub", icon: Play, panel: "Kisan Video Hub" },
      { label: "Farming Groups", icon: MessageSquare, panel: "Farming Groups" },
      { label: "Messages", icon: MessageSquare, panel: "Messages" },
      { label: "Notifications", icon: Bell, panel: "Notifications" },
    ],
  },
  {
    title: "My Account",
    icon: User,
    items: [
      { label: "Profile Overview", icon: User, panel: "My Profile" },
      { label: "Personal Information", icon: User, panel: "Personal Information" },
      { label: "Farming Information", icon: Tractor, panel: "Farming Information" },
      { label: "My Documents & KYC", icon: FileText, panel: "My Documents & KYC" },
      { label: "Language Settings", icon: Languages, panel: "Language Settings" },
      { label: "Notification Settings", icon: Bell, panel: "Notification Settings" },
      { label: "Privacy & Security", icon: Lock, panel: "Privacy & Security" },
      { label: "Help & Support", icon: Headphones, href: "tel:1800" },
      { label: "Account Management", icon: Settings, panel: "Account Management" },
    ],
  },
];

const QUICK_LINKS = [
  { label: "Crop Disease Help", icon: Leaf },
  { label: "Soil Health Tips", icon: Sprout },
  { label: "Farming Schemes", icon: BadgeCheck },
  { label: "Market Trends", icon: TrendingUp },
  { label: "Ask AI Assistant", icon: MessageSquare },
];

/**
 * Quick actions that belong on their own page go there; the rest open a short
 * guidance dialog on the dashboard.
 */
const QUICK_LINK_TARGETS: Record<string, string> = {
  "Crop Disease Help": "/advisory",
  "Ask AI Assistant": "/advisory",
  "Market Trends": "/marketplace",
};

const inr = (value: number) => `₹ ${value.toLocaleString("en-IN")}`;

/** Every place the search box can jump to, matched on label + keywords. */
const SEARCHABLE = [
  { label: "Mandi Prices", keywords: "price rates market mandi", section: "Mandi" },
  { label: "My Farm", keywords: "farm land acres plot", section: "Farms" },
  { label: "My Crops", keywords: "crops paddy potato mustard", section: "Farms" },
  { label: "Crop Disease Help", keywords: "disease pest blight insect", section: "Quick Actions" },
  { label: "Soil Health Tips", keywords: "soil ph fertiliser manure", section: "Quick Actions" },
  { label: "Farming Schemes", keywords: "scheme subsidy government pm kisan", section: "Quick Actions" },
  { label: "Market Trends", keywords: "trend chart forecast rate", section: "Quick Actions" },
  { label: "Ask AI Assistant", keywords: "ai assistant chat question", section: "Quick Actions" },
  { label: "Weather & Alerts", keywords: "weather rain forecast humidity", section: "Dashboard" },
  { label: "Kisan Video Hub", keywords: "video farming tutorial watch", section: "Dashboard" },
  { label: "My Profile", keywords: "profile account email phone edit", section: "Account" },
];

/** One entry in the bell menu; built from live weather and mandi state below. */
type Notification = {
  id: string;
  title: string;
  body: string;
  kind: "weather" | "price";
};

/** Generic accessible dialog used by every modal on the page. */
function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-dark/50 p-0 sm:items-center sm:p-4">
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
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <h2 className="font-display text-base font-bold text-forest">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
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

/* ── Small building blocks ────────────────────────────────────────── */

function CardHead({
  title,
  action,
  icon,
  onAction,
}: {
  title: string;
  action?: string;
  icon?: React.ReactNode;
  onAction?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-forest">
        {icon}
        {title}
      </h2>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function WeatherGlyph({ kind }: { kind: "sun" | "cloud" | "rain" }) {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true">
      {(kind === "sun" || kind === "cloud") && (
        <circle cx={kind === "cloud" ? 11 : 15} cy="8" r="5" fill="#fbbf24" />
      )}
      <ellipse cx="15" cy="17" rx="10" ry="6.5" fill="#cbd5e1" />
      <ellipse cx="10" cy="18" rx="6" ry="4.5" fill="#e2e8f0" />
      {kind === "rain" && (
        <g stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round">
          <line x1="11" y1="23" x2="10" y2="26" />
          <line x1="16" y1="23" x2="15" y2="26" />
          <line x1="21" y1="23" x2="20" y2="26" />
        </g>
      )}
    </svg>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function FarmerDashboard() {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * Desktop hover-to-open: the sidebar is a narrow icon rail normally and
   * expands when the cursor reaches the left edge. A short close delay stops
   * a jittery mouse from flickering it shut.
   */
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarHoverTimer = useRef<number | null>(null);
  /**
   * Which sidebar section is expanded on desktop. Only one open at a time keeps
   * the rail readable once all six groups are listed. `null` = all collapsed.
   */
  const [openGroup, setOpenGroup] = useState<string | null>("Farm Management");
  const [mandiTab, setMandiTab] = useState<MandiTab>("Top Commodities");
  const [farmTab, setFarmTab] = useState<"farms" | "crops" | "orders">("farms");

  // UI state for the interactive bits.
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [panel, setPanel] = useState<string | null>(null);
  const [video, setVideo] = useState<(typeof TRENDING)[number] | null>(null);
  const [mandiView, setMandiView] = useState<"table" | "all">("table");

  // Farms from Supabase.
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(true);
  const [farmError, setFarmError] = useState("");

  // Live weather for the farmer's district.
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [weatherError, setWeatherError] = useState("");

  // Live mandi prices for the farmer's district (falls back to the state).
  const [mandiPrices, setMandiPrices] = useState<MandiPrice[]>([]);
  const [mandiTotal, setMandiTotal] = useState(0);
  const [mandiState, setMandiState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [mandiError, setMandiError] = useState("");
  const [mandiArrival, setMandiArrival] = useState("");

  const [form, setForm] = useState({ name: "", location: "", acres: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  // Notifications come from live state: real forecast alerts, plus the best
  // price actually received for the farmer's district. Nothing is hardcoded.
  const notifications = useMemo<Notification[]>(() => {
    const items: Notification[] = [];
    for (const alert of deriveAlerts(weather).slice(0, 3)) {
      items.push({
        id: alert.id,
        title: alert.title,
        body: alert.body,
        kind: "weather",
      });
    }
    const best = mandiPrices[0];
    if (best?.modal_price != null) {
      items.push({
        id: `price-${best.commodity}-${best.market}`,
        title: `${best.commodity} at ₹${best.modal_price.toLocaleString("en-IN")}`,
        body: `Best modal price in ${best.market} mandi${best.district ? `, ${best.district}` : ""} today.`,
        kind: "price",
      });
    }
    return items;
  }, [weather, mandiPrices]);

  const unread = notifications.filter((n) => !seen.includes(n.id)).length;

  /** Opening any dialog dismisses the header popovers underneath it. */
  function openPanel(name: string) {
    setNotifOpen(false);
    setSearchOpen(false);
    setSettingsOpen(false);
    setPanel(name);
  }

  /** Load the user's farms once they are signed in. */
  const loadFarms = useCallback(async () => {
    setFarmsLoading(true);
    setFarmError("");
    try {
      setFarms(await listFarms());
    } catch (err) {
      setFarmError(
        err instanceof Error && /relation|does not exist/i.test(err.message)
          ? "The farms table is not set up yet. Run database/supabase/schema.sql in Supabase."
          : err instanceof Error
            ? err.message
            : "Could not load your farms."
      );
    } finally {
      setFarmsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadFarms();
  }, [user, loadFarms]);

  /** Close the search dropdown on an outside click. */
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

  // Signed-in farmers still finishing onboarding go back to the wizard.
  if (needsRole || needsDetails) {
    return <Navigate to="/complete-profile?next=/farmer-account" replace />;
  }

  // Only farmers belong on this page. Without this guard any role could reach
  // /farmer-account by URL (or an old restored URL) and see the farmer screen.
  if (profile?.role && profile.role !== "Farmer") {
    return <Navigate to={homeForRole(profile.role)} replace />;
  }

  const details = profile?.details ?? {};

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Farmer";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  // Signup writes location to auth metadata, older rows only have `details`.
  const locationDetails = useMemo(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const merged: Record<string, string> = { ...details };
    for (const key of LOCATION_FIELD_NAMES) {
      const fallback = meta[key];
      if (!merged[key] && typeof fallback === "string" && fallback.trim()) {
        merged[key] = fallback.trim();
      }
    }
    return merged;
  }, [details, user?.user_metadata]);

  const locationLine =
    [locationDetails.village, locationDetails.district].filter(Boolean).join(", ") ||
    formatLocation(locationDetails) ||
    "Location not set";

  const weatherDistrict = locationDetails.district;

  /** Fetch weather whenever the profile's district changes. */
  useEffect(() => {
    if (!weatherDistrict || !isWeatherConfigured) return;
    let alive = true;

    setWeatherState("loading");
    setWeatherError("");

    getWeather(weatherDistrict, locationDetails.state, locationDetails.village)
      .then((data) => {
        if (!alive) return;
        if (data) {
          setWeather(data);
          setWeatherState("ready");
        } else {
          setWeatherState("idle");
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setWeatherState("error");
        setWeatherError(err instanceof Error ? err.message : "Weather unavailable.");
      });

    return () => {
      alive = false;
    };
  }, [weatherDistrict, locationDetails.state, locationDetails.village]);

  /** Try the weather request again after a failure. */
  function retryWeather() {
    if (!weatherDistrict || !isWeatherConfigured) return;
    setWeatherState("loading");
    setWeatherError("");
    getWeather(weatherDistrict, locationDetails.state, locationDetails.village)
      .then((data) => {
        if (data) {
          setWeather(data);
          setWeatherState("ready");
        } else {
          setWeatherState("idle");
        }
      })
      .catch((err: unknown) => {
        setWeatherState("error");
        setWeatherError(err instanceof Error ? err.message : "Weather unavailable.");
      });
  }

  /**
   * Live mandi prices, scoped to the farmer's district and then their state.
   * A district often has only a handful of trades, so if it comes back empty
   * (or too thin to fill the tabs) we widen to the whole state.
   */
  const loadMandi = useCallback(async () => {
    setMandiState("loading");
    setMandiError("");
    try {
      let result = await getMandiPrices({
        district: locationDetails.district,
        state: locationDetails.state,
        limit: 200,
      });
      if (result.records.length < 12 && locationDetails.state) {
        result = await getMandiPrices({ state: locationDetails.state, limit: 300 });
      } else if (result.records.length === 0) {
        result = await getMandiPrices({ limit: 200 });
      }
      setMandiPrices(result.records);
      setMandiTotal(result.total);
      setMandiArrival(result.records[0]?.arrival_date ?? "");
      setMandiState("ready");
    } catch (err) {
      setMandiPrices([]);
      setMandiState("error");
      setMandiError(mandiErrorMessage(err));
    }
  }, [locationDetails.district, locationDetails.state]);

  /** Fetch prices once the profile has a location; refetch when it changes. */
  useEffect(() => {
    if (!locationDetails.district && !locationDetails.state) {
      setMandiState("idle");
      return;
    }
    void loadMandi();
  }, [loadMandi, locationDetails.district, locationDetails.state]);

  // Farm answers come from the role questions saved during onboarding.
  const farmFields = (profile?.role && profile.role in ROLE_FIELDS
    ? ROLE_FIELDS[profile.role as UserRole]
    : []
  ).filter((field) => details[field.name] && !LOCATION_FIELD_NAMES.includes(field.name));

  const crops =
    details.main_crops
      ?.split(",")
      .map((crop) => crop.trim())
      .filter(Boolean) ?? [];

  // Live mandi prices: best rows per tab, and every fetched record for "View all".
  const mandiRows = useMemo(
    () => rowsForTab(mandiPrices, mandiTab),
    [mandiPrices, mandiTab]
  );
  const mandiAll = useMemo(() => rowsForTab(mandiPrices, "Top Commodities"), [mandiPrices]);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  /** Search results for whatever is typed in the top bar. */
  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return SEARCHABLE.filter(
      (item) =>
        item.label.toLowerCase().includes(term) || item.keywords.includes(term)
    ).slice(0, 6);
  }, [query]);

  /** Run a search result: jump to the matching section or open its panel. */
  function goTo(label: string) {
    setSearchOpen(false);
    setQuery("");
    const quick = QUICK_LINKS.find((q) => q.label === label);
    if (quick) return openPanel(quick.label);
    if (label === "My Farm") {
      setFarmTab("farms");
      return scrollTo("#my-farm");
    }
    if (label === "My Crops") {
      setFarmTab("crops");
      return scrollTo("#my-farm");
    }
    if (label === "Mandi Prices") return scrollTo("#mandi");
    if (label === "My Profile") return openPanel("My Profile");
    if (label === "Weather & Alerts") return navigate("/weather");
    if (label === "Kisan Video Hub") return openPanel("Kisan Video Hub");
    scrollTo("#videos");
  }

  function scrollTo(selector: string) {
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** One section expands at a time on the desktop rail. */
  function toggleGroup(title: string) {
    setOpenGroup((current) => (current === title ? null : title));
  }

  /** A sidebar item is active on its own route or when its block is open. */
  function isNavActive(item: NavItem) {
    if (item.href && !item.href.startsWith("tel:")) {
      return item.href.split("#")[0] === pathname;
    }
    if (item.section) return `#${hash.replace("#", "")}` === item.section;
    if (item.panel) return panel === item.panel;
    return false;
  }

  /** Routes navigate, anchors scroll, everything else opens its panel. */
  function handleNavItem(item: NavItem) {
    setSidebarOpen(false);
    if (item.section) scrollTo(item.section);
    else if (item.panel) openPanel(item.panel);
  }

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

  // Clear a pending hover timer when the page unmounts.
  useEffect(() => {
    return () => {
      if (sidebarHoverTimer.current) window.clearTimeout(sidebarHoverTimer.current);
    };
  }, []);

  function openFarmForm(farm?: Farm) {
    setFarmError("");
    if (farm) {
      setEditingId(farm.id);
      setForm({
        name: farm.name,
        location: farm.location ?? "",
        acres: farm.area_ha != null ? String(haToAcres(farm.area_ha)) : "",
      });
    } else {
      setEditingId(null);
      setForm({ name: "", location: locationLine, acres: "" });
    }
    openPanel("My Farm");
  }

  async function handleSaveFarm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFarmError("Give your farm a name.");
      return;
    }
    const acres = form.acres ? Number(form.acres) : NaN;
    if (form.acres && (Number.isNaN(acres) || acres <= 0)) {
      setFarmError("Enter the area in acres (a positive number).");
      return;
    }

    setSaving(true);
    setFarmError("");
    try {
      await saveFarm(
        {
          name: form.name,
          location: form.location || null,
          area_ha: form.acres ? acresToHa(acres) : null,
        },
        editingId ?? undefined
      );
      await loadFarms();
      setPanel(null);
      setFarmTab("farms");
    } catch (err) {
      setFarmError(err instanceof Error ? err.message : "Could not save the farm.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFarm(id: string) {
    if (!window.confirm("Delete this farm? This cannot be undone.")) return;
    setFarmError("");
    try {
      await deleteFarm(id);
      await loadFarms();
    } catch (err) {
      setFarmError(err instanceof Error ? err.message : "Could not delete the farm.");
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="flex">
        {/* ── Sidebar ── */}
        {/* Hover strip at the very edge of the screen: easer to hit than the rail. */}
        <div
          aria-hidden="true"
          onMouseEnter={handleSidebarEnter}
          className="fixed inset-y-0 left-0 z-30 hidden w-3 lg:block"
        />

        <aside
          onMouseEnter={handleSidebarEnter}
          onMouseLeave={handleSidebarLeave}
          onFocusCapture={handleSidebarEnter}
          className={`fixed inset-y-0 left-0 z-40 shrink-0 overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } ${sidebarHovered ? "w-64" : "w-64 lg:w-16"}`}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            <Logo />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1 p-3" aria-label="Farmer">
            {SIDEBAR_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              // The lone "Dashboard" entry has no heading of its own.
              if (!group.title) {
                const item = group.items[0];
                const active = panel === null && !hash || hash === "";
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    onClick={() => handleNavItem(item)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition ${active
                      ? "bg-brand-700 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-forest"
                      } ${sidebarHovered ? "" : "lg:justify-center"}`}
                  >
                    <GroupIcon className="h-[18px] w-[18px] shrink-0" />
                    <span className={`truncate ${sidebarHovered ? "" : "lg:hidden"}`}>
                      {item.label}
                    </span>
                  </button>
                );
              }

              return (
                <div key={group.title} className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title!)}
                    title={group.title}
                    aria-expanded={openGroup === group.title}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition hover:bg-slate-100 ${sidebarHovered ? "" : "lg:justify-center"
                      }`}
                  >
                    <GroupIcon className="h-[18px] w-[18px] shrink-0 text-brand-700" />
                    <span className={`flex-1 truncate text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 ${sidebarHovered ? "" : "lg:hidden"
                      }`}>
                      {group.title}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${openGroup === group.title ? "rotate-180" : ""
                        } ${sidebarHovered ? "" : "lg:hidden"}`}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-[max-height] duration-200 ${openGroup === group.title ? "max-h-96" : "max-h-0"
                      } ${sidebarHovered ? "" : "lg:hidden"}`}
                  >
                    <div className="mt-0.5 space-y-0.5 border-l border-slate-200 pl-2.5 ml-4">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isNavActive(item);
                        const itemClass = `flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition ${active
                          ? "bg-brand-50 text-brand-800"
                          : "text-slate-600 hover:bg-slate-100 hover:text-forest"
                          }`;

                        if (item.href?.startsWith("tel:")) {
                          return (
                            <a key={item.label} href={item.href} className={itemClass}>
                              <ItemIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </a>
                          );
                        }
                        if (item.href) {
                          return (
                            <Link key={item.label} to={item.href} className={itemClass} title={item.label}>
                              <ItemIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          );
                        }
                        return (
                          <button
                            key={item.label}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            className={itemClass}
                            title={item.label}
                            onClick={() => handleNavItem(item)}
                          >
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
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
                    aria-label="Search the dashboard"
                    aria-expanded={searchOpen && query.trim().length > 0}
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
                    {searchResults.length === 0 ? (
                      <li className="px-3.5 py-3 text-xs text-slate-500">
                        No matches for “{query.trim()}”.
                      </li>
                    ) : (
                      searchResults.map((result) => (
                        <li key={result.label}>
                          <button
                            type="button"
                            onClick={() => goTo(result.label)}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs hover:bg-slate-50"
                          >
                            <span className="font-semibold text-forest">{result.label}</span>
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                              {result.section}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
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
                            No alerts right now. You&apos;ll see forecast and price updates here.
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
                              {n.kind === "price" ? (
                                <TrendingUp className="h-3.5 w-3.5 text-brand-700" />
                              ) : (
                                <CloudSun className="h-3.5 w-3.5 text-brand-700" />
                              )}
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
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSettingsOpen(false);
                          openPanel("My Profile");
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-forest"
                      >
                        <User className="h-[18px] w-[18px] shrink-0" />
                        Edit profile
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSettingsOpen(false);
                          handleSignOut();
                        }}
                        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3.5 py-2.5 text-left text-[13px] font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <LogOut className="h-[18px] w-[18px] shrink-0" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openPanel("My Profile")}
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
                </button>
              </div>
            </div>
          </header>

          <main className="space-y-5 p-4 sm:p-6">
            {/* Hero + weather */}
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
                    <MapPin className="h-3.5 w-3.5" />
                    {locationLine}
                  </p>
                  <h1 className="mt-3 font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
                    {greeting}, {name.split(" ")[0]}! 🌱
                  </h1>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/80">
                    Your farm is doing well. Here is what needs your attention today.
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">
                  <div className="rounded-xl bg-white/10 p-3.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                      <CloudSun className="h-3.5 w-3.5" /> Today
                      {weatherState === "loading" && (
                        <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-white/70" />
                      )}
                    </p>

                    {weather ? (
                      <>
                        <p className="mt-1.5 flex items-baseline gap-1.5 font-display text-2xl font-extrabold">
                          {weather.temp}°C
                          <span className="text-xs font-medium capitalize text-white/70">
                            {titleCase(weather.description)}
                          </span>
                        </p>
                        <p className="mt-1 flex gap-3 text-[11px] text-white/70">
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="h-3 w-3" /> {weather.humidity}%
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Wind className="h-3 w-3" /> {weather.windKph} km/h
                          </span>
                          <span className="text-white/50">feels {weather.feelsLike}°</span>
                        </p>
                      </>
                    ) : weatherState === "error" ? (
                      <div className="mt-1.5 max-w-[220px]">
                        <p className="text-xs font-semibold text-white/85">
                          Weather unavailable
                        </p>
                        <button
                          type="button"
                          onClick={retryWeather}
                          className="mt-1 text-[11px] font-semibold underline decoration-white/40 hover:decoration-white"
                        >
                          Retry
                        </button>
                        <p className="mt-1 text-[10px] leading-snug text-white/50">
                          {weatherError}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 max-w-[220px] text-[11px] leading-relaxed text-white/70">
                        {isWeatherConfigured
                          ? `Loading weather for ${weatherDistrict ?? "your district"}…`
                          : "Add a district to your profile to see live weather."}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-white/10 px-3.5 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                      5-day forecast
                    </p>
                    <div className="mt-2 flex gap-3">
                      {(weather?.forecast.length ? weather.forecast : FALLBACK_FORECAST).map(
                        (day) => (
                          <div key={day.date} className="text-center" title={day.description}>
                            <p className="text-[10px] font-semibold text-white/70">{day.day}</p>
                            <WeatherGlyph kind={day.icon === "mist" || day.icon === "snow" ? "cloud" : day.icon === "storm" ? "rain" : day.icon} />
                            <p className="text-[11px] font-bold">
                              {day.temp == null ? "—" : `${day.temp}°`}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick actions */}
            <section>
              <CardHead title="Quick Actions" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {QUICK_LINKS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const link = QUICK_LINK_TARGETS[label];
                      if (link) navigate(link);
                      else openPanel(label);
                    }}
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

            <div className="grid gap-5 xl:grid-cols-3">
              {/* Mandi prices */}
              <section id="mandi" className="card scroll-mt-20 p-4 sm:p-5 xl:col-span-2">
                <CardHead
                  title="Today's Mandi Prices"
                  icon={<TrendingUp className="h-4 w-4 text-brand-700" />}
                  action={mandiView === "all" ? "Top only" : "View all"}
                  onAction={() => setMandiView((v) => (v === "all" ? "table" : "all"))}
                />

                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    {mandiState === "loading" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                        Fetching live rates…
                      </span>
                    ) : (
                      <>
                        <MapPin className="h-3 w-3 text-brand-600" />
                        {locationDetails.district || locationDetails.state || "India"}
                        {mandiArrival && <> · arrival {arrivalLabel(mandiArrival)}</>}
                        {mandiTotal > 0 && <> · {mandiTotal.toLocaleString("en-IN")} trades</>}
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live · data.gov.in
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadMandi()}
                      disabled={mandiState === "loading"}
                      className="text-[11px] font-semibold text-brand-700 hover:underline disabled:opacity-40"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-none">
                  {MANDI_TABS.map((tab) => {
                    const count = rowsForTab(mandiPrices, tab).length;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setMandiTab(tab)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${mandiTab === tab
                            ? "bg-brand-700 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                      >
                        {tab}
                        {mandiState === "ready" && count > 0 && (
                          <span className="ml-1 opacity-70">{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {mandiState === "error" ? (
                  <div className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-3">
                    <p className="text-xs font-semibold text-red-700">
                      Could not load live mandi prices
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-red-600">
                      {mandiError}
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadMandi()}
                      className="mt-2 text-[11px] font-bold text-red-700 underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : mandiState === "idle" ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
                    Add your state and district in your profile to see live rates from nearby
                    mandis.
                  </p>
                ) : mandiState === "loading" && mandiPrices.length === 0 ? (
                  <ul className="space-y-2 py-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <li
                        key={i}
                        className="h-8 animate-pulse rounded-md bg-slate-100"
                        style={{ opacity: 1 - i * 0.15 }}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                          <th className="pb-2 font-semibold">Commodity</th>
                          <th className="pb-2 font-semibold">Mandi</th>
                          <th className="pb-2 text-right font-semibold">Modal price</th>
                          <th className="pb-2 text-right font-semibold">Range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(mandiView === "all" ? mandiAll : mandiRows)
                          .slice(0, mandiView === "all" ? 40 : 8)
                          .map((row) => (
                            <tr
                              key={`${row.commodity}-${row.market}-${row.grade}`}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="py-2.5 pr-3 font-semibold text-forest">
                                {titleCase(row.commodity)}
                                {row.grade && row.grade !== "FAQ" && (
                                  <span className="ml-1 text-[10px] font-medium text-slate-400">
                                    {row.grade}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 text-slate-500">
                                <span className="block truncate">{row.market}</span>
                                <span className="block text-[10px] text-slate-400">
                                  {row.district}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-semibold text-forest">
                                {row.modal_price != null ? inr(row.modal_price) : "—"}
                              </td>
                              <td className="py-2.5 text-right text-[11px] text-slate-500">
                                {row.min_price != null && row.max_price != null
                                  ? `${row.min_price.toLocaleString("en-IN")}–${row.max_price.toLocaleString("en-IN")}`
                                  : "—"}
                                <span className="block text-[10px] text-slate-400">per quintal</span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>

                    {(mandiView === "all" ? mandiAll : mandiRows).length === 0 && (
                      <p className="py-2 text-xs text-slate-500">
                        No {mandiTab.toLowerCase()} trades reported in your area today.
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Right column */}
              <div className="space-y-5">
                <section id="my-farm" className="card scroll-mt-20 overflow-hidden">
                  <div className="flex gap-1 border-b border-slate-200 px-3 pt-3">
                    {(["farms", "crops", "orders"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setFarmTab(tab)}
                        className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold capitalize transition ${farmTab === tab
                            ? "border-brand-700 text-brand-800"
                            : "border-transparent text-slate-500 hover:text-forest"
                          }`}
                      >
                        My {tab}
                      </button>
                    ))}
                  </div>

                  <div className="p-4">
                    {farmTab === "farms" && (
                      <div className="space-y-3">
                        {farmsLoading && (
                          <p className="text-xs text-slate-500">Loading your farms…</p>
                        )}

                        {!farmsLoading && farms.length === 0 && (
                          <p className="text-xs text-slate-500">
                            No farms added yet. Add one to get area-based advisories and
                            mandi price alerts.
                          </p>
                        )}

                        {farms.map((farm) => (
                          <div
                            key={farm.id}
                            className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="flex items-center gap-1.5 text-xs font-bold text-forest">
                                <Tractor className="h-3.5 w-3.5 text-brand-700" />
                                {farm.name}
                              </p>
                              <div className="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  onClick={() => openFarmForm(farm)}
                                  className="text-[11px] font-semibold text-brand-700 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFarm(farm.id)}
                                  className="text-[11px] font-semibold text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {farm.location || locationLine}
                              {farm.area_ha != null && (
                                <>
                                  {" · "}
                                  {haToAcres(farm.area_ha)} acres
                                </>
                              )}
                            </p>
                          </div>
                        ))}

                        {farmFields.length > 0 && (
                          <dl className="space-y-2 border-t border-slate-100 pt-2">
                            {farmFields.slice(0, 3).map((field) => (
                              <div
                                key={field.name}
                                className="flex items-start justify-between gap-3"
                              >
                                <dt className="text-xs text-slate-500">{field.label}</dt>
                                <dd className="text-right text-xs font-semibold text-forest">
                                  {details[field.name]}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}

                        <button
                          type="button"
                          onClick={() => openFarmForm()}
                          className="w-full rounded-lg border border-dashed border-brand-300 py-2 text-xs font-semibold text-brand-800 transition hover:bg-brand-50"
                        >
                          + Add farm
                        </button>
                      </div>
                    )}

                    {farmTab === "crops" && (
                      <div className="flex flex-wrap gap-1.5">
                        {crops.length === 0 && (
                          <p className="text-xs text-slate-500">No crops added yet.</p>
                        )}
                        {crops.map((crop) => (
                          <span
                            key={crop}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800"
                          >
                            <Leaf className="h-3 w-3" /> {crop}
                          </span>
                        ))}
                      </div>
                    )}

                    {farmTab === "orders" && (
                      <p className="text-xs text-slate-500">
                        No orders yet. Your marketplace purchases will appear here.
                      </p>
                    )}
                  </div>
                </section>

                <section className="rounded-xl2 border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 text-[13px] font-bold text-amber-900">
                    <Bell className="h-4 w-4" /> Today&apos;s advisory
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
                    Light rain expected Tuesday. Consider delaying urea top-dressing by a day and
                    check for leaf blight in paddy.
                  </p>
                  <button
                    type="button"
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:underline"
                  >
                    Read full advisory <ArrowRight className="h-3 w-3" />
                  </button>
                </section>
              </div>
            </div>

            {/* Video hub */}
            <section id="videos" className="scroll-mt-20">
              <CardHead
                title="Trending in Kisan Video Hub"
                action="Browse all"
                onAction={() => setPanel("Kisan Video Hub")}
                icon={<BookOpen className="h-4 w-4 text-brand-700" />}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {TRENDING.map((video) => (
                  <article
                    key={video.title}
                    role="button"
                    tabIndex={0}
                    aria-label={`Play ${video.title}`}
                    onClick={() => setVideo(video)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setVideo(video);
                    }}
                    className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-card"
                  >
                    <div className="relative aspect-video overflow-hidden bg-slate-100">
                      <img
                        src={video.poster}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-forest shadow-sm">
                          <Play className="ml-0.5 h-4 w-4 fill-current" />
                        </span>
                      </span>
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {video.time}
                      </span>
                    </div>
                    <div className="p-3">
                      <h3 className="text-[13px] font-semibold leading-snug text-forest">
                        {video.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {video.views} · {video.age}
                      </p>
                      <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" /> {video.likes}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> {video.comments}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <footer className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">
                Signed in as{" "}
                <span className="font-semibold text-forest">{profile?.email ?? user?.email}</span>
                {" · "}
                <button
                  type="button"
                  onClick={() => openPanel("My Profile")}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  Edit profile
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  Sign out
                </button>
              </p>
            </footer>
          </main>
        </div>
      </div>

      {/* ── Farm add/edit dialog ── */}
      {panel === "My Farm" && (
        <Modal title={editingId ? "Edit farm" : "Add a farm"} onClose={() => setPanel(null)}>
          <form onSubmit={handleSaveFarm} className="space-y-4">
            <div>
              <label htmlFor="farm-name" className="mb-1.5 block text-sm font-semibold text-forest">
                Farm name
              </label>
              <input
                id="farm-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Mondal Para field"
                className="h-11 w-full rounded-lg border border-slate-300 px-3.5 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
              />
            </div>
            <div>
              <label htmlFor="farm-loc" className="mb-1.5 block text-sm font-semibold text-forest">
                Location <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="farm-loc"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder={locationLine}
                className="h-11 w-full rounded-lg border border-slate-300 px-3.5 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
              />
            </div>
            <div>
              <label htmlFor="farm-acres" className="mb-1.5 block text-sm font-semibold text-forest">
                Area (acres) <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="farm-acres"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={form.acres}
                onChange={(e) => setForm((f) => ({ ...f, acres: e.target.value }))}
                placeholder="e.g. 2.5"
                className="h-11 w-full rounded-lg border border-slate-300 px-3.5 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
              />
            </div>

            {farmError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {farmError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary h-10 disabled:opacity-70"
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Add farm"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Profile dialog ── */}
      {panel === "My Profile" && (
        <Modal title="My profile" onClose={() => setPanel(null)}>
          <dl className="space-y-3">
            {[
              ["Name", name],
              ["Email", profile?.email ?? user?.email ?? "—"],
              ["Mobile", profile?.phone || "Not added"],
              ["Role", profile?.role ?? "—"],
              ["State", locationDetails.state || "—"],
              ["District", locationDetails.district || "—"],
              ["Village / Block", locationDetails.village || "—"],
              ["Farms", String(farms.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="max-w-[60%] break-words text-right text-xs font-semibold text-forest">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <Link
            to="/complete-profile?next=/farmer-account"
            className="btn-primary mt-5 h-10 w-full text-sm"
          >
            Update my details
          </Link>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Change crops, land size and irrigation questions.
          </p>
        </Modal>
      )}

      {/* ── Video player dialog ── */}
      {video && (
        <Modal title={video.title} onClose={() => setVideo(null)} wide>
          <div className="overflow-hidden rounded-lg bg-black">
            <img src={video.poster} alt="" className="aspect-video w-full object-cover opacity-95" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {video.views} · {video.age} · {video.time}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Walk through the practical steps, common mistakes and the tools you need —
            explained for small and marginal farmers. Full playback arrives with the
            video backend.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800">
              <ThumbsUp className="h-3.5 w-3.5" /> {video.likes} likes
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              <MessageSquare className="h-3.5 w-3.5" /> {video.comments} comments
            </span>
          </div>
        </Modal>
      )}

      {/* ── Quick-action dialog ── */}
      {panel && QUICK_LINKS.some((q) => q.label === panel) && (
        <Modal title={panel} onClose={() => setPanel(null)}>
          <p className="text-sm leading-relaxed text-slate-600">{QUICK_TEXT[panel]}</p>
          <ul className="mt-4 space-y-2">
            {QUICK_BULLETS[panel].map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
                <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
                {item}
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {/* ── Video hub dialog ── */}
      {panel === "Kisan Video Hub" && (
        <Modal title="Kisan Video Hub" onClose={() => setPanel(null)} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            {TRENDING.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => {
                  setPanel(null);
                  setVideo(item);
                }}
                className="flex gap-3 rounded-lg border border-slate-200 p-2 text-left hover:border-brand-300"
              >
                <img src={item.poster} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-forest">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {item.views} · {item.time}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

const QUICK_TEXT: Record<string, string> = {
  "Crop Disease Help":
    "Spot a problem on your crop? Start with the symptoms below, then share a photo with the advisory team for a confirmed diagnosis.",
  "Soil Health Tips":
    "Healthy soil is the cheapest yield boost there is. These are the checks worth doing this season.",
  "Farming Schemes":
    "Government support you may qualify for, based on the state and district on your profile.",
  "Market Trends":
    "Where your crops are headed over the next few weeks, based on recent mandi arrivals.",
  "Ask AI Assistant":
    "Ask anything about your crop, weather, or prices in Bengali, Hindi or English. The assistant uses your farm profile for context.",
};

const QUICK_BULLETS: Record<string, string[]> = {
  "Crop Disease Help": [
    "Yellowing between leaf veins usually means a nutrient deficiency, not disease",
    "Brown spots with a grey centre in paddy often point to blast",
    "Avoid spraying within 24 hours of expected rain",
    "Keep affected leaves away from healthy rows",
  ],
  "Soil Health Tips": [
    "Test pH once a season — most crops prefer 6.0–7.0",
    "Add organic matter every year to hold moisture",
    "Rotate crops to break pest and disease cycles",
    "Avoid tilling wet soil; it compacts badly",
  ],
  "Farming Schemes": [
    "PM-KISAN — income support in three instalments",
    "PM Fasal Bima Yojana — crop insurance",
    "Kisan Credit Card — short-term working capital",
    "Soil Health Card — free soil testing",
  ],
  "Market Trends": [
    "Vegetable prices peak in the 2–3 weeks before a major festival",
    "Arrivals usually rise after a dry spell ends",
    "Grade your produce — graded lots fetch 10–15% more",
    "Check the mandi nearest to you first; freight can outweigh the difference",
  ],
  "Ask AI Assistant": [
    "Describe the field, crop stage and what you have already tried",
    "Ask one clear question at a time for the best answer",
    "Mention the day of sowing for stage-specific advice",
    "Always confirm chemical doses with your local dealer",
  ],
};
