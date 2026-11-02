import { useMemo, useState } from "react";
import { EyeOff, Eye, MessageCircle, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import CreatorShell, {
  CreatorEmpty,
  CreatorError,
  CreatorLoading,
  CreatorSection,
} from "@/components/creator/CreatorShell";
import { useRetailerData } from "@/hooks/useRetailerData";
import {
  deleteComment,
  hideComment,
  listCommentsForCreator,
  timeAgo,
} from "@/lib/creator";
import type { VideoComment } from "@/lib/creator";

type Row = VideoComment & { video_title: string; video_id: string };

/**
 * Comments — moderation for every comment on the creator's videos.
 *
 * Hide keeps the record (and the audit trail) while removing it from public
 * view; delete removes it outright. Both are allowed only for the video owner
 * by the RLS policy on `video_comments`.
 */
export default function CreatorComments() {
  const { data, setData, state, error, reload } = useRetailerData<Row[]>(
    () => listCommentsForCreator(),
    []
  );
  const [filter, setFilter] = useState<"all" | "hidden" | "replies">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const rows = data ?? [];

  const visible = useMemo(() => {
    if (filter === "hidden") return rows.filter((r) => r.is_hidden);
    if (filter === "replies") return rows.filter((r) => r.parent_id);
    return rows;
  }, [rows, filter]);

  async function toggleHidden(row: Row) {
    setBusy(row.id);
    setActionError("");
    try {
      await hideComment(row.id, !row.is_hidden);
      setData(rows.map((r) => (r.id === row.id ? { ...r, is_hidden: !r.is_hidden } : r)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the comment.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: Row) {
    if (!window.confirm("Delete this comment permanently?")) return;
    setBusy(row.id);
    try {
      await deleteComment(row.id);
      setData(rows.filter((r) => r.id !== row.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete the comment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <CreatorShell title="Comments" subtitle={`${rows.length} across your videos`}>
      <div className="flex gap-1.5">
        {(
          [
            ["all", "All"],
            ["replies", "Replies"],
            ["hidden", "Hidden"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`creator-chip ${filter === key ? "is-active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {(state === "error" || actionError) && (
        <CreatorError message={actionError || error} onRetry={() => void reload()} />
      )}

      {state === "loading" && <CreatorLoading label="Loading comments…" />}

      {state === "ready" && visible.length === 0 && (
        <div className="creator-card">
          <CreatorEmpty
            icon={MessageCircle}
            title="No comments to moderate"
            description="Comments on your published videos appear here so you can hide or remove them."
          />
        </div>
      )}

      {state === "ready" && visible.length > 0 && (
        <CreatorSection title="Comments on your videos">
          <ul className="divide-y divide-white/5">
            {visible.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-slate-200">
                  {(row.author_name ?? "CA").slice(0, 2).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-400">
                    <span className="creator-heading font-semibold">{row.author_name}</span> ·{" "}
                    {timeAgo(row.created_at)} · on{" "}
                    <Link to={`/watch/${row.video_id}`} className="text-[#16C784] hover:underline">
                      {row.video_title}
                    </Link>
                    {row.parent_id && <span className="ml-1 text-[10px] text-slate-500">(reply)</span>}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-200">
                    {row.body}
                  </p>
                  {row.is_hidden && (
                    <span className="mt-1 inline-block rounded bg-amber-500/20 px-1.5 text-[9px] font-bold uppercase text-amber-300">
                      hidden from viewers
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void toggleHidden(row)}
                    className="creator-btn-ghost h-7 px-2 text-[10px]"
                  >
                    {row.is_hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {row.is_hidden ? "Unhide" : "Hide"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void remove(row)}
                    className="rounded-lg border border-rose-500/30 px-2 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </CreatorSection>
      )}
    </CreatorShell>
  );
}
