import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Camera, ImagePlus, Loader2, RefreshCw, Trash2, Upload, Video, X } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { StoryViewer } from "@/components/cenfriend/Stories";
import { FeedSkeleton } from "@/components/cenfriend/Skeletons";
import { ErrorNote, Field, Select } from "@/components/farm/farmerUI";
import { listStoryTrays, createStory, deleteStory } from "@/lib/social";
import type { StoryTray } from "@/lib/social";
import {
  IMAGE_BUCKET,
  MAX_IMAGE_BYTES,
  VIDEO_BUCKET,
  ACCEPTED_VIDEO_TYPES,
  ACCEPTED_IMAGE_TYPES,
  uploadImage,
  uploadVideo,
  validateImage,
  validateVideo,
} from "@/lib/storage";

/**
 * Story composer and viewer.
 *
 * Media goes to the same Storage buckets the post composer uses, so a story
 * never introduces a second upload path or a second place to look for a file.
 * Only URLs are sent to the API.
 *
 * Expiry is not settable here on purpose: the 24-hour policy is a server
 * setting (`SOCIAL_STORY_TTL_HOURS`), and a client that could choose its own
 * expiry is a client that could keep a story alive for a week.
 */

const CROPS = ["Paddy", "Wheat", "Maize", "Mustard", "Sugarcane", "Potato", "Tomato", "Onion", "Pulses", "Vegetables"];

