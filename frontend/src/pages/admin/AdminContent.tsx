import { useState } from "react";
import { Eye, EyeOff, Flag, MessageSquare, RotateCcw, Star, Trash2 } from "lucide-react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  inputClass,
  Loading,
  Pager,
  Panel,
  toneFor,
} from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";
import type { Page } from "@/lib/admin/api";

type VideoRow = {
  id: string;
  title: string;
  status: string;
  kind: string;
  creator_id: string | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
  is_featured: boolean;
  is_hidden: boolean;
  creator: { channel_name: string; handle: string | null } | null;
};

type ReportRow = {
  id: string;
  reason: string;
  note: string | null;
  status: string;
  video_id: string | null;
  reporter_id: string | null;
  created_at: string;
};

type CommentRow = { id: string; body: string; video_id: string; author_id: string; created_at: string };

const TABS = [
  { key: "videos", label: "Videos" },
  { key: "reports", label: "Reports" },
  { key: "comments", label: "Comments" },
] as const;

/** Content moderation: the three queues a moderator actually works through. */
export default function AdminContent() {
  const { can } = useAdmin();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("videos");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{ kind: "video" | "report" | "comment"; id: string; title: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped after a successful action so the visible queue refetches.
  const [revision, setRevision] = useState(0);

  if (!can("content.view")) {
    return (
      <AdminLayout title="Content management">
        <NoAccess module="content moderation" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Content management"
      subtitle="Videos, comments and the report queue — every action keeps a moderation history"
    >
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">{notice}</div>}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
              tab === item.key ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "videos" && (
        <VideosTable page={page} setPage={setPage} revision={revision} onAct={(row) => setAction({ kind: "video", id: row.id, title: row.title })} />
      )}
      {tab === "reports" && (
        <ReportsTable page={page} setPage={setPage} revision={revision} onAct={(row) => setAction({ kind: "report", id: row.id, title: row.reason })} />
      )}
      {tab === "comments" && (
        <CommentsTable page={page} setPage={setPage} revision={revision} onAct={(row) => setAction({ kind: "comment", id: row.id, title: row.body.slice(0, 60) })} />
      )}

      {action && (
        <ActionDialog
          target={action}
          onClose={() => setAction(null)}
          onDone={(text) => {
            setAction(null);
            setNotice(text);
            setRevision((r) => r + 1);
          }}
        />
      )}
    </AdminLayout>
  );
}

function useContentList<T>(path: string, revision: number, page: number) {
  // Path, page and the revision counter are the deps, so switching tabs or
  // completing an action always refetches.
  return useAdminData<Page<T>>(() => adminFetch<Page<T>>(path, { query: { page, page_size: 25 } }), [path, page, revision]);
}

function VideosTable({ page, setPage, revision, onAct }: { page: number; setPage: (p: number) => void; revision: number; onAct: (row: VideoRow) => void }) {
  const { can } = useAdmin();
  const { data, loading, error, reload } = useContentList<VideoRow>("/content/videos", revision, page);

  const columns: Column<VideoRow>[] = [
    {
      key: "title",
      header: "Video",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-slate-800">{row.title}</p>
          <p className="text-[10.5px] text-slate-500">
            {row.creator?.channel_name ?? "Unknown channel"} · {row.kind}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.is_hidden ? "removed" : row.status)}>{row.is_hidden ? "hidden" : row.status}</Badge> },
    { key: "views", header: "Views", render: (row) => <span>{row.view_count?.toLocaleString("en-IN") ?? 0}</span> },
    {
      key: "flags",
      header: "Flags",
      render: (row) => (row.is_featured ? <Badge tone="amber">featured</Badge> : <span className="text-slate-300">—</span>),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) =>
        can("content.moderate") ? (
          <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onAct(row)}>
            Moderate
          </Button>
        ) : null,
    },
  ];

  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <Panel title="Videos & Shorts" flush>
      <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(r) => r.id} empty={<Empty icon={Eye} title="No videos yet" />} />
      {(data?.rows.length ?? 0) > 0 && <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />}
    </Panel>
  );
}

