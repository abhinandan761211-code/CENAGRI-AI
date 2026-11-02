/**
 * The creator dashboard is no longer a page of its own.
 *
 * Watching and creating were two separate screens fetching the same hub data
 * twice. They are now one page — `/video-hub` — with a Watch / Create mode
 * toggle, and the dashboard is the Create mode's panel
 * (`@/components/creator/CreatorHomePanel`).
 *
 * This module stays as a thin alias so older imports keep working; there is no
 * second implementation to drift out of sync.
 */
export { default, TrendChart } from "@/components/creator/CreatorHomePanel";
