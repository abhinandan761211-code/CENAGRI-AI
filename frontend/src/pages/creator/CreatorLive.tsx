import { Radio, Users } from "lucide-react";
import CreatorShell, { CreatorSection } from "@/components/creator/CreatorShell";

/**
 * Live Streaming — interface only, clearly marked.
 *
 * Live video needs an ingest server (RTMP/SRT), transcoding and a player that
 * can follow an HLS stream. Supabase Storage is not that. Until those exist,
 * this page describes the flow rather than pretending a "Go live" button works.
 */
export default function CreatorLive() {
  return (
    <CreatorShell title="Live Streaming" subtitle="Broadcast to farmers in real time">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-[12px] font-bold text-amber-200">Coming soon</p>
        <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-amber-100/80">
          Live video needs an ingest server (RTMP/SRT), a transcoder and an HLS player. CenAGRI
          does not have that infrastructure yet, so this screen does not offer a working broadcast
          button.
        </p>
      </div>

      <CreatorSection title="Planned broadcast flow">
        <ol className="divide-y divide-white/5">
          {[
            ["Start Live", "Title, description, category and an optional scheduled time."],
            ["Connect", "Stream from a phone app or OBS using the generated stream key."],
            ["Audience", "Live viewer count and live comments appear beside the player."],
            ["End Live", "The recording is saved as a normal video on your channel."],
          ].map(([title, body], index) => (
            <li key={title} className="flex items-start gap-3 px-4 py-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/5 text-[11px] font-bold text-slate-300">
                {index + 1}
              </span>
              <div>
                <p className="creator-heading text-[13px] font-semibold">{title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CreatorSection>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="creator-card flex items-center gap-3 p-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-slate-400">
            <Radio className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Broadcast</p>
            <p className="creator-heading text-sm font-bold">Not available</p>
          </div>
        </div>
        <div className="creator-card flex items-center gap-3 p-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-slate-400">
            <Users className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Live viewers</p>
            <p className="creator-heading text-sm font-bold">—</p>
          </div>
        </div>
      </div>
    </CreatorShell>
  );
}
