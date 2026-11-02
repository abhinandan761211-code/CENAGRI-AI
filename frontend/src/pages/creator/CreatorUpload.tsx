import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Loader2,
  Save,
  Upload,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import CreatorShell, {
  CREATOR_ROUTES,
  CreatorError,
  CreatorSection,
} from "@/components/creator/CreatorShell";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  CATEGORY_FALLBACK,
  LANGUAGES,
  SEASONS,
  VISIBILITIES,
  createVideoDraft,
  listCategories,
  publishVideo,
} from "@/lib/creator";
import type { Season, VideoCategory, VideoKind, Visibility } from "@/lib/creator";
import {
  ACCEPTED_VIDEO_TYPES,
  ACCEPTED_IMAGE_TYPES,
  MAX_VIDEO_BYTES,
  formatBytes,
  readVideoDuration,
  uploadImage,
  uploadVideo,
  validateVideo,
} from "@/lib/storage";

type Stage = "idle" | "uploading-file" | "uploading-thumb" | "saving" | "done" | "error";

const MAX_TITLE = 140;
const MAX_DESC = 5000;

/**
 * Upload Video.
 *
 * The file goes to Supabase Storage first (with a real progress bar), then the
 * metadata row is created and published. Video bytes never touch Postgres —
 * the row stores only the Storage key and the public URL.
 *
 * Cancelling aborts the in-flight XHR via the uploader's AbortSignal hook, and
 * "Save as draft" keeps the row without publishing.
 */
