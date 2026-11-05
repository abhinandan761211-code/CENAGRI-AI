import { supabase } from "@/lib/supabase";

/**
 * CenFriend — the farmer community feed.
 *
 * `posts` and `comments` are already defined in features.sql with RLS (any
 * signed-in account reads; only the author writes their own row). The screen was
 * a demo preview with a hardcoded zero, so a farmer's question written here would
 * have gone nowhere and nobody else's post was ever visible.
 */

export type Post = {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  district: string | null;
  crop: string | null;
  created_at: string;
  author_name?: string | null;
  comment_count?: number;
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name?: string | null;
};

/**
 * The community feed, newest first.
 *
 * `district` narrows to one district; omit it to see every district. Posts from
 * the caller's own district are not duplicated — the SQL filter is enough.
 */
export async function listPosts(district?: string | null): Promise<Post[]> {
  if (!supabase) return [];

  let query = supabase
    .from("posts")
    .select("id, author_id, body, image_url, district, crop, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (district) query = query.eq("district", district);

  const { data, error } = await query;
  // A missing table is a setup problem the farmer cannot fix, so it names the
  // SQL file. Anything else (expired session, network) must not be blamed on
  // the schema — say what actually happened.
  if (error) {
    if (error.code === "42P01" || /does not exist/i.test(error.message)) {
      throw new Error(`The community tables are missing. Apply database/supabase/features.sql.`);
    }
    if (error.code === "42501" || error.code === "PGRST301" || /jwt|permission/i.test(error.message)) {
      throw new Error("Your session has expired. Sign in again to see the feed.");
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Post[];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const [{ data: authors }, { data: counts }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", authorIds),
    // One query for every comment on this page, counted client-side.
    supabase
      .from("comments")
      .select("post_id")
      .in(
        "post_id",
        rows.map((r) => r.id)
      ),
  ]);

  const nameById = new Map(
    ((authors ?? []) as { id: string; full_name: string | null }[]).map((a) => [a.id, a.full_name])
  );
  const countByPost = new Map<string, number>();
  for (const row of (counts ?? []) as { post_id: string }[]) {
    countByPost.set(row.post_id, (countByPost.get(row.post_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    ...r,
    author_name: nameById.get(r.author_id) ?? null,
    comment_count: countByPost.get(r.id) ?? 0,
  }));
}

export async function createPost(input: {
  body: string;
  district?: string | null;
  crop?: string | null;
}): Promise<void> {
  if (!supabase) throw new Error("CenFriend is not connected on this deployment.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  const body = input.body.trim();
  if (body.length < 3) throw new Error("Write at least a few words.");
  // The table check is 1..2000; trimming here gives a clear message rather than a
  // constraint error from Postgres.
  if (body.length > 2000) throw new Error("Keep the post under 2000 characters.");

  const { error } = await supabase.from("posts").insert({
    author_id: user.id,
    body,
    district: input.district ?? null,
    crop: input.crop?.trim().slice(0, 80) || null,
  });
  if (error) throw error;
}

/** Comments on one post, oldest first (a thread reads top to bottom). */
export async function listComments(postId: string): Promise<Comment[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("comments")
    .select("id, post_id, author_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return [];

  const rows = (data ?? []) as Comment[];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: authors } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
  const nameById = new Map(
    ((authors ?? []) as { id: string; full_name: string | null }[]).map((a) => [a.id, a.full_name])
  );

  return rows.map((r) => ({ ...r, author_name: nameById.get(r.author_id) ?? null }));
}

export async function addComment(input: { postId: string; body: string }): Promise<void> {
  if (!supabase) throw new Error("CenFriend is not connected on this deployment.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  const body = input.body.trim();
  if (!body) throw new Error("Write a reply first.");
  if (body.length > 1000) throw new Error("Keep the reply under 1000 characters.");

  const { error } = await supabase.from("comments").insert({
    post_id: input.postId,
    author_id: user.id,
    body,
  });
  if (error) throw error;
}

/** Deletes one of the caller's own posts (comments cascade). */
export async function deletePost(postId: string): Promise<void> {
  if (!supabase) throw new Error("CenFriend is not connected on this deployment.");
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
}
