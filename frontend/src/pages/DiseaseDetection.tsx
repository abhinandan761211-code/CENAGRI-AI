import { useRef, useState } from "react";
import { Camera, ImageUp, ScanLine, X } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { useAuth } from "@/hooks/useAuth";

/**
 * AI disease detection from a crop photo.
 *
 * The diagnosis model is not connected yet, so the screen is honest about it:
 * the farmer can pick a photo and see exactly what will be analysed and what is
 * still missing, instead of a button that silently does nothing.
 */
export default function DiseaseDetection() {
  const { profile } = useAuth();
  const details = profile?.details ?? {};
  const crop = details.crop_type || details.main_crop;

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <FeatureShell
      title="Disease Detection"
      description="Photograph the affected leaf or stem and get a diagnosis with a treatment step."
      demo
      demoNote="The image-diagnosis model is not connected on the server yet, so no diagnosis is produced. The photo you choose here is only shown on this screen — it is not uploaded or stored."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="card p-4 sm:p-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />

          {preview ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-slate-200">
                <img src={preview} alt="Crop photo to analyse" className="max-h-[380px] w-full object-contain bg-slate-100" />
                <button
                  type="button"
                  onClick={clear}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-white/90 text-slate-600 shadow hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                <span className="font-bold">Not analysed.</span> The diagnosis model is not
                connected yet, so no result is produced for this photo.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={clear} className="creator-btn-ghost h-9 px-4 text-xs">
                  Choose another
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
                <ScanLine className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-forest">Add a photo of the affected crop</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                One close-up of the damaged leaf or stem, in daylight, with the spots or
                lesions in focus.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="creator-btn-primary inline-flex h-9 items-center gap-1.5 px-4 text-xs"
                >
                  <Camera className="h-3.5 w-3.5" /> Take photo
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="creator-btn-ghost inline-flex h-9 items-center gap-1.5 px-4 text-xs"
                >
                  <ImageUp className="h-3.5 w-3.5" /> Upload from device
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="card p-4 sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            What it will use
          </p>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed text-slate-600">
            <li>• The crop on your profile{crop ? ` (${crop})` : ""}</li>
            <li>• Your district, to match local outbreak patterns</li>
            <li>
              • The photo itself, once an image model is connected on the server
            </li>
          </ul>

          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Status
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Image diagnosis is not connected. Until it is, use AI Crop Advisory to describe
            the symptoms and get rule-based guidance.
          </p>
        </aside>
      </div>
    </FeatureShell>
  );
}
