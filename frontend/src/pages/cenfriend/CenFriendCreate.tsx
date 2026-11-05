import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, ImagePlus, Loader2, Lock, MapPin, Save, Users, X } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { ErrorNote, PrimaryButton, Textarea } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { createPost } from "@/lib/social";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES, uploadImage, validateImage } from "@/lib/storage";

/**
 * Create a CenFriend post.
 *
 * Media uploads go straight to the existing Supabase Storage bucket
 * (`product-images`, already public and already used by the marketplace), so
 * video and photo bytes never pass through FastAPI and never touch Postgres.
 * Only the resulting public URLs are posted to the API.
 *
 * The audience selector maps to the three visibilities the API understands.
 * "Only me" doubles as the draft state, so a post started but not ready can be
 * saved without publishing.
 */

const VISIBILITIES = [
  { key: "public", label: "Everyone", icon: Globe, hint: "Anyone on Kalika can see this" },
  { key: "followers", label: "Followers", icon: Users, hint: "Only people who follow you" },
  { key: "private", label: "Only me", icon: Lock, hint: "Saved as a draft — nobody else sees it" },
] as const;

type Visibility = (typeof VISIBILITIES)[number]["key"];

export default function CenFriendCreate() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [location, setLocation] = useState("");
  const [crop, setCrop] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Shows the tags/mentions the server will index, so the author can see them
  // before posting rather than discovering them afterwards.
  const detected = useMemo(() => {
    const tagMatches = body.match(/#[\p{L}0-9_]{1,50}/giu) ?? [];
    const mentionMatches = body.match(/@[a-z0-9_.]{3,30}/gi) ?? [];
    const tags = [...new Set(tagMatches.map((t) => t.toLowerCase()))];
    const mentions = [...new Set(mentionMatches.map((m) => m.toLowerCase()))];
    return { tags, mentions };
  }, [body]);

  const remaining = 2000 - body.length;

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setError("");
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (files.length + accepted.length >= 10) {
        setError("A post can carry up to 10 photos. Use a video for longer clips.");
        break;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`${file.name} is larger than 5 MB.`);
        continue;
      }
      const reason = validateImage(file);
      if (reason) {
        setError(`${file.name}: ${reason}`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;
    setFiles((prev) => [...prev, ...accepted]);
    setPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
  }

  function removeFile(index: number) {
    setPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function publish(asDraft: boolean) {
    setError("");
    if (!body.trim() && files.length === 0) {
      setError("Write something or attach a photo before posting.");
      return;
    }
    if (body.length > 2000) {
      setError("Keep the post under 2000 characters.");
      return;
    }

    setSaving(true);
    try {
      const media_urls: string[] = [];
      if (files.length > 0) {
        setUploading(true);
        for (let i = 0; i < files.length; i += 1) {
          setUploadNote(`Uploading photo ${i + 1} of ${files.length}…`);
          const { url } = await uploadImage(files[i], IMAGE_BUCKET);
          media_urls.push(url);
        }
        setUploading(false);
        setUploadNote("");
      }

      await createPost({
        body: body.trim(),
        media_urls,
        post_kind: media_urls.length > 1 ? "gallery" : media_urls.length === 1 ? "image" : "text",
        visibility: asDraft || visibility === "private" ? "private" : visibility,
        is_draft: asDraft || visibility === "private",
        location_name: location.trim() || null,
        crop: crop.trim() || null,
      });

      previews.forEach((url) => URL.revokeObjectURL(url));
      navigate("/cenfriend");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the post.");
    } finally {
      setSaving(false);
      setUploading(false);
      setUploadNote("");
    }
  }

  return (
    <CenFriendShell activeOverride="create">
      <div className="mb-3">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">Create post</h1>
        <p className="text-[11px] text-slate-500">
          Share a crop update, a question or a photo from the field.
        </p>
      </div>

      <div className="creator-card">
        <div className="flex items-start gap-3 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-forest text-xs font-bold text-white">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-9 w-9 object-cover" />
            ) : (
              (profile?.full_name ?? "CA").slice(0, 2).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-forest">{profile?.full_name ?? "Your account"}</p>
            <p className="text-[10px] text-slate-500">{profile?.role ?? "Kalika member"}</p>
          </div>
        </div>

        <div className="space-y-3 px-3.5 pb-3.5">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={2100}
            placeholder="What is happening in your field today? Use #crop and @name to tag others."
            aria-label="Post text"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>
              {detected.tags.length > 0 && <span className="mr-2 text-brand-700">{detected.tags.join(" ")}</span>}
              {detected.mentions.length > 0 && <span className="text-violet-700">{detected.mentions.join(" ")}</span>}
            </span>
            <span className={remaining < 0 ? "font-bold text-rose-600" : ""}>{remaining} characters left</span>
          </div>

          {/* Photo previews */}
          {previews.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {previews.map((src, i) => (
                <div key={src} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                  <img src={src} alt={`Attached photo ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {previews.length < 10 && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-brand-300 hover:text-brand-700"
                  aria-label="Add more photos"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ImagePlus className="h-3.5 w-3.5 text-brand-700" /> Photos
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <MapPin className="h-3 w-3 text-slate-400" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (optional)"
                aria-label="Location"
                maxLength={120}
                className="w-32 bg-transparent text-[11px] outline-none placeholder:text-slate-400"
              />
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <input
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                placeholder="Crop (optional)"
                aria-label="Crop"
                maxLength={80}
                className="w-28 bg-transparent text-[11px] outline-none placeholder:text-slate-400"
              />
            </span>
          </div>

          {/* Audience */}
          <div>
            <p className="mb-1 text-[11px] font-bold text-slate-600">Who can see this?</p>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {VISIBILITIES.map(({ key, label, icon: Icon, hint }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVisibility(key)}
                  aria-pressed={visibility === key}
                  className={`flex items-start gap-2 rounded-lg border p-2 text-left transition ${visibility === key ? "border-brand-700 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${visibility === key ? "text-brand-700" : "text-slate-400"}`} />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold text-forest">{label}</span>
                    <span className="block text-[10px] leading-snug text-slate-500">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {(error || uploadNote) && (
            <div className="space-y-2">
              {error && <ErrorNote message={error} />}
              {uploadNote && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> {uploadNote}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => void publish(true)}
              disabled={saving || uploading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" /> Save draft
            </button>
            <PrimaryButton onClick={() => void publish(false)} disabled={saving || uploading}>
              {saving ? "Publishing…" : "Publish"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </CenFriendShell>
  );
}
