import { useMemo } from "react";
import {
  BarChart3,
  Clapperboard,
  Eye,
  MessageCircle,
  Radio,
  ThumbsUp,
  Upload,
  User,
  Users,
  Video as VideoIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import CreatorShell, {
  CREATOR_ROUTES,
  CreatorEmpty,
  CreatorError,
  CreatorLoading,
  CreatorSection,
  CreatorStat,
} from "@/components/creator/CreatorShell";
import VideoCard from "@/components/creator/VideoCard";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  compactCount,
  formatDuration,
  getDailyViews,
  listMyVideos,
  timeAgo,
} from "@/lib/creator";
import type { DayPoint, Video } from "@/lib/creator";

/**
 * Creator dashboard — the four stat cards from the brief (views, subscribers,
 * watch time, earnings) plus recent uploads, top videos, a 28-day trend and
 * quick actions.
 *
 * Earnings are shown as "not enabled" rather than a fake rupee figure:
 * there is no payment provider wired up yet, and inventing a number here
 * would be the one lie a creator would act on.
 */
export default function CreatorHome() {
  const { channel, state, error, reload } = useCreatorChannel();
  const videos = useRetailerData<Video[]>(() => listMyVideos(), []);
  const trend = useRetailerData<DayPoint[]>(
    () => (channel ? getDailyViews(channel.id, 28) : Promise.resolve([])),
    [channel?.id]
  );

  const list = videos.data ?? [];
  const published = useMemo(() => list.filter((v) => v.status === "published"), [list]);
  const recent = useMemo(() => list.slice(0, 4), [list]);
  const top = useMemo(
    () => [...published].sort((a, b) => b.view_count - a.view_count).slice(0, 4),
    [published]
  );

  const totalViews = list.reduce((sum, v) => sum + Number(v.view_count || 0), 0);
  const totalLikes = list.reduce((sum, v) => sum + Number(v.like_count || 0), 0);
  const totalComments = list.reduce((sum, v) => sum + Number(v.comment_count || 0), 0);
  const watchMinutes = Math.round((trend.data ?? []).reduce((s, d) => s + d.views, 0) * 1.6);

  const loading = state === "loading" || videos.state === "loading";

  if (state === "error") {
    return (
      <CreatorShell title="Home">
        <CreatorError message={error} onRetry={() => void reload()} />
      </CreatorShell>
    );
  }

  return (
    <CreatorShell
      title={channel ? channel.channel_name : "Creator studio"}
      subtitle={
        channel
          ? `${compactCount(channel.subscriber_count)} subscribers · ${channel.video_count} videos`
          : "Set up your channel to start publishing"
      }
      action={
        channel ? (
          <Link
            to={CREATOR_ROUTES.upload}
            className="creator-btn-primary h-9 px-4 text-xs"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Link>
        ) : undefined
      }
    >
      {/* No channel yet → one clear call to action, nothing else. */}
      {!loading && !channel && (
        <div className="creator-card">
          <CreatorEmpty
            icon={User}
            title="Create your channel first"
            description="A channel holds your name, banner and the farming topics you cover. You need one before uploading videos or going live."
            action={
              <Link to={CREATOR_ROUTES.settings} className="creator-btn-primary h-9 px-4 text-xs">
                Set up my channel
              </Link>
            }
          />
        </div>
      )}

      {channel && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CreatorStat
              label="Total views"
              value={loading ? "—" : compactCount(totalViews)}
              icon={Eye}
              hint={`${channel.video_count} published videos`}
            />
            <CreatorStat
              label="Subscribers"
              value={compactCount(channel.subscriber_count)}
              icon={Users}
              tone="teal"
              hint="People following your channel"
            />
            <CreatorStat
              label="Watch time"
              value={loading ? "—" : `${watchMinutes.toLocaleString("en-IN")} min`}
              icon={BarChart3}
              tone="violet"
              hint="Estimated from views in 28 days"
            />
            <CreatorStat
              label="Estimated earnings"
              value="Not enabled"
              icon={ThumbsUp}
              tone="amber"
              hint="Monetization is coming soon"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <CreatorSection
              title="Recent uploads"
              description="Your latest videos and their status"
              action={
                <Link to={CREATOR_ROUTES.channel} className="text-[11px] font-bold text-[#16C784]">
                  View all
                </Link>
              }
            >
              {videos.state === "error" ? (
                <div className="p-4">
                  <CreatorError message={videos.error} onRetry={() => void videos.reload()} />
                </div>
              ) : recent.length === 0 ? (
                <CreatorEmpty
                  icon={VideoIcon}
                  title="No videos yet"
                  description="Upload your first farming video — it appears here with its views and status."
                  action={
                    <Link to={CREATOR_ROUTES.upload} className="creator-btn-primary h-9 px-4 text-xs">
                      Upload a video
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-white/5">
                  {recent.map((video) => (
                    <li key={video.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-black/40">
                        {video.thumbnail_url && (
                          <img
                            src={video.thumbnail_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-white">{video.title}</p>
                        <p className="text-[11px] text-slate-400">
                          {compactCount(video.view_count)} views ·{" "}
                          {video.published_at ? timeAgo(video.published_at) : "Draft"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          video.status === "published"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : video.status === "draft"
                              ? "bg-slate-500/20 text-slate-300"
                              : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {video.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CreatorSection>

            <CreatorSection title="Top performing" description="Your most-watched videos">
              {top.length === 0 ? (
                <CreatorEmpty
                  icon={BarChart3}
                  title="No performance data yet"
                  description="Once a video is published and watched, your best performers are ranked here."
                />
              ) : (
                <ul className="divide-y divide-white/5">
                  {top.map((video, index) => (
                    <li key={video.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/5 text-[10px] font-bold text-slate-300">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/watch/${video.id}`}
                          className="block truncate text-[13px] font-semibold text-white hover:text-[#16C784]"
                        >
                          {video.title}
                        </Link>
                        <p className="text-[11px] text-slate-400">
                          {compactCount(video.view_count)} views ·{" "}
                          {compactCount(video.like_count)} likes
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {formatDuration(video.duration_sec)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CreatorSection>
          </div>

          <CreatorSection title="Channel performance" description="Views per day, last 28 days">
            {trend.state === "loading" ? (
              <CreatorLoading label="Building the chart…" />
            ) : (
              <div className="p-4">
                <TrendChart points={trend.data ?? []} />
              </div>
            )}
          </CreatorSection>

          <CreatorSection title="Quick actions">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {[
                { label: "Upload video", icon: Upload, to: CREATOR_ROUTES.upload },
                { label: "Create short", icon: Clapperboard, to: CREATOR_ROUTES.shorts },
                { label: "Go live", icon: Radio, to: CREATOR_ROUTES.live },
                { label: "Analytics", icon: BarChart3, to: CREATOR_ROUTES.analytics },
              ].map(({ label, icon: Icon, to }) => (
                <Link
                  key={label}
                  to={to}
                  className="creator-card-hover rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center"
                >
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#16C784]/10 text-[#16C784]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="mt-2 block text-xs font-semibold text-white">{label}</span>
                </Link>
              ))}
            </div>
          </CreatorSection>

          <div className="grid gap-3 sm:grid-cols-2">
            <CreatorStat
              label="Likes received"
              value={compactCount(totalLikes)}
              icon={ThumbsUp}
              tone="teal"
              hint="Across all your videos"
            />
            <CreatorStat
              label="Comments"
              value={compactCount(totalComments)}
              icon={MessageCircle}
              tone="violet"
              hint="Reply from the Comments tab"
            />
          </div>
        </>
      )}
    </CreatorShell>
  );
}

/** Small SVG area chart — no charting dependency. */
export function TrendChart({ points }: { points: DayPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-slate-500">
        No views recorded yet — the trend appears once your videos are watched.
      </p>
    );
  }

  const width = 720;
  const height = 180;
  const pad = 6;
  const max = Math.max(1, ...points.map((p) => p.views));
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (v: number) => pad + (height - pad * 2) * (1 - v / max);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${pad + step * i} ${y(p.views)}`).join(" ");
  const area = `${line} L ${pad + step * (points.length - 1)} ${height - pad} L ${pad} ${height - pad} Z`;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full min-w-[520px]"
        role="img"
        aria-label="Daily views chart"
      >
        <defs>
          <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16C784" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#16C784" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#viewsFill)" />
        <path d={line} fill="none" stroke="#16C784" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{points[0]?.day}</span>
        <span>Peak: {compactCount(max)} views/day</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}
