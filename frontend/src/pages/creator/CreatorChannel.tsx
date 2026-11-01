import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, MapPin, Share2, Upload, Users, Video as VideoIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import CreatorShell, {
  CREATOR_ROUTES,
  CreatorEmpty,
  CreatorError,
  CreatorLoading,
  CreatorStat,
  CreatorSection,
} from "@/components/creator/CreatorShell";
import VideoCard from "@/components/creator/VideoCard";
import { useAuth } from "@/hooks/useAuth";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import {
  compactCount,
  getChannelById,
  isSubscribed,
  listCreatorVideos,
  toggleSubscribe,
} from "@/lib/creator";
import type { CreatorProfile, Video } from "@/lib/creator";

type Tab = "home" | "videos" | "shorts" | "about";

/**
 * My Channel / public channel page.
 *
 * With no `:id` it shows the signed-in creator's own channel (with an Edit
 * button); with `/channel/:id` it shows anyone's public channel.
 */
export default function CreatorChannel() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const mine = useCreatorChannel();

  const [channel, setChannel] = useState<CreatorProfile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [subscribed, setSubscribed] = useState(false);

  const isOwner = Boolean(channel && user && channel.owner_id === user.id);

  useEffect(() => {
    let alive = true;

    async function run() {
      setState("loading");
      try {
        const target = id ? await getChannelById(id) : mine.channel;
        if (!alive) return;
        if (!target) {
          setChannel(null);
          setState("ready");
          return;
        }
        setChannel(target);
        const rows = await listCreatorVideos(target.id);
        if (!alive) return;
        setVideos(rows);
        if (user && target.owner_id !== user.id) {
          setSubscribed(await isSubscribed(target.id));
        }
        setState("ready");
      } catch (err) {
        if (!alive) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Could not load this channel.");
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [id, mine.channel, user]);

  const shorts = useMemo(() => videos.filter((v) => v.kind === "short"), [videos]);
  const longVideos = useMemo(() => videos.filter((v) => v.kind === "video"), [videos]);

  async function handleSubscribe() {
    if (!channel) return;
    const next = !subscribed;
    setSubscribed(next);
    try {
      await toggleSubscribe(channel.id, subscribed);
    } catch {
      setSubscribed(subscribed);
    }
  }

  async function share() {
    if (!channel) return;
    const url = `${window.location.origin}/channel/${channel.id}`;
    try {
      if (navigator.share) await navigator.share({ title: channel.channel_name, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* dismissed */
    }
  }

  if (state === "loading") {
    return (
      <CreatorShell>
        <CreatorLoading label="Loading channel…" />
      </CreatorShell>
    );
  }

  if (state === "error") {
    return (
      <CreatorShell>
        <CreatorError message={error} />
      </CreatorShell>
    );
  }

  if (!channel) {
    return (
      <CreatorShell title="My Channel">
        <div className="creator-card">
          <CreatorEmpty
            icon={VideoIcon}
            title="No channel set up yet"
            description="Create your channel to get a public page, a subscriber button and a place for your videos."
            action={
              <Link to={CREATOR_ROUTES.settings} className="creator-btn-primary h-9 px-4 text-xs">
                Create my channel
              </Link>
            }
          />
        </div>
      </CreatorShell>
    );
  }

  return (
    <CreatorShell>
      {/* Banner */}
      <div className="creator-card overflow-hidden">
        <div className="relative h-32 w-full bg-gradient-to-r from-[#16C784]/30 via-[#2ED3B7]/20 to-[#0B1020] sm:h-40">
          {channel.banner_url && (
            <img src={channel.banner_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4 px-4 pb-4 sm:px-5">
          <span className="-mt-8 grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-[#151F32] bg-[#16C784] text-2xl font-black text-[#0B1020] sm:h-24 sm:w-24">
            {channel.avatar_url ? (
              <img src={channel.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              channel.channel_name.slice(0, 2).toUpperCase()
            )}
          </span>

          <div className="min-w-0 flex-1 pt-1">
            <h1 className="flex items-center gap-1.5 text-xl font-extrabold text-white">
              {channel.channel_name}
              {channel.is_verified && <BadgeCheck className="h-5 w-5 text-[#16C784]" />}
            </h1>
            <p className="text-[11px] text-slate-400">
              {channel.handle ? `@${channel.handle} · ` : ""}
              {compactCount(channel.subscriber_count)} subscribers · {channel.video_count} videos
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
              {(channel.district || channel.state) && (
                <>
                  <MapPin className="h-3 w-3" />
                  {[channel.district, channel.state].filter(Boolean).join(", ")}
                </>
              )}
              {channel.expertise?.length ? <span>· {channel.expertise.join(", ")}</span> : null}
            </p>
          </div>

          <div className="flex gap-2 pb-1">
            {isOwner ? (
              <>
                <Link to={CREATOR_ROUTES.settings} className="creator-btn-ghost h-9 px-4 text-xs">
                  Edit channel
                </Link>
                <Link to={CREATOR_ROUTES.upload} className="creator-btn-primary h-9 px-4 text-xs">
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSubscribe()}
                  className={subscribed ? "creator-btn-ghost h-9 px-4 text-xs" : "creator-btn-primary h-9 px-4 text-xs"}
                >
                  {subscribed ? "Subscribed" : "Subscribe"}
                </button>
                <button type="button" onClick={() => void share()} className="creator-btn-ghost h-9 px-3 text-xs">
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto">
        {(
          [
            ["home", "Home"],
            ["videos", "Videos"],
            ["shorts", "Shorts"],
            ["about", "About"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`creator-chip ${tab === key ? "is-active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "home" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <CreatorStat label="Videos" value={channel.video_count} icon={VideoIcon} />
            <CreatorStat
              label="Subscribers"
              value={compactCount(channel.subscriber_count)}
              icon={Users}
              tone="teal"
            />
            <CreatorStat
              label="Lifetime views"
              value={compactCount(channel.total_views)}
              icon={BadgeCheck}
              tone="violet"
            />
          </div>

          <CreatorSection title="Latest videos">
            {videos.length === 0 ? (
              <CreatorEmpty
                icon={VideoIcon}
                title="No videos published yet"
                description="Videos you publish appear on this channel for farmers to watch."
              />
            ) : (
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {videos.slice(0, 6).map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            )}
          </CreatorSection>
        </>
      )}

      {tab === "videos" && (
        <CreatorSection title="Videos">
          {longVideos.length === 0 ? (
            <CreatorEmpty icon={VideoIcon} title="No long videos yet" description="Long-form farming videos will be listed here." />
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {longVideos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          )}
        </CreatorSection>
      )}

      {tab === "shorts" && (
        <CreatorSection title="Shorts">
          {shorts.length === 0 ? (
            <CreatorEmpty
              icon={VideoIcon}
              title="No shorts yet"
              description="Vertical Shorts appear here and in the hub's shorts strip."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
              {shorts.map((video) => (
                <VideoCard key={video.id} video={video} variant="compact" />
              ))}
            </div>
          )}
        </CreatorSection>
      )}

      {tab === "about" && (
        <CreatorSection title="About this channel">
          <dl className="divide-y divide-white/5">
            {[
              ["Description", channel.description || "No description added yet."],
              ["Expertise", channel.expertise?.join(", ") || "—"],
              ["Languages", channel.languages?.join(", ") || "—"],
              ["Location", [channel.district, channel.state].filter(Boolean).join(", ") || "—"],
              ["Website", channel.website || "—"],
              ["Joined", new Date(channel.created_at).toLocaleDateString("en-IN")],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap gap-2 px-4 py-3">
                <dt className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </dt>
                <dd className="min-w-0 flex-1 text-[12px] leading-relaxed text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
        </CreatorSection>
      )}
    </CreatorShell>
  );
}
