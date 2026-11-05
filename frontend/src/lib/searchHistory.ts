/**
 * Recent searches for CenFriend Explore.
 *
 * Deliberately `localStorage` and not a table: a search history is private,
 * worthless on another device, and would be one more thing a user has to ask
 * us to delete. Keeping it in the browser means "Clear history" is a single
 * `removeItem` call and the backend never learns what anyone typed.
 *
 * Failures are swallowed on purpose — Safari in private mode throws on write,
 * and a search that cannot be remembered should not be a search that fails.
 */

const KEY = "cenfriend.recentSearches.v1";
const MAX = 8;

export type SearchScope = "posts" | "people" | "hashtags" | "crops" | "videos" | "topics";

export type RecentSearch = { term: string; scope: SearchScope; at: number };

function canUseStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function readRecentSearches(): RecentSearch[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearch[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.term === "string" && r.term.trim().length > 0)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberSearch(term: string, scope: SearchScope): RecentSearch[] {
  const clean = term.trim();
  if (!clean) return readRecentSearches();
  const next = [{ term: clean, scope, at: Date.now() }, ...readRecentSearches().filter((r) => r.term.toLowerCase() !== clean.toLowerCase())]
    .slice(0, MAX);
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked — the search still works */
    }
  }
  return next;
}

export function clearRecentSearches(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
