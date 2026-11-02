import { Star } from "lucide-react";
import { useState } from "react";
import AdminListPage from "@/pages/admin/AdminListPage";
import { Badge, Button } from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

type VideoRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  view_count: number;
  is_featured: boolean;
  is_hidden: boolean;
  creator: { channel_name: string } | null;
  published_at: string | null;
};

/**
 * Kisan Video Hub management — the catalogue view of the same videos the
 * content module moderates. Feature/unfeature is the one hub-specific action,
 * so it lives here.
 */
export default function AdminVideoHub() {
  const [notice, setNotice] = useState<string | null>(null);

  async function toggleFeatured(row: VideoRow) {
    try {
      await adminFetch(`/content/videos/${row.id}/feature`, {
        method: "POST",
        query: { enabled: !row.is_featured },
      });
      setNotice(`"${row.title}" is ${row.is_featured ? "no longer" : "now"} featured in the hub.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not change the featured state.");
    }
  }

  const columns: Column<VideoRow>[] = [
    {
      key: "title",
      header: "Video",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-slate-800">{row.title}</p>
          <p className="text-[10.5px] text-slate-500">{row.creator?.channel_name ?? "Unknown channel"}</p>
        </div>
      ),
    },
    { key: "kind", header: "Type", render: (row) => <Badge tone="sky">{row.kind}</Badge> },
    { key: "views", header: "Views", render: (row) => <span>{(row.view_count ?? 0).toLocaleString("en-IN")}</span> },
    {
      key: "state",
      header: "Hub state",
      render: (row) => (
        <div className="flex gap-1">
          <Badge tone={row.is_hidden ? "rose" : row.status === "published" ? "green" : "amber"}>
            {row.is_hidden ? "hidden" : row.status}
          </Badge>
          {row.is_featured && <Badge tone="amber">featured</Badge>}
        </div>
      ),
    },
  ];

  return (
    <AdminListPage<VideoRow>
      title="Kisan Video Hub"
      subtitle="Catalogue, categories and featured placement. Large files stay in object storage — nothing is uploaded here."
      module="video hub management"
      permission="content.feature"
      path="/content/videos"
      columns={columns}
      rowKey={(row) => row.id}
      selects={[
        { label: "Type", param: "kind", options: ["video", "short"] },
        { label: "Status", param: "status", options: ["published", "review", "draft"] },
      ]}
      searchPlaceholder="Video title"
      emptyTitle="No videos match"
      headerAction={<Badge tone="green">{notice ?? "Catalogue"}</Badge>}
      footer={
        <p className="text-[10.5px] text-slate-400">
          Featured and trending controls are audited. Video processing and storage are handled outside the admin API by design.
        </p>
      }
      rowActions={(row) => (
        <Button variant="ghost" className="h-7 px-2 text-[11px]" icon={Star} onClick={() => void toggleFeatured(row)}>
          {row.is_featured ? "Unfeature" : "Feature"}
        </Button>
      )}
    />
  );
}
