import { getExplore } from "@/lib/social";
import type { SocialPost } from "@/lib/social";

/**
 * Explore's content model.
 *
 * The categories on the Explore screen are a *view* of the existing posts
 * table, not a new taxonomy. Each category is expressed with the filters the
 * API already accepts — `kind` maps one-to-one to `posts.post_kind`, and the
 * topic categories are keyword searches over the body and the GIN-indexed
 * hashtag array. Nothing new is stored, and a post appears in a category the
 * moment its text matches; there is no admin step to tag it.
 *
 * The consequence worth stating plainly: "Organic Farming" is a search, so it
 * can only ever be as good as the words people post. That is the honest
 * trade-off of not inventing a second tagging system.
 */

export type CategoryKey =
  | "all"
  | "photos"
  | "albums"
  | "videos"
  | "shorts"
  | "questions"
  | "farming_tips"
  | "success_stories"
  | "modern_farming"
  | "organic_farming";

export type ExploreCategory = {
  key: CategoryKey;
  label: string;
  kind?: "text" | "image" | "gallery" | "video" | "short";
  /** Keyword terms searched in the post body when no free-text query is set. */
  terms?: string[];
};

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  { key: "all", label: "All posts" },
  { key: "photos", label: "Photos", kind: "image" },
  { key: "albums", label: "Albums", kind: "gallery" },
  { key: "videos", label: "Videos", kind: "video" },
  { key: "shorts", label: "Shorts", kind: "short" },
  { key: "questions", label: "Questions", kind: "text", terms: ["?", "how", "why", "help", "advice"] },
  { key: "farming_tips", label: "Farming tips", terms: ["tip", "tips", "advice", "practice", "lesson"] },
  { key: "success_stories", label: "Success stories", terms: ["success", "harvest", "yield", "profit", "result"] },
  { key: "modern_farming", label: "Modern farming", terms: ["modern", "technology", "drone", "sensor", "irrigation", "mechanisation", "mechanization"] },
  { key: "organic_farming", label: "Organic farming", terms: ["organic", "compost", "vermicompost", "natural farming", "jeevamrit"] },
];

export function categoryByKey(key: CategoryKey): ExploreCategory {
  return EXPLORE_CATEGORIES.find((c) => c.key === key) ?? EXPLORE_CATEGORIES[0];
}

/**
 * Turn a category + a typed query into the two things the API understands.
 *
 * `kind` is a hard filter (a video genuinely is a video). `term` is soft: for a
 * topic category it is the entered query when there is one, otherwise the
 * category's own first keyword. That keeps a search *inside* Organic Farming
 * working — "compost" inside "Organic farming" searches the user's word, not
 * the category's.
 */
export function categoryQuery(category: ExploreCategory, query: string): { kind?: string; term?: string } {
  const typed = query.trim();
  if (typed) return { kind: category.kind, term: typed };
  if (category.kind === "text") return { kind: "text" };
  return { kind: category.kind, term: category.terms?.[0] };
}

export type ExplorePage = { items: SocialPost[]; next_cursor: string | null };

export async function loadExplore(opts: {
  category: ExploreCategory;
  query: string;
  cursor?: string | null;
  limit?: number;
}): Promise<ExplorePage> {
  const { kind, term } = categoryQuery(opts.category, opts.query);
  const res = await getExplore({ q: term, kind, cursor: opts.cursor ?? null, limit: opts.limit ?? 12 });
  return { items: res.items, next_cursor: res.next_cursor };
}

/** People search for the People tab; kept here so Explore imports one module. */
export { searchPeople as findPeople } from "@/lib/social";