export default function CenFriendStories() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [trays, setTrays] = useState<StoryTray[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState("");
  const [crop, setCrop] = useState("");
  const [visibility, setVisibility] = useState<"public" | "followers">("public");
  const [progress, setProgress] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(() => {
    setError("");
    listStoryTrays()
      .then((res) => setTrays(res.trays))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load stories.");
        setTrays([]);
      });
  }, []);

  useEffect(load, [load]);

  function pickFile(incoming: File | undefined) {
    if (!incoming) return;
    setError("");
    const video = incoming.type.startsWith("video/");
    const reason = video ? validateVideo(incoming) : validateImage(incoming);
    if (reason) {
      setError(reason);
      return;
    }
    if (!video && incoming.size > MAX_IMAGE_BYTES) {
      setError("Photo is larger than 5 MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(incoming);
    setIsVideo(video);
    setPreview(URL.createObjectURL(incoming));
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setIsVideo(false);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function publish() {
    if (!file) {
      setError("Choose a photo or a video first.");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      let url = "";
      if (isVideo) {
        setProgress(0);
        const uploaded = await uploadVideo(file, (p) => setProgress(p));
        url = uploaded.url;
      } else {
        setProgress(0);
        const uploaded = await uploadImage(file, IMAGE_BUCKET);
        url = uploaded.url;
      }
      setProgress(100);
      await createStory({
        media_urls: isVideo ? [] : [url],
        video_url: isVideo ? url : null,
        caption: caption.trim() || null,
        crop: crop || null,
        visibility,
      });
      setNotice("Story published. It will disappear in 24 hours.");
      clearFile();
      setCaption("");
      setCrop("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the story.");
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  }

  async function remove(storyId: string) {
    try {
      await deleteStory(storyId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the story.");
    }
  }

  const mine = trays?.find((t) => t.is_me);
  const others = trays?.filter((t) => !t.is_me) ?? [];
  const tray = viewing !== null && trays ? trays[viewing] : null;

  return (
    <CenFriendShell activeOverride="create">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">Stories</h1>
          <p className="text-[11px] text-slate-500">Share a photo or a short video. Every story expires after 24 hours.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-brand-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/cenfriend/explore")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-bold text-white hover:bg-brand-800"
          >
            <Camera className="h-3.5 w-3.5" /> Back to Explore
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3">
          <ErrorNote message={error} />
        </div>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {notice}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ── Composer ── */}
        <section className="creator-card h-fit overflow-hidden">
          <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold text-forest">Add your story</p>

          <div className="p-4">
            {preview ? (
              <div className="relative overflow-hidden rounded-xl bg-black">
                {isVideo ? (
                  <video src={preview} controls playsInline className="max-h-[300px] w-full object-contain" />
                ) : (
                  <img src={preview} alt="Story preview" className="max-h-[300px] w-full object-contain" />
                )}
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label="Remove media"
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="grid h-[200px] w-full place-items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span>
                  <ImagePlus className="mx-auto h-7 w-7 text-brand-600" />
                  <span className="mt-2 block text-xs font-bold text-forest">Choose photo or video</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">JPG, PNG, WebP up to 5 MB · MP4, WebM, MOV</span>
                </span>
              </button>
            )}

            <input
              ref={fileInput}
              type="file"
              accept={`${ACCEPTED_IMAGE_TYPES},${ACCEPTED_VIDEO_TYPES}`}
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="hidden"
            />

            <div className="mt-3 space-y-2.5">
              <Field label="Caption (optional)">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={200}
                  rows={2}
                  placeholder="What is happening on your farm today?"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Crop">
                  <Select value={crop} onChange={(e) => setCrop(e.target.value)}>
                    <option value="">Not specified</option>
                    {CROPS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Who can see it">
                  <Select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "followers")}>
                    <option value="public">Everyone</option>
                    <option value="followers">Followers only</option>
                  </Select>
                </Field>
              </div>

              {progress !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}

              <button
                type="button"
                onClick={() => void publish()}
                disabled={!file || publishing}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 text-xs font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {publishing ? "Publishing…" : "Publish story"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Active stories ── */}
        <section className="space-y-4">
          <div className="creator-card overflow-hidden">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold text-forest">Your active stories</p>
            {trays === null ? (
              <p className="flex items-center gap-2 px-4 py-6 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            ) : !mine || mine.stories.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-500">
                You have no active story. Publish one above — it will appear here and in the story bar on Explore.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto p-4 scrollbar-none">
                {mine.stories.map((s) => (
                  <div key={s.id} className="w-[104px] shrink-0">
                    <div className="relative h-[150px] overflow-hidden rounded-xl bg-slate-900">
                      {s.video_url ? (
                        <video src={s.video_url} muted playsInline className="h-full w-full object-cover" />
                      ) : (
                        <img src={s.media_urls[0]} alt="" className="h-full w-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(s.id)}
                        aria-label="Delete story"
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {new Date(s.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="creator-card overflow-hidden">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold text-forest">Stories from people you follow</p>
            {trays === null ? (
              <FeedSkeleton count={0} />
            ) : others.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-500">
                No stories right now.{" "}
                <Link to="/cenfriend/explore?tab=people" className="font-bold text-brand-700 hover:underline">
                  Follow more people
                </Link>{" "}
                to see theirs here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {others.map((trayItem) => {
                  const index = trays?.indexOf(trayItem) ?? 0;
                  return (
                    <li key={trayItem.user.id}>
                      <button
                        type="button"
                        onClick={() => setViewing(index)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span className={`rounded-full p-[2px] ${trayItem.all_viewed ? "bg-slate-200" : "bg-gradient-to-tr from-brand-600 via-teal-400 to-amber-300"}`}>
                          <span className="block rounded-full bg-white p-[2px]">
                            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-brand-700 text-[11px] font-bold text-white">
                              {trayItem.user.avatar_url ? (
                                <img src={trayItem.user.avatar_url} alt="" className="h-10 w-10 object-cover" />
                              ) : (
                                (trayItem.user.full_name ?? "?").slice(0, 2).toUpperCase()
                              )}
                            </span>
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-forest">
                            {trayItem.user.full_name ?? trayItem.user.username ?? "Kalika member"}
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            {trayItem.stories.length} {trayItem.stories.length === 1 ? "story" : "stories"}
                            {trayItem.all_viewed ? " · seen" : ""}
                          </span>
                        </span>
                        {trayItem.stories.some((s) => s.video_url) ? (
                          <Video className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ImagePlus className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {tray && trays && (
        <StoryViewer
          tray={tray}
          onClose={() => setViewing(null)}
          onNextTray={() => setViewing((i) => (i === null || i + 1 >= trays.length ? null : i + 1))}
          onPrevTray={() => setViewing((i) => (i === null || i <= 0 ? i : i - 1))}
        />
      )}
    </CenFriendShell>
  );
}