function ReportsTable({ page, setPage, revision, onAct }: { page: number; setPage: (p: number) => void; revision: number; onAct: (row: ReportRow) => void }) {
  const { data, loading, error, reload } = useContentList<ReportRow>("/content/reports", revision, page);
  const columns: Column<ReportRow>[] = [
    { key: "reason", header: "Reason", render: (row) => <span className="font-medium">{row.reason}</span> },
    { key: "note", header: "Note", render: (row) => <span className="text-[11.5px] text-slate-600">{row.note ?? "—"}</span> },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.status)}>{row.status}</Badge> },
    { key: "at", header: "Reported", render: (row) => <span className="text-[11.5px]">{new Date(row.created_at).toLocaleString("en-IN")}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) =>
        row.status === "open" ? (
          <Button variant="ghost" className="h-7 px-2 text-[11px]" icon={Flag} onClick={() => onAct(row)}>
            Decide
          </Button>
        ) : null,
    },
  ];
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <Panel title="Reported content" flush>
      <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(r) => r.id} empty={<Empty icon={Flag} title="No reports" description="Nothing has been flagged." />} />
      {(data?.rows.length ?? 0) > 0 && <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />}
    </Panel>
  );
}

function CommentsTable({ page, setPage, revision, onAct }: { page: number; setPage: (p: number) => void; revision: number; onAct: (row: CommentRow) => void }) {
  const { data, loading, error, reload } = useContentList<CommentRow>("/content/comments", revision, page);
  const columns: Column<CommentRow>[] = [
    { key: "body", header: "Comment", render: (row) => <p className="line-clamp-2 max-w-md">{row.body}</p> },
    { key: "at", header: "Posted", render: (row) => <span className="text-[11.5px]">{new Date(row.created_at).toLocaleString("en-IN")}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <Button variant="ghost" className="h-7 px-2 text-[11px]" icon={Trash2} onClick={() => onAct(row)}>
          Remove
        </Button>
      ),
    },
  ];
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <Panel title="Comments" flush>
      <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(r) => r.id} empty={<Empty icon={MessageSquare} title="No comments" />} />
      {(data?.rows.length ?? 0) > 0 && <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />}
    </Panel>
  );
}

function ActionDialog({
  target,
  onClose,
  onDone,
}: {
  target: { kind: "video" | "report" | "comment"; id: string; title: string };
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [action, setAction] = useState("hide");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options =
    target.kind === "video"
      ? [
          { value: "hide", label: "Hide from the hub" },
          { value: "restore", label: "Restore visibility" },
          { value: "remove", label: "Remove (send back to review)" },
          { value: "feature", label: "Feature in the hub" },
        ]
      : target.kind === "report"
        ? [
            { value: "approve", label: "Actioned — report was valid" },
            { value: "reject", label: "Dismiss — report was not valid" },
          ]
        : [];

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (target.kind === "comment") {
        await adminFetch(`/content/comments/${target.id}`, {
          method: "DELETE",
          query: { reason: reason.trim() || "Moderated" },
        });
        onDone("Comment removed. The removal is in the moderation history.");
      } else if (target.kind === "report") {
        await adminFetch(`/content/reports/${target.id}`, {
          method: "POST",
          body: JSON.stringify({ action, reason: reason.trim() || null }),
        });
        onDone("Report closed.");
      } else {
        await adminFetch(`/content/videos/${target.id}/action`, {
          method: "POST",
          body: JSON.stringify({ action, reason: reason.trim() || null }),
        });
        onDone(`Video action "${action}" applied.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={target.kind === "comment" ? "Remove comment" : "Moderate content"}
      subtitle={target.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={action === "restore" ? "primary" : "danger"} icon={RotateCcw} disabled={busy} onClick={() => void submit()}>
            {busy ? "Applying…" : "Apply"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
      {options.length > 0 && (
        <Field label="Action">
          <select value={action} onChange={(e) => setAction(e.target.value)} className={inputClass}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="mt-3">
        <Field label="Reason" hint="The creator and the moderation history both see this.">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} maxLength={500} />
        </Field>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-slate-500">
        {action === "feature" ? <Star className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        Stored in <code>moderation_actions</code> and the admin audit log.
      </p>
    </Dialog>
  );
}
