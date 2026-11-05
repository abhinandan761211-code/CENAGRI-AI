import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  Clock,
  Languages,
  Loader2,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,

  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  Stat,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import { advisoryLanguage } from "@/lib/advisoryLanguage";
import {
  askAdvisory,
  advisoryErrorMessage,
  getAdvisoryStatus,
  getAdvisoryTopics,
} from "@/lib/advisory";
import type { AdvisoryAnswer, AdvisoryStatus } from "@/lib/advisory";
import { askFarmerAdvisory, isFarmerApiConfigured } from "@/lib/farmerApi";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import { listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import { listSoilTests } from "@/lib/farmer";
import type { SoilTest } from "@/lib/farmer";
import { getWeather, isWeatherConfigured } from "@/lib/weather";
import type { WeatherNow } from "@/lib/weather";

/**
 * AI Crop Advisory — the farmer's conversation with the multi-model assistant.
 *
 * The call always goes through the Kalika backend, never straight to the AI
 * provider. Context sent is limited to what the farmer authorised on this
 * screen: the crop, its stage, the farm (soil/irrigation), the district, the
 * language, and the current weather. The backend re-checks that the farm
 * belongs to the caller before using it.
 *
 * Answers are labelled AI vs. rule-based, and the page is explicit that this is
 * guidance, not a diagnosis.
 */

type Turn = {
  id: string;
  question: string;
  answer: AdvisoryAnswer | null;
  error?: string;
  at: number;
  context?: { crop?: string | null; language?: string };
};

const QUICK_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "bn", label: "বাংলা" },
  { code: "or", label: "ଓଡ଼ିଆ" },
] as const;

