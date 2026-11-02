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

/**
 * States that are stored under their official name but known to
 * OpenWeatherMap's geocoder under a different (often older) one.
 * Odisha in particular: the plain state name returns nothing, while
 * "Orissa" resolves correctly.
 */
const STATE_ALIASES: Record<string, string[]> = {
  Odisha: ["Orissa"],
  Uttarakhand: ["Uttaranchal"],
  Puducherry: ["Pondicherry"],
};

/** Every spelling worth trying for a state, in order. */
function stateSpellings(state: string): string[] {
  return [state, ...(STATE_ALIASES[state] ?? [])];
}

/** True when a geocode result belongs to the state we asked for. */
function inState(result: GeoResult, state: string): boolean {
  const actual = result.state?.trim().toLowerCase();
  if (!actual) return false;
  return stateSpellings(state).some((name) => name.toLowerCase() === actual);
}

/**
 * District name → coordinates.
 *
 * OpenWeatherMap's geocoder is name-based and often returns a same-named
 * place in a different state: "Gajapati,IN" resolves to a village in
 * Karnataka instead of the Odisha district. Asking for the district *with*
 * the state (`Gajapati,Odisha,IN`) narrows it down, so we try that first and
 * only accept a result that really sits in the farmer's state. A name-only
 * lookup is the last resort — it is still better than showing nothing, but it
 * is never used when a state match exists.
 */
async function geocode(district: string, state?: string): Promise<GeoResult> {
  const cacheKey = `${district}|${state ?? ""}`.toLowerCase();
  const hit = geoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.value;

  const lookups = state
    ? [
        ...stateSpellings(state).map((name) => `${district},${name},${REGION}`),
        `${district},${REGION}`,
      ]
    : [`${district},${REGION}`];

  let fallback: GeoResult | undefined;
  let best: GeoResult | undefined;

  for (const query of lookups) {
    let results: GeoResult[];
    try {
      results = await getJson<GeoResult[]>(
        `${API}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${key}`
      );
    } catch {
      // One spelling failing must not abort the whole lookup.
      continue;
    }
    if (!results.length) continue;

    const exact = state ? results.find((r) => inState(r, state)) : undefined;
    if (exact) {
      best = exact;
      break;
    }

    // Remember the first name-only hit, used only if no state matches.
    if (!fallback) fallback = results[0];
  }

  const found = best ?? fallback;
  if (!found) throw new Error(`Could not find "${district}" on the weather map.`);

  geoCache.set(cacheKey, { at: Date.now(), value: found });
  return found;
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

/* ── Derived alerts ──────────────────────────────────────────────────── */

export type WeatherAlert = {
  /** Stable across refreshes so the bell can remember what was read. */
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  /** When it applies — "Today" or a weekday name. */
  when: string;
  /** What the farmer should actually do about it. */
  body: string;
};

/** mm-of-rain-chance / temperature thresholds worth waking a farmer for. */
const THRESHOLDS = {
  heavyRainChance: 70,
  heat: 38,
  cold: 8,
  highWind: 35,
};

/**
 * Turn a forecast into farm alerts.
 *
 * Everything here is arithmetic on numbers OpenWeatherMap returned — no
 * invented advisories. Wells, spraying and harvesting are all decisions that
 * depend on rain and wind, so each alert says what to do, not just what the
 * weather is. Returns an empty list when there is no forecast yet.
 */
export function deriveAlerts(weather: WeatherNow | null | undefined): WeatherAlert[] {
  if (!weather) return [];

  const alerts: WeatherAlert[] = [];
  const today = weather.forecast[0];

  const wettest = weather.forecast.reduce<DayForecast | undefined>(
    (best, day) => (!best || day.rainChance > best.rainChance ? day : best),
    undefined
  );
  if (wettest && wettest.rainChance >= THRESHOLDS.heavyRainChance) {
    alerts.push({
      id: `rain-${wettest.date}`,
      severity: wettest.rainChance >= 85 ? "high" : "medium",
      title: `${wettest.rainChance}% rain chance on ${wettest.day}`,
      when: `${wettest.day}${wettest === today ? " (today)" : ""} · ${wettest.tempMin}–${wettest.tempMax}°C`,
      body:
        "Delay spraying, urea top-dressing and harvesting on that day. Check field drainage " +
        "before the rain so standing water does not damage the roots.",
    });
  }

  if (today && today.tempMax >= THRESHOLDS.heat) {
    alerts.push({
      id: `heat-${today.date}`,
      severity: "high",
      title: `Heat wave risk: up to ${Math.round(today.tempMax)}°C today`,
      when: "Today",
      body:
        "Irrigate early morning or after sunset and mulch the beds. Avoid transplanting " +
        "seedlings in the afternoon heat.",
    });
  }

  if (today && today.tempMin <= THRESHOLDS.cold) {
    alerts.push({
      id: `cold-${today.date}`,
      severity: "medium",
      title: `Cold night ahead: ${Math.round(today.tempMin)}°C`,
      when: "Tonight",
      body:
        "Cover nursery beds and young seedlings at night. Frost can damage flowering " +
        "mustard and potato.",
    });
  }

  if (weather.windKph >= THRESHOLDS.highWind) {
    alerts.push({
      id: `wind-${weather.place}-${Math.round(weather.windKph)}`,
      severity: "medium",
      title: `Strong wind: ${weather.windKph} km/h`,
      when: "Now",
      body:
        "Skip pesticide spraying — it will drift and miss the crop. Stake tall plants and " +
        "secure shade nets.",
    });
  }

  if (today && today.rainChance < 30 && today.tempMax >= 33) {
    alerts.push({
      id: `dry-${today.date}`,
      severity: "low",
      title: "Dry and hot — irrigation likely needed",
      when: `Next 24h · ${today.rainChance}% rain chance`,
      body:
        "Check the top 5 cm of soil. If it crumbles instead of clumping, water in the " +
        "evening to reduce evaporation.",
    });
  }

  // Highest severity first; the bell only shows the top few anyway.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
