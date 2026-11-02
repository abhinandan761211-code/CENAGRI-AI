import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CloudRain,
  CloudSun,
  Droplets,
  MapPin,
  Thermometer,
  Wind,
} from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { useAuth } from "@/hooks/useAuth";
import { deriveAlerts, getWeather, isWeatherConfigured, titleCase } from "@/lib/weather";
import type { WeatherAlert, WeatherNow } from "@/lib/weather";

const ICONS = {
  sun: "☀️",
  cloud: "⛅",
  rain: "🌧️",
  storm: "⛈️",
  snow: "❄️",
  mist: "🌫️",
} as const;

const SEVERITY_STYLE: Record<WeatherAlert["severity"], string> = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-slate-200 bg-slate-100 text-slate-200",
};

/**
 * Weather & alerts. Conditions and the 5-day outlook are live from
 * OpenWeatherMap; every alert below is derived from those numbers (see
 * `deriveAlerts`), so nothing here is invented.
 */
export default function WeatherAlerts() {
  const { profile } = useAuth();
  const details = profile?.details ?? {};
  const district = details.district;

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!district || !isWeatherConfigured) {
      setState("idle");
      return;
    }
    let alive = true;
    setState("loading");
    getWeather(district, details.state, details.village)
      .then((data) => {
        if (!alive) return;
        if (data) {
          setWeather(data);
          setState("ready");
        } else setState("idle");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Could not load the forecast.");
      });
    return () => {
      alive = false;
    };
  }, [district, details.state, details.village]);

  const alerts = deriveAlerts(weather);

  return (
    <FeatureShell
      title="Weather & Alerts"
      description="Today's conditions, the five-day outlook, and alerts generated from that forecast."
    >
      {!isWeatherConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-900">
            <span className="font-bold">Weather is not configured.</span> Add{" "}
            <code className="rounded bg-slate-100 px-1">VITE_OPENWEATHER_KEY</code> to the frontend
            <code className="mx-1 rounded bg-slate-100 px-1">.env</code> to load live conditions.
          </p>
        </div>
      )}

      {isWeatherConfigured && !district && (
        <div className="rounded-lg border border-slate-200 bg-slate-100/5 px-4 py-3">
          <p className="text-xs text-slate-500">
            Add your state and district to your profile to see weather for your area.
          </p>
        </div>
      )}

      {state === "loading" && (
        <p className="text-sm text-slate-500">Loading the forecast for {district}…</p>
      )}

      {state === "error" && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> Could not load weather
          </p>
          <p className="mt-1 text-[11px] text-red-600">{error}</p>
        </div>
      )}

      {state === "ready" && weather && (
        <div className="space-y-5">
          {/* Current conditions */}
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" /> {weather.place}
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl">{ICONS[weather.icon]}</span>
                  <span className="font-display text-4xl font-bold text-forest">
                    {weather.temp}°C
                  </span>
                </p>
                <p className="mt-1 text-sm text-slate-500">{titleCase(weather.description)}</p>
              </div>
              <dl className="grid grid-cols-3 gap-4 text-center">
                {[
                  [Thermometer, "Feels", `${weather.feelsLike}°C`],
                  [Droplets, "Humidity", `${weather.humidity}%`],
                  [Wind, "Wind", `${weather.windKph} km/h`],
                ].map(([Icon, label, value]) => {
                  const I = Icon as typeof Thermometer;
                  return (
                    <div key={label as string}>
                      <I className="mx-auto h-4 w-4 text-brand-700" />
                      <dt className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                        {label as string}
                      </dt>
                      <dd className="text-xs font-semibold text-forest">{value as string}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </section>

          {/* Alerts derived from the forecast */}
          <section>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-forest">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Alerts
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {alerts.length}
              </span>
            </h2>
            {alerts.length === 0 ? (
              <p className="mt-2 rounded-lg border border-slate-200 bg-slate-100/5 px-4 py-3 text-xs text-slate-500">
                No alerts for the next few days — the forecast shows nothing crossing spraying,
                heat, cold or wind thresholds.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={`rounded-lg border px-4 py-3 ${SEVERITY_STYLE[alert.severity]}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100/70 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                        {alert.severity}
                      </span>
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <span className="text-[10px] opacity-70">· {alert.when}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed opacity-90">{alert.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Five-day outlook — the target of the sidebar's "Crop Calendar" link. */}
          <section id="calendar" className="scroll-mt-24">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-forest">
              <CloudSun className="h-4 w-4 text-brand-700" /> Five-day outlook
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {weather.forecast.map((day) => (
                <div key={day.date} className="card p-3 text-center">
                  <p className="text-[11px] font-bold uppercase text-slate-500">{day.day}</p>
                  <p className="mt-1 text-2xl">{ICONS[day.icon]}</p>
                  <p className="mt-1 text-sm font-semibold text-forest">{day.temp}°C</p>
                  <p className="text-[10px] text-slate-500">
                    {day.tempMin}° / {day.tempMax}°
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-blue-600">
                    <CloudRain className="h-3 w-3" /> {day.rainChance}%
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </FeatureShell>
  );
}
