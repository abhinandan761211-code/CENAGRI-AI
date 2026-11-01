/**
 * Live weather for the farmer dashboard, from OpenWeatherMap.
 *
 * Two calls per location: geocoding (district name → lat/lon, cached for a
 * week) and the 5-day/3-hour forecast, which gives today's current conditions
 * and the daily outlook in one request on the free tier.
 *
 * The key lives in `VITE_OPENWEATHER_KEY`. It is a public, client-side key, so
 * treat it as such: restrict it by domain in the OpenWeatherMap dashboard.
 */

const API = "https://api.openweathermap.org";

/** Region shown next to the district, so "Aurangabad" resolves to the right one. */
const REGION = "IN";

export type WeatherIcon = "sun" | "cloud" | "rain" | "storm" | "snow" | "mist";

export type DayForecast = {
  /** Short weekday label, e.g. "Mon". */
  day: string;
  /** Date key (YYYY-MM-DD) — stable for React keys. */
  date: string;
  temp: number;
  tempMin: number;
  tempMax: number;
  icon: WeatherIcon;
  description: string;
  rainChance: number;
};

export type WeatherNow = {
  place: string;
  temp: number;
  feelsLike: number;
  description: string;
  icon: WeatherIcon;
  humidity: number;
  windKph: number;
  forecast: DayForecast[];
};

type GeoResult = { lat: number; lon: number; name: string; state?: string };

type OwmForecast = {
  list: Array<{
    dt: number;
    main: { temp: number; feels_like: number; humidity: number; temp_min: number; temp_max: number };
    weather: Array<{ id: number; main: string; description: string }>;
    wind: { speed: number };
    pop?: number;
    /** Local time offset in seconds, per the API. */
    sys?: { pod?: string };
  }>;
  city: { name: string; timezone: number };
};

const key = import.meta.env.VITE_OPENWEATHER_KEY?.trim();

export const isWeatherConfigured = Boolean(key);

/** Map an OWM condition id to the icon set the dashboard knows. */
function iconFor(id: number): WeatherIcon {
  if (id >= 200 && id < 300) return "storm";
  if (id >= 300 && id < 600) return "rain";
  if (id >= 600 && id < 700) return "snow";
  if (id >= 700 && id < 800) return "mist";
  if (id === 800) return "sun";
  return "cloud";
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    throw new Error("Weather key rejected. Check VITE_OPENWEATHER_KEY — new keys take up to 2 hours to activate.");
  }
  if (!res.ok) throw new Error(`Weather service error (${res.status}).`);
  return (await res.json()) as T;
}

/* Geocoding is cached for a week — district coordinates never move. */
const GEO_TTL = 7 * 24 * 60 * 60 * 1000;
const geoCache = new Map<string, { at: number; value: GeoResult }>();

async function geocode(district: string, state?: string): Promise<GeoResult> {
  const cacheKey = `${district}|${state ?? ""}`.toLowerCase();
  const hit = geoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.value;

  let results = await getJson<GeoResult[]>(
    `${API}/geo/1.0/direct?q=${encodeURIComponent(`${district},${REGION}`)}&limit=5&appid=${key}`
  );

  // Several districts share a name ("Aurangabad" exists twice) — prefer the
  // state on the user's profile when the API returns it.
  if (results.length > 1 && state) {
    const wanted = state.toLowerCase();
    const sameState = results.find((r) => r.state?.toLowerCase() === wanted);
    if (sameState) results = [sameState];
  }

  const first = results[0];
  if (!first) throw new Error(`Could not find "${district}" on the weather map.`);

  geoCache.set(cacheKey, { at: Date.now(), value: first });
  return first;
}

/** Forecast cache is short — 10 minutes keeps the free tier comfortable. */
const FORECAST_TTL = 10 * 60 * 1000;
const forecastCache = new Map<string, { at: number; value: WeatherNow }>();

/**
 * Current conditions + next 4 days for a district.
 * Returns `null` when the key is missing so callers can fall back.
 */
