import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Compass,
  Hash,
  History,
  RefreshCw,
  Search,
  Sparkles,
  Sprout,
  TrendingUp,
  Users,
  Video,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { CategoryChips } from "@/components/cenfriend/CategoryChips";
import { RightSidebar } from "@/components/cenfriend/RightSidebar";
import { StoryBar, StoryViewer } from "@/components/cenfriend/Stories";
import { FeedSkeleton, SuggestSkeleton } from "@/components/cenfriend/Skeletons";
import { FollowButton, PersonRow, SocialEmpty } from "@/components/cenfriend/ui";
import { PostCard } from "@/components/cenfriend/PostCard";
import { useFollowMap, usePostInteractions } from "@/components/cenfriend/useSocialActions";
import { ErrorNote } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { categoryByKey, loadExplore } from "@/lib/exploreFeed";
import type { CategoryKey } from "@/lib/exploreFeed";
import { clearRecentSearches, readRecentSearches, rememberSearch } from "@/lib/searchHistory";
import type { RecentSearch, SearchScope } from "@/lib/searchHistory";
import {
  addComment,
  getTrendingHashtags,
  listStoryTrays,
  reportContent,
  searchPeople,
  sharePost,
} from "@/lib/social";
import type { PersonCard, SocialPost, StoryTray } from "@/lib/social";

/**
 * CenFriend Explore — the three-column discovery screen.
 *
 * Layout contract (desktop, ≥1280px):
 *
 *   [ rail 228 ] [ content ≤680 ] [ aside 288 ]
 *
 * Below `xl` the aside drops; below `md` the rail becomes the bottom bar. The
 * middle column is the only one that is ever squeezed, and it is `min-w-0`, so
 * no card can force a horizontal scrollbar.
 *
 * Data: posts come from `/social/explore` (public only, block-aware, keyset
 * paginated), people from `/social/explore/people`, tags from
 * `/social/hashtags`, suggestions from `/social/suggested`. Nothing here
 * invents a count — a section with no data renders its empty state instead.
 */

type SearchScopeKey = "posts" | "people" | "hashtags" | "crops" | "videos" | "topics";

const SCOPES: { key: SearchScopeKey; label: string; icon: LucideIcon }[] = [
  { key: "posts", label: "Posts", icon: Search },
  { key: "people", label: "People", icon: Users },
  { key: "hashtags", label: "Hashtags", icon: Hash },
  { key: "crops", label: "Crops", icon: Sprout },
  { key: "videos", label: "Videos", icon: Video },
  { key: "topics", label: "Farming topics", icon: Sparkles },
];

/** What each scope searches for. All six map onto the two existing endpoints. */
const SCOPE_QUERY: Record<SearchScopeKey, { kind?: string; prefix?: string; role?: string }> = {
  posts: {},
  people: {},
  hashtags: { prefix: "#" },
  crops: {},
  videos: { kind: "video" },
  topics: {},
};

const ROLE_FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: "All accounts" },
  { key: "Farmer", label: "Farmers" },
  { key: "Buyer", label: "Buyers" },
  { key: "Retailer", label: "Retailers" },
  { key: "Worker", label: "Workers" },
  { key: "Transporter", label: "Transporters" },
  { key: "Warehouse", label: "Warehouses" },
  { key: "Equipment", label: "Equipment owners" },
  { key: "Content Creator", label: "Creators" },
];

const CROP_SUGGESTIONS = ["Paddy", "Wheat", "Maize", "Mustard", "Sugarcane", "Potato", "Tomato", "Onion", "Pulses"];

type Tab = "posts" | "people";

