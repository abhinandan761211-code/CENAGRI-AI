/**
 * Supabase Storage helpers — one place for every upload in the app.
 *
 * The database stores only the public URL (`retailer_products.image_url` …);
 * the bytes live in a bucket created by `database/supabase/storage.sql`.
 * Files are always written to `<bucket>/<user-id>/<name>` so the bucket policy
 * can prove the upload belongs to the signed-in user.
 *
 * Nothing here is mocked: if the bucket is missing the upload fails with a
 * real error the caller shows to the user.
 */
import { supabase } from "@/lib/supabase";

export const IMAGE_BUCKET = "product-images";
export const AVATAR_BUCKET = "avatars";

/** Limits must match `file_size_limit` in storage.sql. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const ACCEPTED_IMAGE_TYPES = ALLOWED_TYPES.join(",");

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** Human file size, e.g. "3.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a file before uploading so the user gets a clear message instead
 * of a generic Storage error. Returns null when the file is fine.
 */
export function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Use a JPG, PNG, WebP or GIF image.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Image is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_IMAGE_BYTES)}.`;
  }
  return null;
}

/** A safe, unique object name: keeps the extension, drops odd characters. */
function objectName(file: File): string {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${unique}.${ext || "jpg"}`;
}

/**
 * Upload an image and return its public URL.
 *
 * @param file    the file chosen in an <input type="file">
 * @param bucket  storage bucket (defaults to the product-images bucket)
 */
export async function uploadImage(
  file: File,
  bucket = IMAGE_BUCKET
): Promise<{ url: string; path: string }> {
  const invalid = validateImage(file);
  if (invalid) throw new Error(invalid);

  const supabaseClient = client();
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const path = `${user.id}/${objectName(file)}`;

  const { error } = await supabaseClient.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        "The image bucket is not set up yet. Run database/supabase/storage.sql in Supabase."
      );
    }
    if (/row-level security|policy/i.test(error.message)) {
      throw new Error("You do not have permission to upload to this bucket.");
    }
    throw error;
  }

  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Delete a previously uploaded file. Best-effort: a failure here must never
 * block saving the product, so the error is swallowed by callers that use it
 * for cleanup.
 */
export async function deleteImage(path: string, bucket = IMAGE_BUCKET): Promise<void> {
  await client().storage.from(bucket).remove([path]);
}

/** Object path from a public URL, e.g. ".../product-images/<uid>/a.jpg" → "<uid>/a.jpg". */
export function pathFromPublicUrl(url: string, bucket = IMAGE_BUCKET): string | null {
  const marker = `/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length).split("?")[0];
}

/* ── Creator media
 * Video files and thumbnails live in their own buckets (creator-storage.sql).
 * The database stores only the Storage key + public URL — never the bytes.
 * ─────────────────────────────────────────────────────────────────────────── */

export const VIDEO_BUCKET = "kisan-video-files";
export const THUMB_BUCKET = "video-thumbnails";
export const BANNER_BUCKET = "channel-banners";

/** 500 MB — must match `file_size_limit` in creator-storage.sql. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const ACCEPTED_VIDEO_TYPES = ALLOWED_VIDEO_TYPES.join(",");

/** Validate a video before uploading so the message is specific. */
export function validateVideo(file: File): string | null {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return "Use an MP4, WebM or MOV video.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return `Video is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_VIDEO_BYTES)}.`;
  }
  return null;
}

/**
 * Upload a video file with progress reporting.
 *
 * Supabase's `.upload()` has no progress events, so the file is sent through
 * `XMLHttpRequest` to the Storage REST endpoint with the user's JWT. That is
 * the same endpoint the SDK uses; it just lets us surface a percentage.
 */
export function uploadVideo(
  file: File,
  onProgress?: (percent: number) => void,
  bucket = VIDEO_BUCKET
): Promise<{ url: string; path: string }> {
  const invalid = validateVideo(file);
  if (invalid) return Promise.reject(new Error(invalid));

  const supabaseClient = client();
  return supabaseClient.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    const base = import.meta.env.VITE_SUPABASE_URL?.trim();
    if (!token || !base) throw new Error("You are not signed in.");

    return supabaseClient.auth.getUser().then(({ data: userData }) => {
      const userId = userData.user?.id;
      if (!userId) throw new Error("You are not signed in.");

      const path = `${userId}/${objectName(file)}`;

      return new Promise<{ url: string; path: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/storage/v1/object/${bucket}/${path}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.setRequestHeader("cache-control", "max-age=31536000");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const { data: pub } = supabaseClient.storage.from(bucket).getPublicUrl(path);
            resolve({ url: pub.publicUrl, path });
            return;
          }
          if (/bucket not found/i.test(xhr.responseText)) {
            reject(
              new Error(
                "The video bucket is not set up yet. Run database/supabase/creator-storage.sql in Supabase."
              )
            );
            return;
          }
          reject(new Error(xhr.responseText || `Upload failed (${xhr.status}).`));
        };

        xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.send(file);
      });
    });
  });
}

/** Read a video's duration locally with a temporary <video> element. */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const seconds = Number.isFinite(el.duration) ? Math.round(el.duration) : 0;
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}