export default function CreatorUpload() {
  const navigate = useNavigate();
  const { channel, state: channelState, canCreate } = useCreatorChannel();
  const categories = useRetailerData<VideoCategory[]>(() => listCategories(), []);

  const cats = categories.data?.length ? categories.data : CATEGORY_FALLBACK.map((c, i) => ({
    ...c,
    sort_order: i,
  }));

  const [kind, setKind] = useState<VideoKind>("video");
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("crop-farming");
  const [language, setLanguage] = useState<string>(LANGUAGES[0]);
  const [tags, setTags] = useState("");
  const [cropName, setCropName] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [season, setSeason] = useState<Season | "">("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [allowComments, setAllowComments] = useState(true);
  const [schedule, setSchedule] = useState("");

  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");

  const cancelRef = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const thumbInput = useRef<HTMLInputElement | null>(null);

  // Revoke object URLs so a long editing session does not leak memory.
  useEffect(() => {
    return () => {
      if (thumbPreview) URL.revokeObjectURL(thumbPreview);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
  }, [thumbPreview, videoPreview]);

  const busy = stage === "uploading-file" || stage === "uploading-thumb" || stage === "saving";

  const canSubmit = useMemo(
    () => Boolean(file) && title.trim().length >= 3 && !busy && canCreate,
    [file, title, busy, canCreate]
  );

  async function pickFile(next: File | undefined) {
    if (!next) return;
    const invalid = validateVideo(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setFile(next);
    setVideoPreview(URL.createObjectURL(next));
    setDuration(await readVideoDuration(next));
  }

  function pickThumb(next: File | undefined) {
    if (!next) return;
    if (!ACCEPTED_IMAGE_TYPES.split(",").includes(next.type)) {
      setError("Thumbnail must be a JPG, PNG, WebP or GIF image.");
      return;
    }
    setError("");
    setThumb(next);
    setThumbPreview(URL.createObjectURL(next));
  }

  function cancelUpload() {
    cancelRef.current = true;
    setStage("idle");
    setProgress(0);
    setError("Upload cancelled.");
  }

  async function handleSubmit(publish: boolean) {
    if (!channel) return;
    if (!file) {
      setError("Choose a video file first.");
      return;
    }
    if (title.trim().length < 3) {
      setError("Give the video a title of at least 3 characters.");
      return;
    }

    cancelRef.current = false;
    setError("");
    setProgress(0);
    setStage("uploading-file");

    try {
      const uploaded = await uploadVideo(file, (pct) => {
        if (cancelRef.current) return;
        setProgress(pct);
      });
      if (cancelRef.current) return;

      let thumbUrl: string | null = null;
      if (thumb) {
        setStage("uploading-thumb");
        const result = await uploadImage(thumb, "video-thumbnails");
        thumbUrl = result.url;
      }

      setStage("saving");
      const draft = await createVideoDraft(channel, {
        title: title.trim(),
        description: description.trim() || null,
        category,
        language,
        tags: tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 12),
        crop_name: cropName.trim() || null,
        state: state.trim() || null,
        district: district.trim() || null,
        season: season || null,
        kind,
        visibility,
        allow_comments: allowComments,
        publish_at: schedule ? new Date(schedule).toISOString() : null,
        storage_key: uploaded.path,
        video_url: uploaded.url,
        thumbnail_url: thumbUrl,
        duration_sec: duration,
      });

      if (publish) {
        await publishVideo(draft.id, schedule ? new Date(schedule).toISOString() : null);
      }

      setStage("done");
      navigate(publish ? "/creator/channel" : CREATOR_ROUTES.channel);
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  if (channelState === "ready" && !canCreate) {
    return (
      <CreatorShell title="Upload Video">
        <div className="creator-card p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5 text-[var(--cr-green)]">
            <VideoIcon className="h-6 w-6" />
          </span>
          <p className="creator-heading mt-3 text-sm font-semibold">Create your channel first</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            Videos belong to a channel. Set up your channel name and banner, then come back here.
          </p>
          <Link to={CREATOR_ROUTES.settings} className="creator-btn-primary mt-4 h-9 px-4 text-xs">
            Set up my channel
          </Link>
        </div>
      </CreatorShell>
    );
  }

  return (
    <CreatorShell title="Upload Video" subtitle="Publish a farming video to the Kisan Video Hub">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* ── File picker ── */}
          <CreatorSection title="Video file" description="MP4, WebM or MOV up to 500 MB">
            {file ? (
              <div className="p-4">
                {videoPreview && (
                  <video
                    src={videoPreview}
                    controls
                    className="max-h-72 w-full rounded-lg bg-black"
                  />
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="creator-heading truncate text-[12px] font-semibold">{file.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatBytes(file.size)}
                      {duration ? ` · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setFile(null);
                      setVideoPreview(null);
                      setDuration(null);
                    }}
                    className="creator-btn-ghost h-8 px-3 text-[11px]"
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="m-4 flex w-[calc(100%-2rem)] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] py-12 transition hover:border-[#16C784]/50"
              >
                <Upload className="h-7 w-7 text-[var(--cr-green)]" />
                <span className="creator-heading text-xs font-semibold">Click to choose a video</span>
                <span className="text-[10px] text-slate-500">
                  MP4, WebM or MOV · up to {formatBytes(MAX_VIDEO_BYTES)}
                </span>
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_VIDEO_TYPES}
              className="hidden"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
          </CreatorSection>

          {/* ── Details ── */}
          <CreatorSection title="Details">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block">
                  <span className="creator-label">Title * ({title.length}/{MAX_TITLE})</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                    placeholder="e.g. Paddy transplanting — right spacing for higher yield"
                    className="creator-input"
                  />
                </label>
              </div>

              <div className="sm:col-span-2">
                <label className="block">
                  <span className="creator-label">
                    Description ({description.length}/{MAX_DESC})
                  </span>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
                    placeholder="What will a farmer learn from this video?"
                    className="creator-input"
                  />
                </label>
              </div>

              <label className="block">
                <span className="creator-label">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="creator-input"
                >
                  {cats.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="creator-label">Language</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="creator-input"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="creator-label">Video type</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as VideoKind)}
                  className="creator-input"
                >
                  <option value="video">Long video</option>
                  <option value="short">Short (vertical)</option>
                </select>
              </label>

              <label className="block">
                <span className="creator-label">Visibility</span>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                  className="creator-input"
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sm:col-span-2">
                <label className="block">
                  <span className="creator-label">Tags (comma separated)</span>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="paddy, transplanting, boro season"
                    className="creator-input"
                  />
                </label>
              </div>
            </div>
          </CreatorSection>

          {/* ── Agriculture context ── */}
          <CreatorSection
            title="Farming context"
            description="Helps farmers in your area find this video"
          >
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="creator-label">Crop</span>
                <input
                  value={cropName}
                  onChange={(e) => setCropName(e.target.value)}
                  placeholder="e.g. Paddy"
                  className="creator-input"
                />
              </label>
              <label className="block">
                <span className="creator-label">State</span>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. West Bengal"
                  className="creator-input"
                />
              </label>
              <label className="block">
                <span className="creator-label">District</span>
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Nadia"
                  className="creator-input"
                />
              </label>
              <label className="block">
                <span className="creator-label">Season</span>
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value as Season | "")}
                  className="creator-input"
                >
                  <option value="">Not specific</option>
                  {SEASONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </CreatorSection>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          <CreatorSection title="Thumbnail" description="Shown in the feed">
            <div className="p-4">
              {thumbPreview ? (
                <div className="space-y-2">
                  <img
                    src={thumbPreview}
                    alt=""
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setThumb(null);
                      setThumbPreview(null);
                    }}
                    className="creator-btn-ghost h-8 w-full text-[11px]"
                  >
                    Remove thumbnail
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => thumbInput.current?.click()}
                  className="flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-white/15 py-8 hover:border-[#16C784]/50"
                >
                  <Clapperboard className="h-6 w-6 text-[var(--cr-green)]" />
                  <span className="creator-heading text-[11px] font-semibold">Upload a thumbnail</span>
                  <span className="text-[10px] text-slate-500">1280×720 recommended</span>
                </button>
              )}
              <input
                ref={thumbInput}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                className="hidden"
                onChange={(e) => pickThumb(e.target.files?.[0])}
              />
            </div>
          </CreatorSection>

          <CreatorSection title="Publishing">
            <div className="space-y-3 p-4">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(e) => setAllowComments(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-white/10"
                />
                <span className="text-[11px] leading-relaxed text-slate-300">
                  Allow comments from viewers
                </span>
              </label>

              <label className="block">
                <span className="creator-label">Schedule (optional)</span>
                <input
                  type="datetime-local"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="creator-input"
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  Leave blank to publish now.
                </span>
              </label>
            </div>
          </CreatorSection>

          {/* Progress / errors */}
          {stage === "uploading-file" && (
            <div className="creator-card p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading video… {progress}%
                </span>
                <button
                  type="button"
                  onClick={cancelUpload}
                  className="font-bold text-rose-300 hover:underline"
                >
                  Cancel
                </button>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#16C784] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {stage === "uploading-thumb" && (
            <p className="text-[11px] text-slate-300">Uploading thumbnail…</p>
          )}

          {stage === "saving" && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving video…
            </p>
          )}

          {stage === "done" && (
            <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Video saved.
            </p>
          )}

          {error && (
            <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit(true)}
              className="creator-btn-primary h-10 w-full text-xs"
            >
              <Upload className="h-3.5 w-3.5" />
              Publish video
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit(false)}
              className="creator-btn-ghost h-10 w-full text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              Save as draft
            </button>
          </div>
        </div>
      </div>

      {channelState === "error" && (
        <CreatorError message="Your channel could not be loaded, so uploading is disabled." />
      )}
    </CreatorShell>
  );
}