export default function CenFriendExplore() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();

  const [tab, setTab] = useState<Tab>(params.get("tab") === "people" ? "people" : "posts");
  const [scope, setScope] = useState<SearchScopeKey>("posts");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [applied, setApplied] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState<CategoryKey>("all");
  const [role, setRole] = useState<string | null>(null);

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [tags, setTags] = useState<{ tag: string; posts: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [trays, setTrays] = useState<StoryTray[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);

  const [recent, setRecent] = useState<RecentSearch[]>(() => readRecentSearches());
  const [suggestOpen, setSuggestOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const actions = usePostInteractions(setPosts);
  const follow = useFollowMap({});

  /* ── Loaders ─────────────────────────────────────────────────────── */

  const loadPosts = useCallback(async (term: string, catKey: CategoryKey, scopeKey: SearchScopeKey = "posts") => {
    setLoading(true);
    setError("");
    try {
      const res = await loadExplore({
        // A scope such as Videos is a harder filter than the chip row, so it
        // wins: searching inside "Videos" must not return photos.
        category: categoryByKey(SCOPE_QUERY[scopeKey].kind === "video" ? "videos" : catKey),
        query: term,
        limit: 10,
      });
      setPosts(res.items);
      setCursor(res.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Explore.");
      setPosts([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPeople = useCallback(async (term: string, r: string | null) => {
    setLoading(true);
    setError("");
    try {
      const res = await searchPeople({ q: term || undefined, role: r ?? undefined, limit: 24 });
      setPeople(res.items);
      for (const person of res.items) {
        if (person.follow_state === "me") follow.set(person.id, "me");
        else follow.set(person.id, person.follow_state);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search accounts.");
      setPeople([]);
    } finally {
      setLoading(false);
    }
    // `follow` is a stable updater; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStories = useCallback(() => {
    setStoriesLoading(true);
    listStoryTrays()
      .then((res) => setTrays(res.trays.filter((t) => !t.is_me)))
      .catch(() => setTrays([]))
      .finally(() => setStoriesLoading(false));
  }, []);

  useEffect(() => {
    getTrendingHashtags(10)
      .then((res) => setTags(res.items))
      .catch(() => setTags([]));
    loadStories();
  }, [loadStories]);

  // Keep the URL in step with the tab and query, so a shared link opens the
  // same result. `replace` because every keystroke-submit should not build a
  // back-button trail of intermediate searches.
  useEffect(() => {
    const next = new URLSearchParams();
    if (applied) next.set("q", applied);
    if (tab === "people") next.set("tab", "people");
    const asString = next.toString();
    if (asString !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, tab]);

  useEffect(() => {
    if (tab === "posts") void loadPosts(applied, category, scope);
    else void loadPeople(applied, role);
  }, [tab, applied, category, scope, role, loadPosts, loadPeople]);

  // Infinite scroll over the same keyset cursor the feed uses.
  useEffect(() => {
    if (tab !== "posts" || !sentinel.current || !cursor || loadingMore) return;
    const node = sentinel.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setLoadingMore(true);
        loadExplore({ category: categoryByKey(category), query: applied, cursor, limit: 10 })
          .then((res) => {
            setPosts((prev) => {
              const seen = new Set(prev.map((p) => p.id));
              return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
            });
            setCursor(res.next_cursor);
          })
          .catch(() => setCursor(null))
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab, cursor, category, applied, loadingMore]);

  // Close the suggestion panel on an outside click.
  useEffect(() => {
    if (!suggestOpen) return;
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [suggestOpen]);

  /* ── Search ──────────────────────────────────────────────────────── */

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags.slice(0, 5);
    return tags.filter((t) => t.tag.toLowerCase().includes(q.replace(/^#/, ""))).slice(0, 6);
  }, [query, tags]);

  /** Prompts shown when the box is focused but empty. */
  const prompts = useMemo(
    () => [
      { label: "Organic paddy farming", term: "organic", scope: "topics" as SearchScopeKey },
      { label: "Combine harvester rentals", term: "harvester", scope: "posts" as SearchScopeKey },
      { label: "Mustard harvest tips", term: "mustard", scope: "crops" as SearchScopeKey },
      { label: "Find farmers near you", term: "", scope: "people" as SearchScopeKey },
    ],
    []
  );

  function runSearch(term: string, nextScope: SearchScopeKey = scope) {
    const clean = term.trim();
    setQuery(clean);
    setScope(nextScope);
    setApplied(clean.replace(/^#/, ""));
    setTab(nextScope === "people" ? "people" : "posts");
    if (clean) setRecent(rememberSearch(clean, nextScope as SearchScope));
    setSuggestOpen(false);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  function resetFilters() {
    setQuery("");
    setApplied("");
    setCategory("all");
    setRole(null);
    setScope("posts");
  }

  async function handleShare(post: SocialPost) {
    const url = `${window.location.origin}/cenfriend/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "CenFriend post", url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied.");
        window.setTimeout(() => setNotice(""), 2400);
      }
      await sharePost(post.id);
      setPosts((rows) => rows.map((r) => (r.id === post.id ? { ...r, share_count: r.share_count + 1 } : r)));
    } catch {
      /* the share sheet was dismissed — not an error */
    }
  }

  async function handleInlineComment(post: SocialPost, body: string) {
    // Wait for the server before touching the count — a comment that failed to
    // save must not leave a +1 on the card. Cheaper to be one request slower.
    await addComment(post.id, body);
    setPosts((rows) => rows.map((r) => (r.id === post.id ? { ...r, comment_count: r.comment_count + 1 } : r)));
  }

  const message = error || actions.error || follow.error;
  /**
   * A rejected token is not a retryable error. `social.ts` reports it as 401
   * body text ("Your session could not be verified"), so the banner offers a
   * sign-in link instead of a "Try again" that would fail identically.
   */
  const sessionExpired = /session|unauthori[sz]ed|sign in|401/i.test(message);
  const storyTray = storyIndex !== null ? trays[storyIndex] : null;

  return (
    <CenFriendShell
      activeOverride="explore"
      wide
      aside={
        <RightSidebar
          follow={{ states: follow.states, busy: follow.busy, toggle: (id) => void follow.toggle(id) }}
          onPickTag={(tag) => runSearch(`#${tag}`, "posts")}
          onPickTopic={(term) => runSearch(term, "topics")}
        />
      }
    >
      {/* ── Title ── */}
      <div className="mb-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">Explore</h1>
          <p className="text-[11px] text-slate-500">
            Find farmers, buyers and creators — or browse what the community is posting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (tab === "posts") void loadPosts(applied, category, scope);
            else void loadPeople(applied, role);
            loadStories();
          }}
          aria-label="Refresh Explore"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-brand-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Search ── */}
      <div ref={searchRef} className="relative mb-3">
        <form onSubmit={submitSearch}>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              placeholder={
                scope === "people"
                  ? "Search by name or @handle…"
                  : scope === "hashtags"
                    ? "Search #hashtags…"
                    : "Search posts, crops, hashtags, people…"
              }
              aria-label="Search CenFriend"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setApplied("");
                }}
                aria-label="Clear search"
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-forest px-3 py-1 text-[11px] font-bold text-white hover:bg-forest-dark"
            >
              Search
            </button>
          </div>
        </form>

        {suggestOpen && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card-hover">
            {query.trim() ? (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => runSearch(query)}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-semibold text-forest hover:bg-slate-50"
                >
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  Search for “{query.trim()}”
                </button>
                {suggestions.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => runSearch(`#${t.tag}`)}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Hash className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold">#{t.tag}</span>
                    <span className="ml-auto text-[10px] text-slate-400">{t.posts} posts</span>
                  </button>
                ))}
                {scope !== "people" && (
                  <button
                    type="button"
                    onClick={() => runSearch(query, "people")}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    Find people named “{query.trim()}”
                  </button>
                )}
              </div>
            ) : (
              <div className="py-1">
                {recent.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-3.5 pb-1 pt-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <History className="h-3 w-3" /> Recent
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentSearches();
                          setRecent([]);
                        }}
                        className="text-[10px] font-bold text-brand-700 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    {recent.map((r) => (
                      <button
                        key={`${r.term}-${r.at}`}
                        type="button"
                        onClick={() => runSearch(r.term, r.scope)}
                        className="flex w-full items-center gap-2 px-3.5 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
                      >
                        <History className="h-3 w-3 text-slate-300" />
                        <span className="truncate">{r.term}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-400">{r.scope}</span>
                      </button>
                    ))}
                  </>
                )}
                <p className="px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Suggested
                </p>
                {prompts.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => runSearch(p.term, p.scope)}
                    className="flex w-full items-center gap-2 px-3.5 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <TrendingUp className="h-3 w-3 text-slate-300" />
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Scope + tab ── */}
      <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <div role="tablist" aria-label="Search area" className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1">
          {SCOPES.map((s) => {
            const Icon = s.icon;
            const active = scope === s.key;
            return (
              <button
                key={s.key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => {
                  setScope(s.key);
                  setTab(s.key === "people" ? "people" : "posts");
                }}
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition ${active ? "bg-white text-forest shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                <Icon className="h-3 w-3" />
                {s.label}
              </button>
            );
          })}
        </div>
        {applied && (
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:border-rose-200 hover:text-rose-600"
          >
            Clear
          </button>
        )}
      </div>

      {tab === "posts" && (
        <div className="mb-2.5">
          <CategoryChips value={category} onChange={setCategory} />
        </div>
      )}

      {message && (
        <div className="mb-3">
          <ErrorNote
            message={message}
            signInTo={sessionExpired ? "/login" : undefined}
            onRetry={() => (tab === "posts" ? void loadPosts(applied, category, scope) : void loadPeople(applied, role))}
          />
        </div>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {notice}
        </p>
      )}

      {/* ── Stories ── */}
      {tab === "posts" && (
        <div className="mb-3">
          <StoryBar
            trays={trays}
            loading={storiesLoading}
            onOpen={(i) => setStoryIndex(i)}
            onAdd={() => window.location.assign("/cenfriend/stories")}
          />
        </div>
      )}

      {/* ── Posts ── */}
      {tab === "posts" && (
        <>
          {loading ? (
            <FeedSkeleton count={2} />
          ) : posts.length === 0 ? (
            <div className="creator-card">
              <SocialEmpty
                icon={Compass}
                title={applied ? "No matching posts" : "Nothing here yet"}
                description={
                  applied
                    ? `Nothing public matches “${applied}”${category !== "all" ? ` in ${categoryByKey(category).label}` : ""}. Try another crop, district or #hashtag.`
                    : "No public posts in this category yet. Be the first to share."
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Clear filters
                    </button>
                    <Link
                      to="/cenfriend/create"
                      className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-800"
                    >
                      Create a post
                    </Link>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  actions={{
                    onLike: actions.toggleLike,
                    onSave: actions.toggleSave,
                    onComment: () => window.location.assign(`/cenfriend/post/${post.id}`),
                    onShare: handleShare,
                    onInlineComment: handleInlineComment,
                    onReport: async (p) => {
                      try {
                        await reportContent("post", p.id, "other", "Reported from Explore");
                        setNotice("Report sent to moderation.");
                        window.setTimeout(() => setNotice(""), 3000);
                      } catch (err) {
                        actions.setError(err instanceof Error ? err.message : "Could not send the report.");
                      }
                    },
                  }}
                  followState={
                    post.author_id === profile?.id
                      ? "me"
                      : follow.states[post.author_id] ?? post.author?.follow_state ?? "follow"
                  }
                  onFollow={() => void follow.toggle(post.author_id)}
                  followBusy={follow.busy.has(post.author_id)}
                  showFollowButton={post.author_id !== profile?.id}
                />
              ))}
              <div ref={sentinel} className="h-1" />
              {loadingMore && <FeedSkeleton count={1} />}
              {!cursor && posts.length > 0 && (
                <p className="pb-2 text-center text-[11px] text-slate-400">You&apos;re all caught up.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── People ── */}
      {tab === "people" && (
        <>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {ROLE_FILTERS.map((f) => {
              const active = role === f.key;
              return (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setRole(f.key)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${active
                      ? "bg-brand-700 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-800"
                    }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="creator-card">
              <SuggestSkeleton rows={5} />
            </div>
          ) : people.length === 0 ? (
            <div className="creator-card">
              <SocialEmpty
                icon={Users}
                title="No accounts found"
                description={
                  applied
                    ? `No ${role ? `${role.toLowerCase()}s` : "accounts"} match “${applied}”.`
                    : "Nobody matches this filter yet."
                }
              />
            </div>
          ) : (
            <section className="creator-card overflow-hidden" aria-label="Accounts">
              <ul className="divide-y divide-slate-100">
                {people.map((person) => (
                  <li key={person.id}>
                    <PersonRow
                      person={person}
                      action={
                        <FollowButton
                          state={follow.states[person.id] ?? person.follow_state}
                          busy={follow.busy.has(person.id)}
                          onPress={() => void follow.toggle(person.id)}
                        />
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Crop shortcuts — the "Crops" scope, as tappable chips. */}
          <section className="creator-card mt-3 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <Sprout className="h-3.5 w-3.5 text-brand-700" /> Browse by crop
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CROP_SUGGESTIONS.map((crop) => (
                <button
                  key={crop}
                  type="button"
                  onClick={() => runSearch(crop, "crops")}
                  className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800 hover:bg-brand-100"
                >
                  {crop}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Trend line under the feed (phones, where the aside is hidden) ── */}
      {tags.length > 0 && tab === "posts" && (
        <section className="creator-card mt-3 xl:hidden">
          <p className="flex items-center gap-1.5 border-b border-slate-100 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <TrendingUp className="h-3.5 w-3.5 text-brand-700" /> Trending hashtags
          </p>
          <div className="flex flex-wrap gap-1.5 p-3">
            {tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => runSearch(`#${t.tag}`, "hashtags")}
                className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-800"
              >
                <Hash className="h-2.5 w-2.5" />
                {t.tag}
                <span className="text-[10px] text-slate-400">{t.posts}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {storyTray && (
        <StoryViewer
          tray={storyTray}
          onClose={() => setStoryIndex(null)}
          onNextTray={() => setStoryIndex((i) => (i === null || i + 1 >= trays.length ? null : i + 1))}
          onPrevTray={() => setStoryIndex((i) => (i === null || i <= 0 ? i : i - 1))}
        />
      )}
    </CenFriendShell>
  );
}
