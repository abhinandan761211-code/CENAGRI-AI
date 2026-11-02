import { MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import CreatorShell, { CREATOR_ROUTES, CreatorSection } from "@/components/creator/CreatorShell";

/**
 * Messages — creator ↔ farmer / creator conversations.
 *
 * CenAGRI already has a working messaging surface for retailers
 * (`retailer_messages` + `/retailer/messages`). Rather than build a second,
 * parallel inbox that would fragment conversations, this screen explains the
 * situation honestly and links to the existing one.
 *
 * A creator-specific inbox needs a shared `conversations` model that both
 * sides write to — that is a schema change for Phase 2, not a UI task.
 */
export default function CreatorMessages() {
  return (
    <CreatorShell title="Messages" subtitle="Talk to farmers and other creators">
      <CreatorSection title="Creator inbox">
        <div className="space-y-4 p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5 text-[#16C784]">
            <MessageSquare className="h-6 w-6" />
          </span>
          <div>
            <p className="creator-heading text-sm font-semibold">Creator messaging is not enabled yet</p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-slate-400">
              CenAGRI already has a working message thread for shops and their customers. A
              creator-specific inbox needs one shared conversation model so a farmer's message
              reaches you instead of bouncing between two separate systems — that is a schema
              change planned for the next phase.
            </p>
          </div>

          <div className="mx-auto grid max-w-xl gap-2 text-left">
            {[
              ["Today", "Viewers can comment on your videos, and replies reach you in Notifications."],
              ["Next phase", "A shared inbox for creator ↔ farmer and creator ↔ creator conversations."],
              ["Meanwhile", "Use the Comments tab to answer questions publicly — other farmers learn from them too."],
            ].map(([label, body]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-slate-300">{body}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Link to={CREATOR_ROUTES.comments} className="creator-btn-primary h-9 px-4 text-xs">
              Go to comments
            </Link>
            <Link to={CREATOR_ROUTES.notifications} className="creator-btn-ghost h-9 px-4 text-xs">
              Notifications
            </Link>
          </div>
        </div>
      </CreatorSection>
    </CreatorShell>
  );
}
