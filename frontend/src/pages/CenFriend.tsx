import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Search, Sprout, Trash2, Users } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { ErrorNote, Input, PrimaryButton, Textarea } from "@/components/farm/farmerUI";
import { SchemaBanner } from "@/components/farm/SchemaBanner";
import { useAuth } from "@/hooks/useAuth";
import { useTableExists } from "@/lib/schemaCheck";
import { addComment, createPost, deletePost, listComments, listPosts } from "@/lib/cenfriend";
import type { Comment, Post } from "@/lib/cenfriend";

/**
 * CenFriend — the farmer community.
 *
 * Writes to `posts` and `comments` (features.sql already has the tables and the
 * RLS), and reads the same rows back. The page used to be an empty demo with a
 * hardcoded zero, so a question typed here was lost and nobody else's post was
 * ever shown.
 */
export default function CenFriend() {
  const { profile } = useAuth();
  const schema = useTableExists("posts");

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [crop, setCrop] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState("");

  // Open thread
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reply, setReply] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [replyError, setReplyError] = useState("");

  const district = profile?.details?.district ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // No district filter: a quiet district still sees what other districts ask,
      // which is more useful than an empty screen. The stats below separate them.
      setPosts(await listPosts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the community.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schema.exists !== false) void load();
  }, [schema.exists, load]);

  const visible = onlyMine ? posts.filter((p) => p.author_id === profile?.id) : posts;
  const myPosts = posts.filter((p) => p.author_id === profile?.id);
  const inDistrict = posts.filter((p) => (p.district ?? "") === district);

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setPosting(true);
    try {
      await createPost({ body: draft, district, crop });
      setDraft("");
      setCrop("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not post.");
    } finally {
      setPosting(false);
    }
  }

  async function openThread(post: Post) {
    setOpenPost(post);
    setReply("");
    setReplyError("");
    setComments([]);
    try {
      setComments(await listComments(post.id));
    } catch {
      /* an unreadable thread still opens; the reply box stays usable */
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!openPost) return;
    setReplyError("");
    setReplySaving(true);
    try {
      await addComment({ postId: openPost.id, body: reply });
      setReply("");
      setComments(await listComments(openPost.id));
      await load();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Could not send the reply.");
    } finally {
      setReplySaving(false);
    }
  }

  async function removePost(post: Post) {
    try {
      await deletePost(post.id);
      if (openPost?.id === post.id) setOpenPost(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the post.");
    }
  }

  return (
    <FeatureShell
      title="CenFriend"
      description="Connect with farmers nearby, share what worked this season, and get help when a crop goes wrong."
    >
      {schema.exists === false && <SchemaBanner file={schema.file} tables={["posts", "comments"]} />}

      <FarmerStats
        items={[
          {
            label: "In your district",
            value: String(inDistrict.length),
            icon: Users,
            hint: district ? `Posts from ${district}` : "Set your district to see this",
          },
          { label: "All posts", value: String(posts.length), icon: MessageCircle, hint: "Across CenAGRI" },
          {
            label: "Answers given",
            value: String(posts.reduce((sum, p) => sum + (p.comment_count ?? 0), 0)),
            icon: Sprout,
            hint: "Replies on these posts",
          },
          { label: "Your posts", value: String(myPosts.length), icon: Search, hint: "Questions you asked" },
        ]}
      />

      {error && (
        <div className="px-4 sm:px-5">
          <ErrorNote message={error} />
        </div>
      )}

      <FarmerSection title="Ask the community" description="A photo of a problem gets better answers" icon={MessageCircle}>
        <form onSubmit={submitPost} className="space-y-3 p-4 sm:p-5">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="e.g. Paddy leaves turning yellow after the last rain — what should I check first?"
            aria-label="Write a post"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              placeholder="Crop (optional)"
              className="max-w-[220px]"
              aria-label="Crop"
            />
            <span className="text-[11px] text-slate-500">
              Posted to {district || "all districts"}
            </span>
            <div className="ml-auto">
              <PrimaryButton type="submit" disabled={posting || !draft.trim()}>
                {posting ? "Posting…" : "Post"}
              </PrimaryButton>
            </div>
          </div>
          {formError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {formError}
            </p>
          )}
        </form>
      </FarmerSection>

      <FarmerSection
        title="Community feed"
        description="Questions and answers from farmers across CenAGRI"
        icon={MessageCircle}
        action={
          <button
            type="button"
            onClick={() => setOnlyMine((v) => !v)}
            aria-pressed={onlyMine}
            className={`h-8 rounded-lg px-3 text-[11px] font-semibold ${onlyMine ? "bg-brand-700 text-white" : "border border-slate-300 bg-white text-slate-700"
              }`}
          >
            {onlyMine ? "Showing mine" : "Show only mine"}
          </button>
        }
      >
        {loading ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">Loading the feed…</p>
        ) : visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <MessageCircle className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-forest">
              {onlyMine ? "You have not posted yet" : "No community activity yet"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              {onlyMine
                ? "Turn off the filter to see what other farmers are asking."
                : "Be the first — ask about a crop problem and other farmers can reply."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((post) => (
              <li key={post.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="font-semibold text-forest">{post.author_name ?? "A farmer"}</span>
                  {post.district && <span>· {post.district}</span>}
                  {post.crop && (
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                      {post.crop}
                    </span>
                  )}
                  <span>· {new Date(post.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{post.body}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => void openThread(post)}
                    className="text-brand-700 hover:underline"
                  >
                    {post.comment_count ?? 0} {post.comment_count === 1 ? "reply" : "replies"}
                  </button>
                  {post.author_id === profile?.id && (
                    <button
                      type="button"
                      onClick={() => void removePost(post)}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </FarmerSection>

      {openPost && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-forest">{openPost.author_name ?? "A farmer"}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                  {openPost.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenPost(null)}
                className="shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto border-t border-slate-100 pt-3">
              {comments.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-slate-500">No replies yet — be the first.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold text-forest">{c.author_name ?? "A farmer"}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">{c.body}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={submitReply} className="mt-3 space-y-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                aria-label="Reply"
              />
              {replyError && <p className="text-[11px] text-rose-700">{replyError}</p>}
              <div className="flex justify-end">
                <PrimaryButton type="submit" disabled={replySaving || !reply.trim()}>
                  {replySaving ? "Sending…" : "Reply"}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
