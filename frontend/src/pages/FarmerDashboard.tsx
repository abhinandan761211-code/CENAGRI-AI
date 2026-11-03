import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CloudSun,
  Droplets,
  Leaf,
  MapPin,
  MessageSquare,
  Play,
  Sprout,
  ThumbsUp,
  Tractor,
  TrendingUp,
  Wind,
  X,
} from "lucide-react";
import { FarmerShell } from "@/components/farm/FarmerShell";
import FarmerDashboardBody from "@/components/farm/FarmerDashboardBody";
import { renderFarmerPanel } from "@/components/farm/farmerPanels";
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

/** One entry in the bell menu; built from live weather and mandi state below. */
type Notification = {
  id: string;
  title: string;
  body: string;
  kind: "weather" | "price";
};

/* ── Small building blocks ────────────────────────────────────────── */

/** Section heading row with an optional right-hand action. */
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
      <h2 className="flex items-center gap-2 text-sm font-bold text-forest">
        {icon}
        {title}
      </h2>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-700"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Accessible dialog used by every dashboard popup. */
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
        className={`creator-card relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl shadow-xl sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
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

/**
 * Farmer dashboard.
 *
 * Only the page BODY lives here: the dark sidebar, header, search and bell come
 * from `<FarmerShell>`, so this screen, every feature page and the account
 * pages all share exactly one chrome in the creator-studio style.
 */
export default function FarmerDashboard() {
  return <FarmerDashboardBody />;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
function LegacyFarmerDashboardBody() {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();

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

  /**
   * Crops shown on the dashboard: what the farms actually record, plus the
   * crops given at signup. Reading only the onboarding answer meant a farm's
   * own crops never appeared here.
   */
  const crops = useMemo(() => {
    const fromFarms = farms.flatMap((farm) => farm.crops ?? []);
    const fromProfile =
      details.main_crops?.split(",").map((crop) => crop.trim()) ?? [];
    return Array.from(new Set([...fromFarms, ...fromProfile].filter(Boolean)));
  }, [farms, details.main_crops]);

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
    <>
      <div className="space-y-5">
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
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                      <CloudSun className="h-3.5 w-3.5" /> Today
                      {weatherState === "loading" && (
                        <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-white/70" />
                      )}
                    </p>

                    {weather ? (
                      <>
                        <p className="mt-1.5 flex items-baseline gap-1.5 font-display text-2xl font-extrabold">
                          {weather.temp}°C
                          <span className="text-xs font-medium capitalize text-white/80">
                            {titleCase(weather.description)}
                          </span>
                        </p>
                        <p className="mt-1 flex gap-3 text-[11px] text-white/80">
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="h-3 w-3" /> {weather.humidity}%
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Wind className="h-3 w-3" /> {weather.windKph} km/h
                          </span>
                          <span className="text-white/60">feels {weather.feelsLike}°</span>
                        </p>
                      </>
                    ) : weatherState === "error" ? (
                      <div className="mt-1.5 max-w-[220px]">
                        <p className="text-xs font-semibold text-white/80">
                          Weather unavailable
                        </p>
                        <button
                          type="button"
                          onClick={retryWeather}
                          className="mt-1 text-[11px] font-semibold underline decoration-white/40 hover:decoration-white"
                        >
                          Retry
                        </button>
                        <p className="mt-1 text-[10px] leading-snug text-white/80">
                          {weatherError}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 max-w-[220px] text-[11px] leading-relaxed text-white/80">
                        {isWeatherConfigured
                          ? `Loading weather for ${weatherDistrict ?? "your district"}…`
                          : "Add a district to your profile to see live weather."}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-white/10 px-3.5 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
                      5-day forecast
                    </p>
                    <div className="mt-2 flex gap-3">
                      {(weather?.forecast.length ? weather.forecast : FALLBACK_FORECAST).map(
                        (day) => (
                          <div key={day.date} className="text-center" title={day.description}>
                            <p className="text-[10px] font-semibold text-white/80">{day.day}</p>
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
                    className="creator-card creator-card-hover group p-4 text-center"
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
              <section id="mandi" className="card min-w-0 scroll-mt-20 p-4 sm:p-5 xl:col-span-2">
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
                        <MapPin className="h-3 w-3 text-brand-700" />
                        {locationDetails.district || locationDetails.state || "India"}
                        {mandiArrival && <> · arrival {arrivalLabel(mandiArrival)}</>}
                        {mandiTotal > 0 && <> · {mandiTotal.toLocaleString("en-IN")} trades</>}
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
                    <p className="text-xs font-semibold text-rose-700">
                      Could not load live mandi prices
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-rose-600">
                      {mandiError}
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadMandi()}
                      className="mt-2 text-[11px] font-bold text-rose-700 underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : mandiState === "idle" ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-3 text-xs text-slate-500">
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
                              className="border-b border-slate-200 last:border-0"
                            >
                              <td className="py-2.5 pr-3 font-semibold text-forest">
                                {titleCase(row.commodity)}
                                {row.grade && row.grade !== "FAQ" && (
                                  <span className="ml-1 text-[10px] font-medium text-slate-500">
                                    {row.grade}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 text-slate-500">
                                <span className="block truncate">{row.market}</span>
                                <span className="block text-[10px] text-slate-500">
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
                                <span className="block text-[10px] text-slate-500">per quintal</span>
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
                            ? "border-brand-700 text-brand-700"
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
                            className="rounded-lg border border-slate-200 bg-slate-100 p-3"
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
                                  className="text-[11px] font-semibold text-rose-600 hover:underline"
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
                          <dl className="space-y-2 border-t border-slate-200 pt-2">
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
                          className="w-full rounded-lg border border-dashed border-brand-300 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                        >
                          + Add farm
                        </button>
                      </div>
                    )}

                    {farmTab === "crops" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                          {crops.length === 0 && (
                            <p className="text-xs text-slate-500">No crops added yet.</p>
                          )}
                          {crops.map((crop) => (
                            <span
                              key={crop}
                              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700"
                            >
                              <Leaf className="h-3 w-3" /> {crop}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-2">
                          <button
                            type="button"
                            onClick={() => navigate("/crops")}
                            className="text-[11px] font-semibold text-brand-700 hover:underline"
                          >
                            Manage crops
                          </button>
                          <span className="text-[11px] text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => navigate("/advisory")}
                            className="text-[11px] font-semibold text-brand-700 hover:underline"
                          >
                            Get advice for these crops
                          </button>
                        </div>
                      </div>
                    )}

                    {farmTab === "orders" && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">
                          No orders yet. Your marketplace purchases will appear here.
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate("/marketplace")}
                          className="text-[11px] font-semibold text-brand-700 hover:underline"
                        >
                          Browse the marketplace
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {/* Alerts are derived from the live forecast, never hand-written. */}
                <section className="rounded-xl2 border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 text-[13px] font-bold text-amber-900">
                    <Bell className="h-4 w-4" /> Today&apos;s advisory
                  </p>
                  {notifications.length === 0 ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
                      {weatherState === "ready"
                        ? "Nothing in the forecast crosses the rain, heat, cold or wind thresholds. Carry on with your usual schedule."
                        : "Add your district to your profile to get forecast-based advisories here."}
                    </p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5">
                      {notifications.slice(0, 2).map((n) => (
                        <li key={n.id} className="text-xs leading-relaxed text-amber-800">
                          <span className="font-semibold">{n.title}.</span> {n.body}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate("/weather")}
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:underline"
                  >
                    See full forecast &amp; alerts <ArrowRight className="h-3 w-3" />
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
                    className="group cursor-pointer overflow-hidden creator-card-hover rounded-xl p-4 transition hover:shadow-card"
                  >
                    <div className="relative aspect-video overflow-hidden bg-slate-100">
                      <img
                        src={video.poster}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-700 text-white shadow-sm">
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

            <footer className="creator-card p-4">
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
                className="creator-input h-11"
              />
            </div>
            <div>
              <label htmlFor="farm-loc" className="mb-1.5 block text-sm font-semibold text-forest">
                Location <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="farm-loc"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder={locationLine}
                className="creator-input h-11"
              />
            </div>
            <div>
              <label htmlFor="farm-acres" className="mb-1.5 block text-sm font-semibold text-forest">
                Area (acres) <span className="font-normal text-slate-500">(optional)</span>
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
                className="creator-input h-11"
              />
            </div>

            {farmError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-rose-700">
                {farmError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="creator-btn-ghost h-9 px-4 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="creator-btn-primary h-10 disabled:opacity-70"
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
              <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-200 pb-2 last:border-0">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="max-w-[60%] break-words text-right text-xs font-semibold text-forest">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <Link
            to="/complete-profile?next=/farmer-account"
            className="creator-btn-primary mt-5 h-10 w-full text-sm"
          >
            Update my details
          </Link>
          <p className="mt-2 text-center text-[11px] text-slate-500">
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
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <ThumbsUp className="h-3.5 w-3.5" /> {video.likes} likes
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              <MessageSquare className="h-3.5 w-3.5" /> {video.comments} comments
            </span>
          </div>
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
    </>
  );
}