export async function getWeather(
  district: string,
  state?: string,
  village?: string
): Promise<WeatherNow | null> {
  if (!key || !district) return null;

  const cacheKey = `${district}|${state ?? ""}`.toLowerCase();
  const cached = forecastCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FORECAST_TTL) return cached.value;

  const place = await geocode(district, state);

  const raw = await getJson<OwmForecast>(
    `${API}/data/2.5/forecast?lat=${place.lat}&lon=${place.lon}` +
      `&units=metric&appid=${key}`
  );

  const now = raw.list[0];
  const tzOffset = raw.city.timezone; // seconds

  // Group the 3-hourly steps into local calendar days.
  const byDay = new Map<string, OwmForecast["list"]>();
  for (const step of raw.list) {
    const local = new Date((step.dt + tzOffset) * 1000);
    const iso = local.toISOString().slice(0, 10);
    const bucket = byDay.get(iso) ?? [];
    bucket.push(step);
    byDay.set(iso, bucket);
  }

  const forecast: DayForecast[] = [...byDay.entries()].slice(0, 5).map(([date, steps]) => {
    const temps = steps.map((s) => s.main.temp);
    // Pick the step closest to midday for the daytime icon.
    const midday = steps[Math.floor(steps.length / 2)];
    const code = midday.weather[0]?.id ?? 800;
    return {
      day: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
        weekday: "short",
        timeZone: "UTC",
      }),
      date,
      temp: Math.round(midday.main.temp),
      tempMin: Math.round(Math.min(...temps, ...steps.map((s) => s.main.temp_min))),
      tempMax: Math.round(Math.max(...temps, ...steps.map((s) => s.main.temp_max))),
      icon: iconFor(code),
      description: midday.weather[0]?.description ?? "",
      rainChance: Math.round((midday.pop ?? 0) * 100),
    };
  });

  const value: WeatherNow = {
    place: [village, district].filter(Boolean).join(", ") || place.name,
    temp: Math.round(now.main.temp),
    feelsLike: Math.round(now.main.feels_like),
    description: now.weather[0]?.description ?? "",
    icon: iconFor(now.weather[0]?.id ?? 800),
    humidity: Math.round(now.main.humidity),
    windKph: Math.round(now.wind.speed * 3.6),
    forecast,
  };

  forecastCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** Title-case OWM's all-lowercase descriptions ("light rain" → "Light rain"). */
export function titleCase(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ── Alerts derived from the live forecast ───────────────────────────────
 * These are computed from real OpenWeatherMap numbers, so they appear and
 * disappear with the weather. Thresholds are deliberately conservative for
 * West Bengal field work; tune them with agronomy input, not by eye.
 */

export type WeatherAlert = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  /** Which day it applies to ("Today", "Tue"). */
  when: string;
};

/** Rain probability (0–100) worth warning about. */
const RAIN_CHANCE = 60;
/** Daily rainfall proxy: high chance + heavy cloud cover. */
const HEAT_C = 38;
const COLD_C = 10;
const WIND_KPH = 40;
const HUMIDITY = 85;

/**
 * Build alerts for the next few days. Returns an empty array when nothing
 * crosses a threshold — the caller shows "no alerts" rather than inventing one.
 */
export function deriveAlerts(weather: WeatherNow | null): WeatherAlert[] {
  if (!weather) return [];

  const alerts: WeatherAlert[] = [];
  const today = weather.forecast[0];

  // Spraying is the most time-sensitive field decision near rain.
  if (today && today.rainChance >= RAIN_CHANCE) {
    alerts.push({
      id: "rain-today",
      severity: "high",
      title: `${today.rainChance}% chance of rain today`,
      body:
        "Do not spray pesticide or herbicide now — rain will wash it off and waste the dose. " +
        "Hold off on irrigation too if your field already holds moisture.",
      when: "Today",
    });
  }

  for (const day of weather.forecast.slice(0, 3)) {
    if (day.rainChance >= RAIN_CHANCE && day.date !== today?.date) {
      alerts.push({
        id: `rain-${day.date}`,
        severity: "medium",
        title: `Rain likely ${day.day} (${day.rainChance}%)`,
        body: "Plan spraying and harvesting around it; check drainage before the rain arrives.",
        when: day.day,
      });
    }
    if (day.tempMax >= HEAT_C) {
      alerts.push({
        id: `heat-${day.date}`,
        severity: "high",
        title: `Heat stress risk ${day.day} — ${day.tempMax}°C`,
        body:
          "Water early morning or evening, and avoid midday field work. " +
          "Heat at flowering stage cuts yield the most.",
        when: day.day,
      });
    }
    if (day.tempMin <= COLD_C) {
      alerts.push({
        id: `cold-${day.date}`,
        severity: "medium",
        title: `Cold spell ${day.day} — ${day.tempMin}°C`,
        body: "Frost risk for vegetables and young seedlings. Cover nursery beds overnight.",
        when: day.day,
      });
    }
  }

  if (weather.windKph >= WIND_KPH) {
    alerts.push({
      id: "wind",
      severity: "medium",
      title: `Strong wind — ${weather.windKph} km/h`,
      body:
        "Spray drift will carry product onto neighbouring fields. " +
        "Stake tall crops and secure shade nets.",
      when: "Now",
    });
  }

  if (weather.humidity >= HUMIDITY) {
    alerts.push({
      id: "humidity",
      severity: "low",
      title: `High humidity — ${weather.humidity}%`,
      body:
        "Fungal diseases spread faster in prolonged leaf wetness. " +
        "Watch for early spots and keep rows ventilated.",
      when: "Now",
    });
  }

  return alerts;
}
