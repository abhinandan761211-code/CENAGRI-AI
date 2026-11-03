import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CloudRain,
  CloudSun,
  Droplets,
  MapPin,
  RefreshCw,
  Thermometer,
  Wind,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  LoadingRows,
  PageHeader,
  Panel,
  Stat,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { deriveAlerts, getWeather, isWeatherConfigured, titleCase } from "@/lib/weather";
import type { WeatherAlert, WeatherNow } from "@/lib/weather";

/**
 * Weather & Alerts — current conditions and the 5-day outlook, live from the
 * configured weather API for the farmer's own district.
 *
 * Nothing here is simulated: when the feed is not configured or the district
 * is missing, the page says exactly that instead of drawing a forecast.
 */

const GLYPH: Record<string, string> = {
  sun: "☀️",
  cloud: "⛅",
  rain: "🌧️",
  storm: "⛈️",
  snow: "❄️",
  mist: "🌫️",
};

const SEVERITY: Record<WeatherAlert["severity"], { tone: "red" | "amber" | "slate"; label: string }> = {
  high: { tone: "red", label: "Take action" },
  medium: { tone: "amber", label: "Watch" },
  low: { tone: "slate", label: "Note" },
};

export default function WeatherPage() {
  const { profile } = useAuth();
  const details = profile?.details ?? {};

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  const district = details.district;
  const place = [details.village, details.district, details.state].filter(Boolean).join(", ");

  function load() {
    if (!district || !isWeatherConfigured) {
      setState("idle");
      return;
    }
    setState("loading");
    setError("");
    getWeather(district, details.state, details.village)
      .then((data) => {
        if (data) {
          setWeather(data);
          setState("ready");
        } else setState("idle");
      })
      .catch((err: unknown) => {
        setState("error");
        setError(err instanceof Error ? err.message : "Could not load the forecast.");
      });
  }

  useEffect(load, [district, details.state, details.village]);

  const alerts = useMemo(() => deriveAlerts(weather), [weather]);

  return (
    <FarmerShell>
      <PageHeader
        icon={CloudSun}
        title="Weather & Alerts"
        description="Today's conditions and the five-day outlook for your area, with alerts derived from that forecast."
        meta={
          <>
            <Chip tone="green" icon={MapPin}>
              {place || "Location not set"}
            </Chip>
            {weather && <Chip tone="blue">Live data</Chip>}
          </>
        }
        actions={
          <GhostButton onClick={load} disabled={state === "loading"}>
            <RefreshCw className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} /> Refresh
          </GhostButton>
        }
      />

      {!isWeatherConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-amber-900">
            <span className="font-bold">Live weather is not connected on this build.</span> The weather feed key
            is set on the CenAGRI server, not in the browser, so this page cannot fetch a forecast until the
            backend is configured. No example forecast is shown in its place.
          </p>
        </div>
      )}

      {!district && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs leading-relaxed text-slate-600">
            Set your district so weather alerts match your fields.{" "}
            <Link to="/account/personal" className="font-semibold text-brand-700 hover:underline">
              Update my details
            </Link>
          </p>
        </div>
      )}

      {error && <ErrorNote message={error} onRetry={load} />}

      {state === "loading" ? (
        <Panel>
          <LoadingRows rows={4} />
        </Panel>
      ) : weather ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <section className="creator-card relative overflow-hidden rounded-xl2 bg-gradient-to-br from-forest to-brand-800 p-5 text-white sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/75">
                    <MapPin className="h-3.5 w-3.5" /> {weather.place}
                  </p>
                  <p className="mt-2 flex items-end gap-2 font-display text-[46px] font-extrabold leading-none">
                    {weather.temp}
                    <span className="pb-1 text-xl">°C</span>
                  </p>
                  <p className="mt-1 text-sm capitalize text-white/85">
                    {GLYPH[weather.icon] ?? "⛅"} {titleCase(weather.description)}
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 p-3 text-xs ring-1 ring-inset ring-white/15">
                  <p className="text-white/70">Feels like</p>
                  <p className="text-lg font-bold">{weather.feelsLike}°C</p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Humidity", value: `${weather.humidity}%`, icon: Droplets },
                  { label: "Wind", value: `${weather.windKph} km/h`, icon: Wind },
                  {
                    label: "Min / Max",
                    value: `${weather.forecast[0]?.tempMin ?? weather.temp}° / ${weather.forecast[0]?.tempMax ?? weather.temp}°`,
                    icon: Thermometer,
                  },
                  {
                    label: "Rain today",
                    value: `${weather.forecast[0]?.rainChance ?? 0}%`,
                    icon: CloudRain,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-lg bg-white/10 px-2.5 py-2">
                    <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/65">
                      <Icon className="h-3 w-3" /> {label}
                    </dt>
                    <dd className="mt-0.5 text-sm font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <Panel title="Alerts from this forecast" icon={AlertTriangle}>
              {alerts.length === 0 ? (
                <EmptyState
                  icon={CloudSun}
                  title="No alerts right now"
                  body="Alerts appear when the forecast shows heavy rain, high wind or extreme heat for your district."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {alerts.map((alert) => {
                    const meta = SEVERITY[alert.severity];
                    return (
                      <li key={alert.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-forest">{alert.title}</p>
                          <Chip tone={meta.tone}>{meta.label}</Chip>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{alert.body}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="5-day forecast" description="From the same live feed as the card above" icon={CloudRain}>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
              {weather.forecast.map((day, i) => (
                <div key={day.date ?? i} className="rounded-xl border border-slate-200 p-3 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{day.day}</p>
                  <p className="mt-1 text-2xl">{GLYPH[day.icon] ?? "⛅"}</p>
                  <p className="mt-1 text-sm font-bold text-forest">{day.tempMax}°</p>
                  <p className="text-[11px] text-slate-500">{day.tempMin}°</p>
                  <p className="mt-1 flex items-center justify-center gap-0.5 text-[10px] text-blue-700">
                    <CloudRain className="h-3 w-3" /> {day.rainChance}%
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Temperature" value={`${weather.temp}°C`} icon={Thermometer} hint={`Feels ${weather.feelsLike}°`} />
            <Stat label="Humidity" value={`${weather.humidity}%`} icon={Droplets} tone="teal" hint="Relative humidity" />
            <Stat label="Wind" value={`${weather.windKph} km/h`} icon={Wind} tone="blue" hint="At 10 m" />
            <Stat
              label="Active alerts"
              value={alerts.length}
              icon={AlertTriangle}
              tone={alerts.length ? "amber" : "slate"}
              hint={alerts.length ? "See the list above" : "None for your district"}
            />
          </div>
        </>
      ) : (
        <Panel>
          <EmptyState
            icon={CloudSun}
            title="No forecast to show"
            body={
              district
                ? "The weather feed did not return data for your district."
                : "Add your district to see live weather and alerts for your fields."
            }
            action={
              !district ? (
                <Link to="/account/personal" className="creator-btn-primary inline-flex h-9 items-center px-4 text-xs">
                  Set my district
                </Link>
              ) : undefined
            }
          />
        </Panel>
      )}
    </FarmerShell>
  );
}
