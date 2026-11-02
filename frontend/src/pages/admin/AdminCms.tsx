import { BookOpen, CheckCircle2, Pencil } from "lucide-react";
import { useState } from "react";
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

type CmsPage = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  status: string;
  updated_at: string;
  published_at: string | null;
};

/**
 * CMS management.
 *
 * Draft → review → published. Editing a published page drops it back to review,
 * so a public page can never change silently. Publishing needs `cms.publish`,
 * which is separate from `cms.manage`.
 */
export default function AdminCms() {
  const { can } = useAdmin();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useAdminData(
    () => adminFetch<Page<CmsPage>>("/ops/cms", { query: { page, page_size: 25 } }),
    [page]
  );

  if (!can("cms.view")) {
    return (
      <AdminLayout title="CMS management">
        <NoAccess module="CMS" />
      </AdminLayout>
    );
  }

  async function publish(row: CmsPage) {
    const reason = window.prompt(`Publish "${row.title}"? Give a short reason:`, "");
    if (!reason || reason.trim().length < 3) return;
    try {
      await adminFetch(`/ops/cms/${row.slug}/publish`, { method: "POST", query: { reason: reason.trim() } });
      setNotice(`"${row.title}" is now public.`);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Publishing failed.");
    }
  }

  const columns: Column<CmsPage>[] = [
    {
      key: "title",
      header: "Page",
      render: (row) => (
        <div>
          <p className="text-[12.5px] font-semibold text-slate-800">{row.title}</p>
          <p className="text-[10.5px] text-slate-500">/{row.slug}</p>
        </div>
      ),
    },
    { key: "kind", header: "Type", render: (row) => <Badge tone="sky">{row.kind}</Badge> },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.status)}>{row.status}</Badge> },
    {
      key: "updated",
      header: "Updated",
      render: (row) => <span className="text-[11.5px]">{new Date(row.updated_at).toLocaleString("en-IN")}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" className="h-7 px-2 text-[11px]" icon={Pencil} onClick={() => setEditing(row)}>
            Edit
          </Button>
          {row.status !== "published" && can("cms.publish") && (
            <Button className="h-7 px-2 text-[11px]" icon={CheckCircle2} onClick={() => void publish(row)}>
              Publish
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="CMS management"
      subtitle="Banners, help pages, FAQs, terms and educational content with a review step before publishing"
      action={
        can("cms.manage") ? (
          <Button
            icon={BookOpen}
            onClick={() =>
              setEditing({
                id: "",
                slug: "",
                title: "",
                kind: "page",
                status: "draft",
                updated_at: new Date().toISOString(),
                published_at: null,
              })
            }
          >
            New page
          </Button>
        ) : undefined
      }
    >
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">{notice}</div>}
      {error && <ErrorNotice message={error} onRetry={reload} />}

      <Panel title="Content" description="Public content is only live once published" flush>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(row) => row.id}
              empty={<Empty icon={BookOpen} title="No CMS content yet" description="Create a page to get started." />}
            />
            {(data?.rows.length ?? 0) > 0 && <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />}
          </>
        )}
      </Panel>

      {editing && (
        <EditorDialog
          page={editing}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            setNotice(text);
            reload();
          }}
        />
      )}
    </AdminLayout>
  );
}

function EditorDialog({ page, onClose, onDone }: { page: CmsPage; onClose: () => void; onDone: (text: string) => void }) {
  const [slug, setSlug] = useState(page.slug || "home-banner");
  const [title, setTitle] = useState(page.title);
  const [kind, setKind] = useState(page.kind);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = slug.trim().length >= 2 && title.trim().length >= 2;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/ops/cms/${slug.trim()}`, {
        method: "PUT",
        query: { title: title.trim(), kind, content },
      });
      onDone(`Saved "${title.trim()}". ${page.status === "published" ? "It moved back to review — publish again to go live." : "It is ready for review."}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={page.id ? "Edit page" : "New page"}
      subtitle={page.status === "published" ? "Editing a published page sends it back to review." : "Saved as a draft for review."}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!ready || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slug" hint="URL-safe, unique.">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass} maxLength={60} disabled={Boolean(page.id)} />
        </Field>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
            {["banner", "page", "faq", "terms", "privacy", "education"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={160} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Content" hint="Markdown/plain text. Rendered by the public site, not the admin panel.">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className={inputClass} maxLength={100_000} />
        </Field>
      </div>
    </Dialog>
  );
}
