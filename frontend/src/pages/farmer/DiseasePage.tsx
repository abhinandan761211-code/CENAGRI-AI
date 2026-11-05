import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  Download,
  History,
  ImageIcon,
  ScanLine,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Upload,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  LoadingRows,
  Modal,
  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  shortDate,
  Stat,
  Textarea,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import { advisoryLanguage } from "@/lib/advisoryLanguage";
import { askAdvisory, advisoryErrorMessage } from "@/lib/advisory";
import type { AdvisoryAnswer } from "@/lib/advisory";
import { listCrops } from "@/lib/crops";
import type { Crop } from "@/lib/crops";
import {
  deleteAnalysis,
  farmerError,
  listAnalyses,
  saveAnalysis,
  uploadAnalysisPhoto,
} from "@/lib/farmer";
import type { DiseaseAnalysis } from "@/lib/farmer";

/**
 * Disease Detection — crop-photo advisory.
 *
 * A photo plus described symptoms go to the Kalika assistant, which returns
 * *possible* causes and next steps. The page never claims a diagnosis: the
 * wording, the disclaimer and the expert-consultation prompt are part of the
 * result, and every answer is stored with its mode (AI vs. rule base) so the
 * history cannot be mistaken for lab results.
 */

const MAX_SIDE = 1280;
const MAX_BYTES = 6 * 1024 * 1024;

