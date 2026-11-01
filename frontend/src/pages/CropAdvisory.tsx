import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Send, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { useAuth } from "@/hooks/useAuth";
import {
  advisoryErrorMessage,
  askAdvisory,
  getAdvisoryStatus,
  getAdvisoryTopics,
} from "@/lib/advisory";
import type { AdvisoryAnswer, AdvisoryStatus } from "@/lib/advisory";

type Turn = { question: string; answer: AdvisoryAnswer | null; error?: string };

/**
 * AI crop advisory. Answers come from the backend, which uses the farm's own
 * crop/location/weather context. If no model key is configured server-side the
 * answer is still useful but rule-based — and is labelled as such.
 */
export default function CropAdvisory() {
  const { profile, user } = useAuth();
  const details = profile?.details ?? {};

  const [status, setStatus] = useState<AdvisoryStatus | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const location = [details.district, details.state].filter(Boolean).join(", ");

  useEffect(() => {
    getAdvisoryStatus().then(setStatus).catch(() => setStatus(null));
    getAdvisoryTopics().then(setTopics).catch(() => setTopics([]));
  }, []);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    setTurns((t) => [...t, { question: q, answer: null }]);
    try {
      const answer = await askAdvisory({
        question: q,
        crop: details.crop_type || details.main_crop || null,
        district: details.district || null,
        state: details.state || null,
      });
      setTurns((t) =>
        t.map((turn, i) => (i === t.length - 1 ? { question: turn.question, answer } : turn))
      );
    } catch (err) {
      setTurns((t) =>
        t.map((turn, i) =>
          i === t.length - 1
            ? { question: turn.question, answer: null, error: advisoryErrorMessage(err) }
            : turn
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <FeatureShell
      title="AI Crop Advisory"
      description="Ask about your crop, soil, irrigation or pests. Answers use the location on your profile."
      demo={status ? !status.configured : false}
      demoNote="No AI model key is configured on the server, so answers come from a built-in rule base rather than a language model. Add LLM_API_KEY to the backend .env to switch this on — the interface stays the same."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="card flex min-h-[460px] flex-col p-4 sm:p-5">
          <div className="flex-1 space-y-4">
            {turns.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <Sparkles className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm font-semibold text-forest">
                  Ask a question about your farm
                </p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                  {location
                    ? `Answers will be tailored to ${location}.`
                    : "Set your state and district on your profile for location-aware answers."}
                </p>
              </div>
            )}

            {turns.map((turn, i) => (
              <div key={i} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-700 px-3.5 py-2 text-sm text-white">
                  {turn.question}
                </p>

                {turn.error ? (
                  <div className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> Could not get an answer
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-red-600">{turn.error}</p>
                  </div>
                ) : turn.answer ? (
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-3.5 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-brand-700">
                        {turn.answer.mode === "ai" ? "AI answer" : "Rule-based answer"}
                      </span>
                      {turn.answer.mode === "ai" && turn.answer.model && (
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {turn.answer.model}
                        </span>
                      )}
                    </div>
                    <ol className="space-y-1.5">
                      {turn.answer.steps.map((step, si) => (
                        <li key={si} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                          <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] font-bold text-brand-600">
                            {si + 1}.
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                    {turn.answer.notice && (
                      <p className="mt-2.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900">
                        {turn.answer.notice}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </p>
                )}
              </div>
            ))}
          </div>

          <form
            className="mt-4 flex gap-2 border-t border-slate-200 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={600}
              placeholder="e.g. My paddy leaves are turning yellow — what should I do?"
              className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              aria-label="Your question"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="btn-primary h-10 px-4 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Ask
            </button>
          </form>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Try asking
            </p>
            <ul className="mt-2 space-y-1.5">
              {topics.map((topic) => (
                <li key={topic}>
                  <button
                    type="button"
                    onClick={() => void ask(topic)}
                    disabled={busy}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-left text-[11px] leading-snug text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                  >
                    {topic}
                  </button>
                </li>
              ))}
                {topics.length === 0 && (
                  <li className="text-[11px] text-slate-400">Suggested questions unavailable.</li>
                )}
            </ul>
          </div>

          <div className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Context used</p>
            <dl className="mt-2 space-y-1.5 text-[11px]">
              {[
                ["Crop", details.crop_type || details.main_crop || "Not set"],
                ["District", details.district || "Not set"],
                ["State", details.state || "Not set"],
                ["Signed in as", profile?.email ?? user?.email ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-semibold text-forest">{v}</dd>
                </div>
              ))}
            </dl>
            <Link
              to="/complete-profile?next=/farmer-account"
              className="mt-3 block text-center text-[11px] font-semibold text-brand-700 hover:underline"
            >
              Update my details
            </Link>
          </div>
        </aside>
      </div>
    </FeatureShell>
  );
}
