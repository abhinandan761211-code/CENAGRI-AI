import { EXPLORE_CATEGORIES } from "@/lib/exploreFeed";
import type { CategoryKey } from "@/lib/exploreFeed";

/**
 * The scrollable category filter.
 *
 * A chip row rather than a dropdown: ten short labels fit on one line at
 * 640px, and on a phone a horizontal swipe is a gesture people already use
 * here for stories and carousels. `aria-pressed` is what makes it a filter
 * rather than a nav bar for a screen reader.
 */
export function CategoryChips({
  value,
  onChange,
}: {
  value: CategoryKey;
  onChange: (key: CategoryKey) => void;
}) {
  return (
    /*
     * On a wide column the ten chips take two tidy rows, so nothing is ever
     * hidden. Below `sm` they stay on one swipeable row with a soft right-edge
     * fade — without the fade a half-cut chip reads as a layout bug instead of
     * "there is more to the right".
     */
    <div className="relative -mx-1">
      <div
        role="group"
        aria-label="Filter by content type"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none sm:flex-wrap sm:overflow-visible"
      >
        {EXPLORE_CATEGORIES.map((cat) => {
          const active = cat.key === value;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onChange(cat.key)}
              aria-pressed={active}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${active
                ? "bg-brand-700 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent sm:hidden"
      />
    </div>
  );
}
