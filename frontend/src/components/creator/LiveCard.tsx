import { BadgeCheck, Eye, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { compactCount } from "@/lib/creator";
import type { LiveStream } from "@/lib/creator";

/**
 * A live broadcast card.
 *
 * `LiveStream` is demo data today (see `listLiveStreams`), so the card always
 * carries a "Demo" tag. The LIVE badge reads from the same object, which means
 * switching to a real `live_streams` query needs no change here.
 */
export default function LiveCard({ stream }: { stream: LiveStream }) {
  return (
    <article className="group overflow-hidden rounded-xl border border-[var(--cr-border)] bg-[var(--cr-card)] transition hover:border-[var(--cr-green)]/40">
      <div className="relative aspect-video overflow-hidden bg-[var(--cr-card-hover)]">
        <img
          src={stream.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />

        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>

        {stream.isDemo && (
          <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
            Demo
          </span>
        )}

        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <Eye className="h-3 w-3" />
          {compactCount(stream.viewerCount)} watching
        </span>
      </div>

      <div className="space-y-2 p-3">
        <h3 className="creator-heading line-clamp-2 text-[13px] font-semibold leading-snug">
          {stream.title}
        </h3>

        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--cr-green)]/15 text-[10px] font-bold text-[var(--cr-green)]">
            {stream.avatarUrl ? (
              <img src={stream.avatarUrl} alt="" className="h-7 w-7 object-cover" />
            ) : (
              stream.channelName.slice(0, 2).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-slate-600">
              {stream.channelName}
              {stream.isVerified && <BadgeCheck className="h-3 w-3 shrink-0 text-[var(--cr-green)]" />}
            </p>
            <p className="text-[10px] text-slate-500">
              Live since {stream.startedMinutesAgo} min ago
            </p>
          </div>
        </div>

        {stream.channelId ? (
          <Link
            to={`/watch/live/${stream.channelId}`}
            className="creator-btn-primary h-8 w-full text-[11px]"
          >
            <Radio className="h-3 w-3" />
            Watch live
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="Live playback needs an ingest server — see Creator Studio → Live Streaming"
            className="creator-btn-ghost h-8 w-full cursor-not-allowed text-[11px]"
          >
            <Radio className="h-3 w-3" />
            Watch live
          </button>
        )}
      </div>
    </article>
  );
}
