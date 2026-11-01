import { BadgeCheck, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { compactCount, formatDuration, timeAgo } from "@/lib/creator";
import type { Video } from "@/lib/creator";

/**
 * One video in a feed. Thumbnails are lazy-loaded so a page of 24 cards does
 * not fetch 24 full-size images at once.
 */
export default function VideoCard({
  video,
  variant = "grid",
}: {
  video: Video;
  variant?: "grid" | "row" | "compact";
}) {
  const channel = video.creator;
  const duration = formatDuration(video.duration_sec);

  const thumb = (
    <div
      className={`relative overflow-hidden rounded-xl bg-[#151F32] ${
        variant === "row" ? "w-40 shrink-0 sm:w-56" : ""
      }`}
    >
      <div className={variant === "row" ? "aspect-video" : "aspect-video"}>
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1b2740] to-[#0f172a]">
            <Play className="h-8 w-8 text-slate-600" />
          </div>
        )}
      </div>
      {duration && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {duration}
        </span>
      )}
      {video.kind === "short" && (
        <span className="absolute left-1.5 top-1.5 rounded bg-[#16C784] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#0B1020]">
          Short
        </span>
      )}
    </div>
  );

  const meta = (
    <div className="min-w-0 flex-1">
      <h3
        className={`line-clamp-2 font-semibold leading-snug text-white ${
          variant === "compact" ? "text-[12px]" : "text-[13px]"
        }`}
      >
        {video.title}
      </h3>
      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-400">
        {channel?.channel_name ?? "Unknown channel"}
        {channel?.is_verified && <BadgeCheck className="h-3 w-3 shrink-0 text-[#16C784]" />}
      </p>
      <p className="text-[11px] text-slate-500">
        {compactCount(video.view_count)} views · {timeAgo(video.published_at)}
      </p>
    </div>
  );

  if (variant === "row") {
    return (
      <Link to={`/watch/${video.id}`} className="group flex gap-3 rounded-xl p-1 hover:bg-white/5">
        {thumb}
        {meta}
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link to={`/watch/${video.id}`} className="group flex gap-2 rounded-lg p-1 hover:bg-white/5">
        <div className="w-28 shrink-0">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-[#151F32]">
            {video.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <Play className="h-5 w-5 text-slate-600" />
              </div>
            )}
          </div>
        </div>
        {meta}
      </Link>
    );
  }

  return (
    <Link
      to={`/watch/${video.id}`}
      className="creator-card creator-card-hover group block overflow-hidden"
    >
      {thumb}
      <div className="p-3">{meta}</div>
    </Link>
  );
}