/** Downscale before upload: field photos are large and mobile data is dear. */
async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_BYTES) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function DiseaseDetectionPage() {
  const { user, profile } = useAuth();
  const { lang } = useLang();
  const details = profile?.details ?? {};

  const [crops, setCrops] = useState<Crop[]>([]);
  const [history, setHistory] = useState<DiseaseAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropId, setCropId] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [result, setResult] = useState<{ answer: AdvisoryAnswer; analysis: DiseaseAnalysis | null } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user) {
      listCrops().then((rows) => setCrops(rows.filter((c) => c.status !== "harvested"))).catch(() => setCrops([]));
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadHistory() {
    setLoading(true);
    try {
      setHistory(await listAnalyses());
      setError("");
    } catch (err) {
      setError(farmerError(err, "Could not load your analysis history."));
    } finally {
      setLoading(false);
    }
  }

  async function onPick(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setAnalysisError("Choose a photo (JPG, PNG or WebP).");
      return;
    }
    const prepared = await downscale(f);
    setFile(prepared);
    setAnalysisError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(prepared));
  }

  async function analyse() {
    if (!file) {
      setAnalysisError("Add a photo of the affected plant first.");
      return;
    }
    setBusy(true);
    setAnalysisError("");
    setResult(null);

    const crop = crops.find((c) => c.id === cropId);
    const question = [
      "I am looking at a problem on my crop.",
      crop ? `Crop: ${crop.name}${crop.variety ? ` (${crop.variety})` : ""}, sown ${crop.planted_on}.` : "",
      symptoms.trim() ? `What I see: ${symptoms.trim()}.` : "",
      "List the possible causes with the visual evidence for each, what to check next in the field, and the safest next steps.",
      "Do not give a final diagnosis; say clearly that an expert should confirm it.",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const answer = await askAdvisory({
        question,
        crop: crop?.name ?? null,
        district: details.district ?? null,
        state: details.state ?? null,
        language: advisoryLanguage(lang),
      });

      // Keep the upload and the answer together as history.
      let analysis: DiseaseAnalysis | null = null;
      try {
        const photoPath = await uploadAnalysisPhoto(file);
        analysis = await saveAnalysis({
          crop_id: crop?.id ?? null,
          crop_name: crop?.name ?? null,
          photo_url: photoPath,
          symptoms: symptoms.trim() || null,
          possible: answer.steps.slice(0, 4),
          next_steps: answer.steps.slice(4).join(" ") || null,
          answer_text: answer.steps.join("\n"),
          mode: answer.mode,
          model: answer.model,
        });
        setHistory((prev) => [analysis as DiseaseAnalysis, ...prev]);
      } catch {
        // The answer is still useful even if history could not be saved.
        setAnalysisError("The answer is ready, but it could not be saved to history (photo storage may not be set up).");
      }

      setResult({ answer, analysis });
    } catch (err) {
      setAnalysisError(advisoryErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setSymptoms("");
    setResult(null);
    setAnalysisError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(analysis: DiseaseAnalysis) {
    try {
      await deleteAnalysis(analysis.id);
      setHistory((prev) => prev.filter((a) => a.id !== analysis.id));
    } catch (err) {
      setError(farmerError(err, "Could not delete this entry."));
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={ScanLine}
        title="Disease Detection"
        description="Photograph the affected leaves, stem or fruit and describe what you see. You get possible causes and what to check next — an expert confirms the actual diagnosis."
        meta={<Chip tone="amber" icon={ShieldAlert}>Not a lab diagnosis</Chip>}
      />

      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>An image alone cannot confirm a disease.</strong> Field symptoms often overlap between
            deficiency, pest damage and infection. For anything spreading, take a sample to your block agriculture
            officer or KVK before spraying. Mention any pesticide already applied.
          </span>
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Check a crop problem" icon={Camera}>
          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div>
                <div
                  className="relative grid aspect-square place-items-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50"
                  aria-live="polite"
                >
                  {preview ? (
                    <img src={preview} alt="Selected crop photo" className="h-full w-full object-cover" />
                  ) : (
                    <div className="px-3 text-center text-slate-400">
                      <ImageIcon className="mx-auto h-8 w-8" />
                      <p className="mt-1 text-[10px]">Clear, close-up photo in daylight</p>
                    </div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
                  aria-label="Choose a crop photo"
                />
                <PrimaryButton onClick={() => inputRef.current?.click()} className="mt-2 w-full">
                  <Upload className="h-3.5 w-3.5" /> {preview ? "Change photo" : "Add photo"}
                </PrimaryButton>
              </div>

              <div className="space-y-2.5">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Which crop?
                  </span>
                  <Select value={cropId} onChange={(e) => setCropId(e.target.value)}>
                    <option value="">Not in my crop list</option>
                    {crops.map((crop) => (
                      <option key={crop.id} value={crop.id}>
                        {crop.name} {crop.variety ? `(${crop.variety})` : ""}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    What do you see?
                  </span>
                  <Textarea
                    rows={4}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder="e.g. Brown spots with grey centre on lower leaves, spreading upward since 5 days."
                    maxLength={500}
                  />
                </label>
              </div>
            </div>

            {analysisError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {analysisError}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {(file || symptoms) && (
                <GhostButton onClick={reset} disabled={busy}>
                  Clear
                </GhostButton>
              )}
              <PrimaryButton onClick={() => void analyse()} disabled={busy || !file}>
                <ScanLine className="h-3.5 w-3.5" /> {busy ? "Analysing…" : "Get possible causes"}
              </PrimaryButton>
            </div>
          </div>
        </Panel>

        <Panel title="What happens to my photo" icon={ShieldAlert}>
          <div className="space-y-2 p-4 text-[11px] leading-relaxed text-slate-600">
            <p>The photo is resized, then stored privately in your own account folder.</p>
            <p>
              Your symptoms and crop details are sent to the Kalika assistant to produce the answer. Nothing is
              shared publicly.
            </p>
            <p>You can delete any analysis from the history below.</p>
            <p className="rounded-md bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500">
              If photo storage is not configured on this deployment, the answer still appears but history is not
              saved.
            </p>
          </div>
        </Panel>
      </div>

      {/* ── History ── */}
      <Panel title="Analysis history" description="Stored answers, newest first" icon={History}>
        {loading ? (
          <LoadingRows rows={3} />
        ) : error ? (
          <div className="p-4">
            <ErrorNote message={error} onRetry={() => void loadHistory()} />
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={History}
            title="No analyses yet"
            body="Every photo check you run is saved here, together with what the assistant suggested at the time."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Stethoscope className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-forest">
                    {item.crop_name ?? "Crop not specified"}
                    <Chip tone={item.mode === "ai" ? "green" : "amber"}>
                      {item.mode === "ai" ? "AI" : "Rule-based"}
                    </Chip>
                    <span className="text-[10px] font-normal text-slate-400">{shortDate(item.created_at)}</span>
                  </p>
                  {item.symptoms && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{item.symptoms}</p>}
                  {item.possible.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {item.possible.slice(0, 3).map((p) => (
                        <li key={p.slice(0, 40)}>
                          <Chip tone="slate">{p.slice(0, 60)}</Chip>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setResult({ answer: { mode: item.mode, model: item.model, answer: item.answer_text ?? "", steps: item.answer_text?.split("\n") ?? [], notice: null } as AdvisoryAnswer, analysis: item })}
                    className="rounded-md px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(item)}
                    aria-label="Delete analysis"
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Analyses" value={history.length} icon={ScanLine} hint="Saved checks" />
        <Stat
          label="AI answers"
          value={history.filter((h) => h.mode === "ai").length}
          icon={ScanLine}
          tone="green"
          hint="Model-backed"
        />
        <Stat
          label="Rule-based"
          value={history.filter((h) => h.mode === "demo").length}
          icon={ScanLine}
          tone="amber"
          hint="No model configured"
        />
        <Stat label="Latest" value={history[0] ? shortDate(history[0].created_at) : "—"} icon={History} tone="slate" hint="Most recent check" />
      </div>

      {result && (
        <Modal
          title="Possible causes"
          description="Guidance from the assistant, not a confirmed diagnosis"
          onClose={() => setResult(null)}
          wide
          footer={
            <>
              <GhostButton onClick={() => setResult(null)}>Close</GhostButton>
              <Link to="/advisory" className="creator-btn-primary inline-flex h-9 items-center px-3.5 text-xs">
                Discuss with the AI
              </Link>
            </>
          }
        >
          <div className="space-y-3">
            <Chip tone={result.answer.mode === "ai" ? "green" : "amber"}>
              {result.answer.mode === "ai" ? "AI answer" : "Rule-based answer"}
            </Chip>
            {result.analysis?.photo_url && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Camera className="h-3 w-3" /> A photo was attached to this check.
              </p>
            )}
            <ol className="space-y-2">
              {result.answer.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-800">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-rose-800">
                <Stethoscope className="h-3.5 w-3.5" /> Get it confirmed before you spray
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-rose-800">
                Take 2–3 affected leaves in a paper bag to your block agriculture officer, KVK or a trusted agri
                shop. Ask them to check for pests, nutrient deficiency and disease before choosing a treatment.
              </p>
            </div>
            {result.answer.notice && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-900">{result.answer.notice}</p>
            )}
          </div>
        </Modal>
      )}

      <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Download className="h-3 w-3" /> Photos are stored privately; only you can open them.
      </p>
    </FarmerShell>
  );
}
