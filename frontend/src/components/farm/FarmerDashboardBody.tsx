import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CloudRain,
  CloudSun,
  Droplets,
  HardHat,
  Leaf,
  MapPin,
  MessageSquare,
  Package,
  Play,
  ScanLine,
  Send,
  ShoppingBag,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wheat,
  Wind,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import FarmerShell from "@/components/farm/FarmerShell";
import { useLang } from "@/i18n/LanguageContext";
import { listFarms, haToAcres } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import { advisoryLanguage } from "@/lib/advisoryLanguage";
import { listActivities, listTasks } from "@/lib/farmer";
import type { FarmActivity, FarmerTask } from "@/lib/farmer";
import { getOverview, isFarmerApiConfigured, overviewFromSupabase } from "@/lib/farmerApi";
import type { Overview } from "@/lib/farmerApi";
import { askAdvisory } from "@/lib/advisory";
import type { AdvisoryAnswer } from "@/lib/advisory";
import { getMandiPrices, rowsForTab } from "@/lib/mandi";
import type { MandiPrice } from "@/lib/mandi";
import { deriveAlerts, getWeather, isWeatherConfigured, titleCase } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";

import {
  Chip,
  EmptyState,
  ErrorNote,
  inr,
  LoadingRows,
  Modal,
  num,
  Panel,
  PrimaryButton,
  ProgressBar,
  relativeDays,
  shortDate,
  SourceChip,
  Stat,
  Textarea,
  Toast,
  useToast,
  ViewAll,
} from "@/components/farm/farmerUI";

/**
 * Farmer dashboard — the overview screen.
 *
 * Every figure comes from a real source and is labelled:
 *   • farms / crops / tasks / expenses → the farmer's own rows (Supabase, or
 *     the Kalika server when it is configured — the badge says which)
 *   • weather                          → live forecast for the farmer's district
 *   • mandi                            → live price feed for the district
 *   • AI answers                       → labelled "AI" or "Rule-based"
 *
 * With nothing recorded yet the page shows a genuine empty state instead of
 * sample numbers. No invented statistics, no fake weather.
 */
