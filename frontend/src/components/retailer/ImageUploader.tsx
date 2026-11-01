import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  formatBytes,
  uploadImage,
  validateImage,
} from "@/lib/storage";

/**
 * Image picker with drag-and-drop, preview and immediate upload.
 *
 * Uploads as soon as a file is chosen and reports the public URL up, so the
 * form never has to manage an <input type="file"> itself. Reusable: pass a
 * different `bucket` for avatars or listing photos.
 */
export default function ImageUploader({
  value,
  onChange,
  bucket,
  label = "Product photo",
  hint,
  disabled = false,
}: {
  /** Current public URL, or null when no photo is set. */
  value: string | null;
  /** Called with the new public URL, or null when removed. */
  onChange: (url: string | null) => void;
  /** Storage bucket to upload into. */
  bucket?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || disabled) return;
    setError("");

    const invalid = validateImage(file);
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    try {
      const { url } = await uploadImage(file, bucket);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setBusy(false);
      // Allow re-selecting the same file after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>

      {value ? (
        <div className="flex items-start gap-3">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <img src={value} alt="" className="h-full w-full object-cover" />
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-white/70">
                <Loader2 className="h-5 w-5 animate-spin text-brand-700" />
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] text-slate-500">Photo uploaded.</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => inputRef.current?.click()}
                className="h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Replace
              </button>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => {
                  setError("");
                  onChange(null);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          className={`flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed transition disabled:opacity-60 ${
            dragging
              ? "border-brand-500 bg-brand-50"
              : "border-slate-300 bg-slate-50/60 hover:border-brand-400 hover:bg-brand-50/40"
          }`}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-brand-700" />
              <span className="text-[11px] font-semibold text-brand-800">Uploading…</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-brand-700">
                <UploadCloud className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold text-slate-600">
                Click to upload or drag an image here
              </span>
              <span className="text-[10px] text-slate-400">
                JPG, PNG, WebP or GIF · up to {formatBytes(MAX_IMAGE_BYTES)}
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {error ? (
        <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      )}
    </div>
  );
}

/** Small read-only thumbnail used in tables and cards. */
export function ProductThumb({ url, size = 40 }: { url: string | null; size?: number }) {
  if (!url) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-300"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <ImagePlus className="h-4 w-4" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-lg border border-slate-200 object-cover"
      style={{ width: size, height: size }}
    />
  );
}
