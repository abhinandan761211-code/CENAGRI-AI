/**
 * Loading placeholders for CenFriend.
 *
 * They mirror the real card's heights (author row, media block, two action
 * rows) rather than being generic grey bars, so the feed does not jump when
 * data arrives. The pulse is the only animation on the page — a spinner per
 * card would read as dozens of separate failures instead of one load.
 */

function Bar({ className = "" }: { className?: string }) {
  return <span className={`block rounded bg-slate-200/80 ${className}`} />;
}

export function PostSkeleton({ media = true }: { media?: boolean }) {
  return (
    <div aria-hidden="true" className="creator-card animate-pulse overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="h-10 w-10 rounded-full bg-slate-200/80" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Bar className="h-2.5 w-32" />
          <Bar className="h-2 w-20" />
        </div>
      </div>
      {media && <div className="aspect-[4/3] w-full bg-slate-200/70" />}
      <div className="space-y-2 px-4 py-3">
        <Bar className="h-2.5 w-full" />
        <Bar className="h-2.5 w-3/4" />
        <div className="flex gap-3 pt-1">
          <Bar className="h-4 w-12" />
          <Bar className="h-4 w-12" />
          <Bar className="ml-auto h-4 w-8" />
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-4">
      <section className="creator-card flex gap-4 overflow-hidden px-4 py-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span className="h-14 w-14 animate-pulse rounded-full bg-slate-200/80" />
            <Bar className="h-2 w-10" />
          </div>
        ))}
      </section>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} media={i === 0} />
      ))}
    </div>
  );
}

export function SuggestSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="animate-pulse divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-2.5 px-3.5 py-2.5">
          <span className="h-9 w-9 rounded-full bg-slate-200/80" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Bar className="h-2 w-24" />
            <Bar className="h-2 w-16" />
          </div>
          <span className="h-6 w-14 rounded-md bg-slate-200/80" />
        </li>
      ))}
    </ul>
  );
}
