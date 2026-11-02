import { useMemo, useState } from "react";
import {
  BarChart3,
  Clock,
  Eye,
  MessageCircle,
  ThumbsUp,
  TrendingUp,
  Users,
} from "lucide-react";
import CreatorShell, {
  CreatorEmpty,
  CreatorError,
  CreatorLoading,
  CreatorSection,
  CreatorStat,
} from "@/components/creator/CreatorShell";
import { TrendChart } from "@/components/creator/CreatorHomePanel";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  compactCount,
  formatDuration,
  getChannelStats,
  getDailyViews,
  getTopVideos,
} from "@/lib/creator";
import type { DayPoint, Video, VideoStats } from "@/lib/creator";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 28, label: "28 days" },
  { days: 90, label: "90 days" },
] as const;

/**
 * Creator analytics.
 *
 * Every number is a live query against `video_views`, `videos` and
 * `creator_profiles`. Metrics that need data the platform does not collect yet
 * (impressions, click-through rate, retention curve) are shown as "not
 * tracked" instead of being estimated — an invented CTR would be worse than
 * an honest gap.
 */
export default function CreatorAnalytics() {
  const { channel, state: channelState, error: channelError } = useCreatorChannel();
  const [days, setDays] = useState<number>(28);

  const stats = useRetailerData<VideoStats | null>(
    () => (channel ? getChannelStats(channel.id, days) : Promise.resolve(null)),
    [channel?.id, days]
  );
  const trend = useRetailerData<DayPoint[]>(
    () => (channel ? getDailyViews(channel.id, days) : Promise.resolve([])),
    [channel?.id, days]
  );
  const top = useRetailerData<Video[]>(
    () => (channel ? getTopVideos(channel.id, 8) : Promise.resolve([])),
    [channel?.id]
  );

  const summary = stats.data;
  const points = trend.data ?? [];
  const topVideos = top.data ?? [];

  const peak = useMemo(() => Math.max(1, ...points.map((p) => p.views)), [points]);

  if (channelState === "error") {
    return (
      <CreatorShell title="Analytics">
        <CreatorError message={channelError} />
      </CreatorShell>
    );
  }

  if (channelState === "ready" && !channel) {
    return (
      <CreatorShell title="Analytics">
        <div className="creator-card">
          <CreatorEmpty
            icon={BarChart3}
            title="No channel yet"
            description="Analytics starts collecting once your channel exists and your videos are watched."
          />
        </div>
      </CreatorShell>
    );
  }

  return (
    <CreatorShell title="Analytics" subtitle={channel ? channel.channel_name : undefined}>
      <div className="flex gap-1.5">
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            onClick={() => setDays(range.days)}
            aria-pressed={days === range.days}
            className={`creator-chip ${days === range.days ? "is-active" : ""}`}
          >
            Last {range.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CreatorStat
          label="Views"
          value={summary ? compactCount(summary.views) : "—"}
          icon={Eye}
          hint={`Last ${days} days`}
        />
        <CreatorStat
          label="Watch time"
          value={summary ? `${Math.round(summary.watchSeconds / 60).toLocaleString("en-IN")} min` : "—"}
          icon={Clock}
          tone="teal"
          hint="From recorded view events"
        />
        <CreatorStat
          label="Avg. view duration"
          value={summary ? formatDuration(summary.avgWatchSeconds) : "—"}
          icon={TrendingUp}
          tone="violet"
          hint={`Per view, last ${days} days`}
        />
        <CreatorStat
          label="Subscribers"
          value={summary ? compactCount(summary.subscribers) : "—"}
          icon={Users}
          tone="amber"
          hint="Total on this channel"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CreatorStat label="Likes" value={summary ? compactCount(summary.likes) : "—"} icon={ThumbsUp} />
        <CreatorStat
          label="Comments"
          value={summary ? compactCount(summary.comments) : "—"}
          icon={MessageCircle}
          tone="violet"
        />
      </div>

      <CreatorSection title="Views over time" description={`Daily views, last ${days} days`}>
        {trend.state === "loading" ? (
          <CreatorLoading label="Building the chart…" />
        ) : (
          <div className="p-4">
            <TrendChart points={points} />
          </div>
        )}
      </CreatorSection>

      <CreatorSection title="Top performing videos" description="Ranked by total views">
        {top.state === "loading" ? (
          <CreatorLoading label="Ranking videos…" />
        ) : topVideos.length === 0 ? (
          <CreatorEmpty
            icon={BarChart3}
            title="No published videos yet"
            description="Publish a video and its performance will be ranked here."
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {topVideos.map((video, index) => {
              const share = peak > 0 ? Math.min(100, (video.view_count / (topVideos[0]?.view_count || 1)) * 100) : 0;
              return (
                <li key={video.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/5 text-[10px] font-bold text-slate-300">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="creator-heading truncate text-[13px] font-semibold">{video.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {compactCount(video.view_count)} views · {compactCount(video.like_count)} likes ·{" "}
                        {compactCount(video.comment_count)} comments
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {formatDuration(video.duration_sec)}
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-[#16C784]" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CreatorSection>

      <CreatorSection title="Not tracked yet" description="These need data the platform does not collect">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[
            ["Impressions", "Requires logging every thumbnail shown in a feed."],
            ["Click-through rate", "Needs impressions to divide views by."],
            ["Audience retention", "Requires periodic playback-position sampling."],
          ].map(([label, why]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-[13px] font-bold text-slate-300">Not tracked</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{why}</p>
            </div>
          ))}
        </div>
      </CreatorSection>
    </CreatorShell>
  );
}