export default function FarmerDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { toast } = useToast();

  const details = profile?.details ?? {};
  const district = details.district;

  /* ── Overview data ─────────────────────────────────────────────────── */

  const [overview, setOverview] = useState<Overview | null>(null);
  const [source, setSource] = useState<"server" | "local" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [farms, setFarms] = useState<Farm[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [tasks, setTasks] = useState<FarmerTask[]>([]);
  const [activities, setActivities] = useState<FarmActivity[]>([]);
  // `farms` is loaded for the source line; the tile values come from `overview`.
  const farmCount = farms.length;
  void farmCount;

  /* ── Live feeds ────────────────────────────────────────────────────── */

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [mandi, setMandi] = useState<MandiPrice[]>([]);
  const [mandiLoading, setMandiLoading] = useState(false);
  const [mandiError, setMandiError] = useState("");

  /* ── AI assistant ──────────────────────────────────────────────────── */

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AdvisoryAnswer | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Server first (verified identity). Without a backend, the same numbers
      // are computed from Supabase — clearly labelled as such.
      let data: Overview;
      if (isFarmerApiConfigured) {
        try {
          data = await getOverview();
          setSource("server");
        } catch {
          data = await overviewFromSupabase();
          setSource("local");
        }
      } else {
        data = await overviewFromSupabase();
        setSource("local");
      }
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your dashboard.");
      setOverview(null);
    } finally {
      setLoading(false);
    }

    // The lists the overview summarises, for the sections beneath the tiles.
    await Promise.all([
      listFarms().then(setFarms).catch(() => setFarms([])),
      listCrops().then(setCrops).catch(() => setCrops([])),
      listTasks().then(setTasks).catch(() => setTasks([])),
      listActivities(6).then(setActivities).catch(() => setActivities([])),
    ]);
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!district || !isWeatherConfigured) return;
    let alive = true;
    setWeatherLoading(true);
    setWeatherError("");
    getWeather(district, details.state, details.village)
      .then((data) => {
        if (alive && data) setWeather(data);
      })
      .catch((err: unknown) => {
        if (alive) setWeatherError(err instanceof Error ? err.message : "Weather unavailable.");
      })
      .finally(() => {
        if (alive) setWeatherLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [district, details.state, details.village]);

  useEffect(() => {
    if (!district && !details.state) return;
    let alive = true;
    setMandiLoading(true);
    setMandiError("");
    getMandiPrices({ district, state: details.state, limit: 60 })
      .then((result) => {
        if (alive) setMandi(result.records);
      })
      .catch((err: unknown) => {
        if (alive) setMandiError(err instanceof Error ? err.message : "Mandi prices unavailable.");
      })
      .finally(() => {
        if (alive) setMandiLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [district, details.state]);

  /* ── Derived values ────────────────────────────────────────────────── */

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Farmer";
  const firstName = name.split(" ").filter(Boolean)[0] ?? name;

  const locationLine =
    [details.village, details.district].filter(Boolean).join(", ") || t("f.locationNotSet");

  const alerts = useMemo(() => deriveAlerts(weather), [weather]);

  const todayTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter((task) => !task.done && task.due_on <= today);
  }, [tasks]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks
      .filter((task) => !task.done && task.due_on > today)
      .sort((a, b) => a.due_on.localeCompare(b.due_on))
      .slice(0, 5);
  }, [tasks]);

  /** Next agronomic step per crop comes from the crop row itself. */
  const nextCropActions = useMemo(
    () =>
      crops
        .filter((c) => c.status !== "harvested" && c.next_action_on)
        .sort((a, b) => (a.next_action_on ?? "").localeCompare(b.next_action_on ?? ""))
        .slice(0, 4),
    [crops]
  );

  const bestPrices = useMemo(() => rowsForTab(mandi, "Top Commodities").slice(0, 5), [mandi]);

  const healthAverage = useMemo(() => {
    const live = crops.filter((c) => c.status !== "harvested");
    if (live.length === 0) return null;
    return Math.round(live.reduce((sum, c) => sum + (c.health ?? 0), 0) / live.length);
  }, [crops]);

  const atRisk = useMemo(
    () => crops.filter((c) => c.status === "at_risk" || c.status === "monitor"),
    [crops]
  );

  const acres = overview ? haToAcres(overview.area_ha) : 0;

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    const q = question.trim();
    if (!q || askLoading) return;
    setAskLoading(true);
    setAskError("");
    setAnswer(null);
    try {
      const first = crops.find((c) => c.status !== "harvested");
      const result = await askAdvisory({
        question: q,
        crop: first?.name ?? null,
        district: district ?? null,
        state: details.state ?? null,
        language: advisoryLanguage(lang),
      });
      setAnswer(result);
      setAiOpen(true);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Could not get an answer.");
    } finally {
      setAskLoading(false);
    }
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <FarmerShell bottomBar>
          <>
            {/* ── Welcome + weather ── */}
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
                  <MapPin className="h-3.5 w-3.5" />
                  {locationLine}
                </p>
                <h1 className="mt-3 font-display text-[24px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
                  {t("f.welcome")}
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/85">
                  {firstName}, {t("f.dash.subtitle")}
                </p>
                <p className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-white/65">
                  {/* Chip colours are chosen for a light surface; on the dark hero
                      this one is painted in translucent white instead. */}
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/85">
                    {source === "server" ? "Verified by the Kalika server" : "From your own farm records"}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/advisory"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-xs font-bold text-forest hover:bg-brand-50"
                  >
                    <Sprout className="h-3.5 w-3.5" /> {t("f.askAi")}
                  </Link>
                  <Link
                    to="/calendar"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/30 px-3.5 text-xs font-bold text-white hover:bg-white/10"
                  >
                    <CalendarDays className="h-3.5 w-3.5" /> {t("f.nav.calendar")}
                  </Link>
                  <Link
                    to="/crops"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/30 px-3.5 text-xs font-bold text-white hover:bg-white/10"
                  >
                    <Leaf className="h-3.5 w-3.5" /> {t("f.nav.crops")}
                  </Link>
                </div>
              </div>

              {/* Weather tile — live, or an honest prompt to set a district. */}
              <div className="shrink-0 rounded-xl bg-white/10 p-3.5 ring-1 ring-inset ring-white/15 sm:min-w-[230px]">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                  <CloudSun className="h-3.5 w-3.5" /> {t("f.dash.todayWeather")}
                </p>
                {weather ? (
                  <>
                    <p className="mt-1.5 flex items-baseline gap-1.5 font-display text-2xl font-extrabold">
                      {weather.temp}°C
                      <span className="text-xs font-medium capitalize text-white/80">
                        {titleCase(weather.description)}
                      </span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/80">
                      <span className="inline-flex items-center gap-1">
                        <Droplets className="h-3 w-3" /> {weather.humidity}%
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Wind className="h-3 w-3" /> {weather.windKph} km/h
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CloudRain className="h-3 w-3" /> {weather.forecast[0]?.rainChance ?? 0}%
                      </span>
                    </p>
                    <p className="mt-1 text-[10px] text-white/60">{weather.place}</p>
                  </>
                ) : weatherLoading ? (
                  <p className="mt-2 text-xs text-white/70">Loading live weather…</p>
                ) : weatherError ? (
                  <p className="mt-2 text-xs leading-relaxed text-white/75">{weatherError}</p>
                ) : (
                  <Link to="/account/personal" className="mt-2 block text-xs leading-relaxed text-white/80 underline">
                    {t("f.dash.noWeather")}
                  </Link>
                )}
              </div>
            </div>
          </section>

          {error && <ErrorNote message={error} onRetry={() => void load()} />}

          {/* ── Stat cards ── */}
          <section aria-label="Farm at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={t("f.dash.totalArea")}
              value={loading ? "…" : `${num(acres)} ${t("f.dash.acres")}`}
              hint={overview ? `${overview.counts.active_farms} ${t("f.dash.farms")}` : undefined}
              icon={MapPin}
              onClick={() => navigate("/my-farm")}
            />
            <Stat
              label={t("f.dash.activeCrops")}
              value={loading ? "…" : (overview?.counts.active_crops ?? 0)}
              hint={healthAverage != null ? `${t("f.dash.cropHealth")} ${healthAverage}%` : t("f.empty")}
              icon={Sprout}
              tone="teal"
              onClick={() => navigate("/crops")}
            />
            <Stat
              label={t("f.dash.todaysTasks")}
              value={loading ? "…" : todayTasks.length}
              hint={`${todayTasks.length} ${t("f.dash.tasksToday")}`}
              icon={ClipboardList}
              tone="blue"
              onClick={() => navigate("/calendar")}
            />
            <Stat
              label={t("f.dash.monthlyExpenses")}
              value={loading ? "…" : overview && overview.counts.month_expense_rows > 0 ? inr(overview.counts.month_expenses_inr, { compact: true }) : "—"}
              hint={
                overview && overview.counts.month_expense_rows === 0 ? (
                  t("f.notRecorded")
                ) : (
                  <>
                    {t("f.dash.thisMonth")} <SourceChip kind="manual" />
                  </>
                )
              }
              icon={Wallet}
              tone="amber"
              onClick={() => navigate("/expenses")}
            />
          </section>

          <section aria-label="Health and market" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={t("f.dash.cropHealth")}
              value={healthAverage != null ? `${healthAverage}%` : "—"}
              hint={atRisk.length ? `${atRisk.length} need attention` : "All crops look normal"}
              icon={Leaf}
              tone={healthAverage != null && healthAverage < 70 ? "amber" : "green"}
              onClick={() => navigate("/crops")}
            />
            <Stat
              label={t("f.dash.mandi")}
              value={mandiLoading ? "…" : bestPrices[0] ? inr(bestPrices[0].modal_price ?? null, { compact: true }) : "—"}
              hint={bestPrices[0] ? `${bestPrices[0].commodity} · ${bestPrices[0].market}` : t("f.dash.noMandi")}
              icon={TrendingUp}
              tone="violet"
              badge={<SourceChip kind="live" />}
              onClick={() => navigate("/mandi")}
            />
            <Stat
              label={t("f.dash.weatherAlerts")}
              value={alerts.length}
              hint={alerts[0]?.title ?? "No alerts for your district"}
              icon={AlertTriangle}
              tone={alerts.length ? "amber" : "slate"}
              onClick={() => navigate("/weather")}
            />
            <Stat
              label={t("f.dash.pendingOrders")}
              value="—"
              hint="Open My Orders & Sales"
              icon={ShoppingBag}
              tone="slate"
              onClick={() => navigate("/orders-sales")}
            />
          </section>

          {alerts.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5" /> Important for your farm today
              </p>
              <ul className="mt-1.5 space-y-1">
                {alerts.slice(0, 2).map((alert) => (
                  <li key={alert.id} className="text-[11px] leading-relaxed text-amber-900">
                    <span className="font-semibold">{alert.title}:</span> {alert.body}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Main grid ── */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title={t("f.dash.activeCropsTitle")}
              description="Crops on your land right now, with the next step for each"
              icon={Sprout}
              action={<ViewAll onClick={() => navigate("/crops")} label={t("f.viewAll")} />}
            >
              {loading ? (
                <LoadingRows rows={3} />
              ) : overview && overview.crops.length === 0 ? (
                <EmptyState
                  icon={Sprout}
                  title="No active crops"
                  body="Add a crop with its sowing date and the calendar, advice and health checks start working for it."
                  action={
                    <Link to="/crops" className="creator-btn-primary inline-flex h-9 items-center px-4 text-xs">
                      Add a crop
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(overview?.crops ?? []).slice(0, 5).map((crop) => {
                    const progress = Math.min(100, Math.round(((new Date().getTime() - new Date(crop.planted_on).getTime()) / 86_400_000 / crop.growth_days) * 100));
                    const tone = crop.status === "at_risk" ? "red" : crop.status === "monitor" ? "amber" : "green";
                    return (
                      <li key={crop.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                          <Wheat className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-forest">
                            {crop.name}
                            {crop.variety && <span className="text-[11px] font-normal text-slate-500">({crop.variety})</span>}
                            <Chip tone={tone}>{crop.status.replace("_", " ")}</Chip>
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {crop.area_ha != null ? `${num(haToAcres(crop.area_ha))} ${t("f.dash.acres")} · ` : ""}
                            Sown {shortDate(crop.planted_on)}
                            {crop.next_action ? ` · Next: ${crop.next_action}` : ""}
                          </p>
                          <div className="mt-1.5 max-w-[240px]">
                            <ProgressBar value={progress} tone={tone === "red" ? "red" : tone === "amber" ? "amber" : "green"} label={`${crop.name} growth`} />
                          </div>
                        </div>
                        <Link to="/crops" className="shrink-0 text-[11px] font-bold text-brand-700 hover:underline">
                          Details
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {/* ── AI assistant ── */}
            <Panel
              title={t("f.ai.title")}
              description="Crop, soil and weather context from your own farm"
              icon={Sprout}
              action={
                <Link to="/advisory" className="text-[11px] font-bold text-brand-700 hover:underline">
                  Full chat
                </Link>
              }
            >
              <div className="space-y-3 p-4">
                <form onSubmit={ask} className="space-y-2">
                  <Textarea
                    rows={2}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={t("f.ai.placeholder")}
                    aria-label={t("f.ai.placeholder")}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      {crops.length ? crops.find((c) => c.status !== "harvested")?.name ?? "" : ""} · {district ?? "No district"}
                    </span>
                    <PrimaryButton type="submit" disabled={askLoading || !question.trim()}>
                      <Send className="h-3.5 w-3.5" /> {askLoading ? "…" : t("f.ai.send")}
                    </PrimaryButton>
                  </div>
                </form>

                {askError && <p className="text-[11px] leading-relaxed text-rose-600">{askError}</p>}

                <p className="text-[11px] leading-relaxed text-slate-500">
                  {t("f.ai.notDiagnosis")}
                </p>
              </div>
            </Panel>

            {/* ── Calendar ── */}
            <Panel
              title={t("f.dash.upcomingCalendar")}
              description="Reminders you set, soonest first"
              icon={CalendarDays}
              action={<ViewAll onClick={() => navigate("/calendar")} label={t("f.viewAll")} />}
            >
              {loading ? (
                <LoadingRows rows={3} />
              ) : todayTasks.length === 0 && upcoming.length === 0 && nextCropActions.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No tasks due"
                  body="Tasks you add on the Crop Calendar appear here, with any fertiliser or irrigation step saved on a crop."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {todayTasks.slice(0, 3).map((task) => (
                    <li key={task.id} className="flex items-start gap-2 px-4 py-2.5">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-forest">{task.title}</p>
                        <p className="text-[11px] text-rose-600">Due {relativeDays(task.due_on).toLowerCase()}</p>
                      </div>
                    </li>
                  ))}
                  {upcoming.slice(0, 4).map((task) => (
                    <li key={task.id} className="flex items-start gap-2 px-4 py-2.5">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-forest">{task.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {shortDate(task.due_on)} · {relativeDays(task.due_on)}
                        </p>
                      </div>
                    </li>
                  ))}
                  {nextCropActions.map((crop) => (
                    <li key={`crop-${crop.id}`} className="flex items-start gap-2 px-4 py-2.5">
                      <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-forest">
                          {crop.next_action ?? "Next step"} — {crop.name}
                        </p>
                        <p className="text-[11px] text-slate-500">{shortDate(crop.next_action_on)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* ── Recent activity ── */}
            <Panel
              title={t("f.dash.recentActivity")}
              description="What you logged on the farm"
              icon={ClipboardList}
              action={<ViewAll onClick={() => navigate("/farm-activities")} label={t("f.viewAll")} />}
            >
              {loading ? (
                <LoadingRows rows={3} />
              ) : activities.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No activities recorded"
                  body="Log ploughing, sowing, spraying or harvest with its cost, and it appears here and in your expenses."
                  action={
                    <Link to="/farm-activities" className="creator-btn-ghost inline-flex h-9 items-center px-4 text-xs">
                      Log an activity
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activities.slice(0, 5).map((activity) => (
                    <li key={activity.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-forest">{activity.title}</p>
                        <p className="text-[11px] capitalize text-slate-500">
                          {activity.kind.replace("_", " ")} · {relativeDays(activity.activity_on)}
                        </p>
                      </div>
                      {activity.cost_inr != null && (
                        <span className="shrink-0 text-[11px] font-semibold text-slate-600">{inr(activity.cost_inr)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* ── Services + market + community ── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={t("f.dash.nearbyServices")} icon={Package}>
              <div className="grid grid-cols-2 gap-2 p-3">
                {[
                  { label: t("f.nav.equipment"), icon: Package, to: "/equipment" },
                  { label: t("f.nav.transport"), icon: Truck, to: "/transport" },
                  { label: t("f.nav.storage"), icon: Warehouse, to: "/storage" },
                  { label: t("f.nav.labour"), icon: HardHat, to: "/farm-labour" },
                ].map(({ label, icon: Icon, to }) => (
                  <Link
                    key={to}
                    to={to}
                    className="rounded-lg border border-slate-200 p-3 text-center transition hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    <Icon className="mx-auto h-4 w-4 text-brand-700" />
                    <span className="mt-1.5 block truncate text-[11px] font-semibold text-forest">{label}</span>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel
              title={t("f.dash.mandi")}
              description={district ? `Live prices near ${district}` : t("f.dash.noMandi")}
              icon={TrendingUp}
              action={<ViewAll onClick={() => navigate("/mandi")} label={t("f.viewAll")} />}
            >
              {mandiLoading ? (
                <LoadingRows rows={3} />
              ) : mandiError ? (
                <p className="px-4 py-4 text-[11px] leading-relaxed text-slate-500">{mandiError}</p>
              ) : bestPrices.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No prices for your district" body={t("f.dash.noMandi")} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {bestPrices.map((row) => (
                    <li key={`${row.commodity}-${row.market}`} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-forest">{row.commodity}</p>
                        <p className="truncate text-[11px] text-slate-500">{row.market}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-slate-700">
                        {row.modal_price != null ? `${inr(row.modal_price)}/qtl` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("f.dash.community")} icon={Users}>
              <div className="space-y-2 p-3">
                {[
                  { label: t("f.nav.cenfriend"), icon: Users, to: "/cenfriend" },
                  { label: t("f.nav.videoHub"), icon: Play, to: "/video-hub" },
                  { label: t("f.nav.groups"), icon: MessageSquare, to: "/farming-groups" },
                  { label: t("f.nav.messages"), icon: MessageSquare, to: "/messages" },
                ].map(({ label, icon: Icon, to }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-forest transition hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    <Icon className="h-4 w-4 text-brand-700" />
                    <span className="flex-1 truncate">{label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </Link>
                ))}
              </div>
            </Panel>
          </div>

          {/* ── Quick links to the remaining tools ── */}
          <Panel title="More farming tools" icon={BadgeCheck}>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: t("f.nav.soil"), icon: Leaf, to: "/soil-health" },
                { label: t("f.nav.irrigation"), icon: Droplets, to: "/irrigation" },
                { label: t("f.nav.disease"), icon: ScanLine, to: "/disease-detection" },
                { label: t("f.nav.marketplace"), icon: Store, to: "/marketplace" },
                { label: t("f.nav.schemes"), icon: BadgeCheck, to: "/schemes" },
                { label: t("f.nav.insurance"), icon: BadgeCheck, to: "/crop-insurance" },
              ].map(({ label, icon: Icon, to }) => (
                <Link
                  key={to}
                  to={to}
                  className="rounded-lg border border-slate-200 p-3 text-center transition hover:border-brand-300 hover:bg-brand-50/50"
                >
                  <Icon className="mx-auto h-4 w-4 text-brand-700" />
                  <span className="mt-1.5 block truncate text-[11px] font-semibold text-forest">{label}</span>
                </Link>
              ))}
            </div>
          </Panel>

          {/* ── Answer dialog so the dashboard stays short ── */}
          {aiOpen && answer && (
            <Modal title={t("f.ai.title")} onClose={() => setAiOpen(false)} wide>
              <div className="space-y-3">
                <Chip tone={answer.mode === "ai" ? "green" : "amber"}>
                  {answer.mode === "ai" ? t("f.ai.aiAnswer") : t("f.ai.ruleAnswer")}
                  {answer.model ? ` · ${answer.model}` : ""}
                </Chip>
                <ol className="space-y-2">
                  {answer.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-800">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                  {t("f.ai.notDiagnosis")}
                </p>
              </div>
            </Modal>
          )}

            <Toast message={toast} />
          </>
    </FarmerShell>
  );
}