export default function AdvisoryPage() {
  const { user, profile } = useAuth();
  const { lang, setLang } = useLang();
  const details = profile?.details ?? {};

  const [status, setStatus] = useState<AdvisoryStatus | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [soil, setSoil] = useState<SoilTest[]>([]);
  const [weather, setWeather] = useState<WeatherNow | null>(null);

  const [cropId, setCropId] = useState("");
  const [farmId, setFarmId] = useState("");
  const [answerLang, setAnswerLang] = useState(advisoryLanguage(lang));

  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getAdvisoryStatus().then(setStatus).catch(() => setStatus(null));
    getAdvisoryTopics().then(setTopics).catch(() => setTopics([]));
    if (user) {
      listCrops().then(setCrops).catch(() => setCrops([]));
      listFarms().then(setFarms).catch(() => setFarms([]));
      listSoilTests().then(setSoil).catch(() => setSoil([]));
    }
  }, [user]);

  useEffect(() => {
    setAnswerLang(advisoryLanguage(lang));
  }, [lang]);

  useEffect(() => {
    if (!details.district || !isWeatherConfigured) return;
    let alive = true;
    getWeather(details.district, details.state, details.village)
      .then((data) => {
        if (alive && data) setWeather(data);
      })
      .catch(() => {
        /* weather context is optional */
      });
    return () => {
      alive = false;
    };
  }, [details.district, details.state, details.village]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const activeCrops = useMemo(() => crops.filter((c) => c.status !== "harvested"), [crops]);
  const selectedCrop = activeCrops.find((c) => c.id === cropId) ?? null;
  const selectedFarm = farms.find((f) => f.id === farmId) ?? null;
  const latestSoil = soil.find((s) => !farmId || s.farm_id === farmId) ?? null;

  /** Age of the crop, so the assistant knows the stage context. */
  const cropStage = useMemo(() => {
    if (!selectedCrop) return null;
    const days = Math.max(0, Math.round((Date.now() - new Date(`${selectedCrop.planted_on}T00:00:00`).getTime()) / 86_400_000));
    const pct = Math.min(100, Math.round((days / selectedCrop.growth_days) * 100));
    if (pct < 15) return `seedling (day ${days})`;
    if (pct < 40) return `vegetative (day ${days})`;
    if (pct < 70) return `tillering / flowering (day ${days})`;
    if (pct < 90) return `grain filling (day ${days})`;
    return `maturity (day ${days})`;
  }, [selectedCrop]);

  const soilContext = useMemo(() => {
    if (!latestSoil) return null;
    const bits: string[] = [];
    if (latestSoil.ph != null) bits.push(`pH ${latestSoil.ph}`);
    if (latestSoil.organic_carbon != null) bits.push(`OC ${latestSoil.organic_carbon}%`);
    if (latestSoil.soil_category) bits.push(latestSoil.soil_category);
    return bits.length ? bits.join(", ") : null;
  }, [latestSoil]);

  const weatherContext = weather
    ? `${weather.temp}°C, ${weather.description}, humidity ${weather.humidity}%, rain chance ${weather.forecast[0]?.rainChance ?? 0}%`
    : null;

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    const id = crypto.randomUUID();
    setTurns((prev) => [...prev, { id, question: q, answer: null, at: Date.now() }]);

    try {
      let answer: AdvisoryAnswer;
      if (isFarmerApiConfigured) {
        // Server-verified path: the backend checks the farm belongs to me.
        const res = await askFarmerAdvisory({
          question: q,
          crop: selectedCrop?.name ?? null,
          crop_stage: cropStage,
          soil: soilContext,
          weather: weatherContext,
          language: answerLang,
          farm_id: farmId || null,
        });
        answer = res;
      } else {
        answer = await askAdvisory({
          question: q,
          crop: selectedCrop?.name ?? details.main_crops ?? null,
          district: details.district ?? null,
          state: details.state ?? null,
          weather: weatherContext,
          language: answerLang,
        });
      }
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === id
            ? { ...turn, answer, context: { crop: selectedCrop?.name, language: answerLang } }
            : turn
        )
      );
    } catch (err) {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === id ? { ...turn, error: advisoryErrorMessage(err) } : turn
        )
      );
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question);
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Sparkles}
        title="AI Crop Advisory"
        description="Ask about your crop, soil, irrigation or pests. Answers use the crop and field you choose here, the weather for your district, and reply in your language."
        meta={
          <>
            <Chip tone={status?.configured ? "green" : "amber"} icon={Bot}>
              {status?.configured ? `AI model: ${status.model ?? "configured"}` : "Rule-based answers"}
            </Chip>
            {details.district && <Chip tone="slate">{details.district}</Chip>}
            {isFarmerApiConfigured && <Chip tone="blue">Verified by Kalika server</Chip>}
          </>
        }
      />

      {status && !status.configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-amber-900">
            <strong>No AI model key is set on the server.</strong> Answers come from a built-in rule base and are
            labelled “Rule-based answer”. The interface is identical once a model is connected.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel className="flex min-h-[520px] flex-col" flush>
          <div className="max-h-[56vh] min-h-[300px] flex-1 space-y-4 overflow-y-auto p-4 sm:max-h-none">
            {turns.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <Sparkles className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm font-semibold text-forest">Ask a question about your farm</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                  {details.district
                    ? `Answers are tailored to ${details.district}. Pick a crop on the right and the stage is included too.`
                    : "Set your state and district on your profile for location-aware answers."}
                </p>
                {topics.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {topics.slice(0, 4).map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => void ask(topic)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:border-brand-300 hover:text-forest"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-700 px-3.5 py-2 text-sm text-white">
                  {turn.question}
                </p>

                {turn.error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
                      <AlertTriangle className="h-3.5 w-3.5" /> Could not get an answer
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-rose-700">{turn.error}</p>
                  </div>
                ) : turn.answer ? (
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Chip tone={turn.answer.mode === "ai" ? "green" : "amber"}>
                        {turn.answer.mode === "ai" ? "AI answer" : "Rule-based answer"}
                      </Chip>
                      {turn.answer.model && <Chip tone="slate">{turn.answer.model}</Chip>}
                      {turn.context?.crop && <Chip tone="blue">{turn.context.crop}</Chip>}
                    </div>
                    <ol className="space-y-1.5">
                      {turn.answer.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-800">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                    {turn.answer.notice && (
                      <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-900">
                        {turn.answer.notice}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </p>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
                placeholder="Ask about your crop, soil, pests or weather…"
                aria-label="Your question"
                maxLength={600}
                className="max-h-32 min-h-[42px] w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
              <PrimaryButton type="submit" disabled={busy || !question.trim()} className="h-10 shrink-0 px-4">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </PrimaryButton>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] text-slate-400">
                {selectedCrop ? `${selectedCrop.name}${cropStage ? ` · ${cropStage}` : ""}` : "No crop selected"}
                {soilContext ? ` · soil ${soilContext}` : ""}
              </p>
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTurns([])}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                >
                  <Trash2 className="h-3 w-3" /> Clear conversation
                </button>
              )}
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Context sent with your question" icon={Bot}>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Crop</span>
                <Select value={cropId} onChange={(e) => setCropId(e.target.value)}>
                  <option value="">General question</option>
                  {activeCrops.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.name} {crop.variety ? `(${crop.variety})` : ""}
                    </option>
                  ))}
                </Select>
                {cropStage && <span className="mt-1 block text-[10px] text-slate-400">Stage: {cropStage}</span>}
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Farm (soil &amp; irrigation)
                </span>
                <Select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                  <option value="">Not specified</option>
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </Select>
                {selectedFarm && (
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {[selectedFarm.soil_type, selectedFarm.irrigation].filter(Boolean).join(" · ") || "No detail saved"}
                  </span>
                )}
              </label>

              <div>
                <span className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <Languages className="h-3 w-3" /> Reply language
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_LANGUAGES.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => {
                        setAnswerLang(option.label);
                        setLang(option.code);
                      }}
                      aria-pressed={answerLang === option.label}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        answerLang === option.label
                          ? "border-brand-700 bg-brand-700 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  The interface language follows this choice as well.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Location</p>
                <p className="text-[11px] font-semibold text-forest">
                  {[details.village, details.district, details.state].filter(Boolean).join(", ") || "Not set"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Weather</p>
                <p className="text-[11px] font-semibold text-forest">{weatherContext ?? "Not available"}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Soil test</p>
                <p className="text-[11px] font-semibold text-forest">{soilContext ?? "No soil test recorded"}</p>
              </div>
            </div>
          </Panel>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] leading-relaxed text-amber-900">
              <strong>Guidance, not a diagnosis.</strong> Always confirm chemical doses and any suspected disease
              with your block agriculture officer or a Krishi Vigyan Kendra.
            </p>
          </div>

          <Panel title="Need a photo check?" icon={Sparkles}>
            <div className="p-4">
              <p className="text-[11px] leading-relaxed text-slate-500">
                Upload a photo of the affected plant and get an evidence-based list of possibilities.
              </p>
              <Link to="/disease-detection" className="creator-btn-primary mt-2.5 inline-flex h-9 items-center px-3.5 text-xs">
                Open Disease Detection
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Questions asked" value={turns.length} icon={Bot} hint="This session" />
        <Stat
          label="AI answers"
          value={turns.filter((t) => t.answer?.mode === "ai").length}
          icon={Bot}
          tone="green"
          hint={status?.configured ? "Model configured" : "Rule base only"}
        />
        <Stat label="Crops in context" value={activeCrops.length} icon={Sparkles} tone="teal" hint="From your records" />
        <Stat label="Reply language" value={answerLang} icon={Languages} tone="blue" hint="Change it any time" />
      </div>

      {turns.length === 0 && (
        <Panel>
          <EmptyState
            icon={Clock}
            title="Answers are not stored on the server"
            body="This conversation stays in this browser tab. Log decisions you act on as a farm activity, so they appear in your records."
            action={
              <Link to="/farm-activities" className="creator-btn-ghost inline-flex h-9 items-center px-4 text-xs">
                Open Farm Activities
              </Link>
            }
          />
        </Panel>
      )}
    </FarmerShell>
  );
}


