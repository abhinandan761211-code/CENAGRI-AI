import { BadgeCheck, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { compactCount, formatDuration, timeAgo } from "@/lib/creator";
import type { Video } from "@/lib/creator";

/**
 * One Short in the horizontal rail.
 *
 * Shorts are vertical, so the thumbnail is 9:16 rather than the feed's 16:9.
 * A Short without a thumbnail falls back to a first-frame poster if the row
 * has a video file, otherwise to a branded placeholder.
 */
export default function ShortsCard({ video }: { video: Video }) {
  const channel = video.creator;
  const duration = formatDuration(video.duration_sec);

  return (
    <Link
      to={`/shorts/${video.id}`}
      className="group w-[124px] shrink-0 sm:w-[148px]"
      aria-label={`${video.title} — Short by ${channel?.channel_name ?? "creator"}`}
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-[var(--cr-card-hover)] ring-1 ring-[var(--cr-border)] transition group-hover:ring-[var(--cr-green)]/50">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="creator-thumb grid h-full w-full place-items-center bg-gradient-to-br from-[#e9eef5] to-[#f8fafc]">
            <Play className="h-7 w-7 text-slate-400" />
          </div>
        )}

        {/* Legibility scrim for the overlaid counts. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" />

        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
          <Play className="h-2.5 w-2.5 fill-current" />
          Short
        </span>

        {duration && (
          <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {duration}
          </span>
        )}

        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] font-semibold text-white">
          <Play className="h-2.5 w-2.5 fill-current" />
          {compactCount(video.view_count)}
        </span>
      </div>

      <h3 className="creator-heading mt-1.5 line-clamp-2 text-[12px] font-semibold leading-snug">
        {video.title}
      </h3>
      <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-400">
        {channel?.channel_name ?? "Creator"}
        {channel?.is_verified && <BadgeCheck className="h-2.5 w-2.5 shrink-0 text-[var(--cr-green)]" />}
        {video.published_at && <span className="text-slate-500">· {timeAgo(video.published_at)}</span>}
      </p>
    </Link>
  );
}
