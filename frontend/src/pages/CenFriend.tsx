import { MessageCircle, Search, Sprout, Users } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { SchemaBanner } from "@/components/farm/SchemaBanner";
import { useTableExists } from "@/lib/schemaCheck";

/**
 * CenFriend — the farmer community.
 *
 * `posts` and `comments` exist in features.sql but hold no rows, so the feed
 * shows an honest empty state. No invented farmers or messages.
 */
export default function CenFriend() {
  const schema = useTableExists("posts");

  return (
    <FeatureShell
      title="CenFriend"
      description="Connect with farmers nearby, share what worked this season, and get help when a crop goes wrong."
      demo
      demoNote="Posts and comments live in the `posts` and `comments` tables (database/supabase/features.sql). Nothing is displayed until real farmers post — this is an empty network, not a sample one."
    >
      {schema.exists === false && <SchemaBanner file={schema.file} tables={["posts", "comments"]} />}

      <FarmerStats
        items={[
          { label: "Farmers in your block", value: "0", icon: Users, hint: "Nobody has joined yet" },
          { label: "Posts this week", value: "0", icon: MessageCircle, hint: "No questions asked" },
          { label: "Answers given", value: "0", icon: Sprout, hint: "Community is just starting" },
          { label: "Your posts", value: "0", icon: Search, hint: "You have not posted yet" },
        ]}
      />

      <FarmerSection title="What CenFriend gives you" icon={Users}>
        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          {[
            {
              icon: Users,
              title: "Nearby farmers",
              body: "See who farms what in your block and what stage their crop has reached.",
            },
            {
              icon: MessageCircle,
              title: "Ask the community",
              body: "Post a photo of a problem and get answers from farmers who have seen it before.",
            },
            {
              icon: Search,
              title: "Season notes",
              body: "Search what worked for a crop in your district in earlier seasons.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-slate-200 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <p className="mt-2 text-sm font-semibold text-forest">{title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{body}</p>
            </div>
          ))}
        </div>
      </FarmerSection>

      <FarmerSection title="Community feed" description="Questions and answers from your district" icon={MessageCircle}>
        <div className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
            <MessageCircle className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold text-forest">No community activity yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            When farmers in your district join CenFriend, their questions and answers appear here.
            Nothing is shown until then — this is an empty network, not a sample one.
          </p>
        </div>
      </FarmerSection>
    </FeatureShell>
  );
}
