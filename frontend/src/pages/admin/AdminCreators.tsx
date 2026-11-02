import { BadgeCheck, BadgeX } from "lucide-react";
import { useState } from "react";
import AdminListPage from "@/pages/admin/AdminListPage";
import { Badge, Button } from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

type CreatorRow = {
  id: string;
  channel_name: string;
  handle: string | null;
  subscriber_count: number;
  video_count: number;
  total_views: number;
  is_verified: boolean;
  district: string | null;
  state: string | null;
};

/**
 * Creator management.
 *
 * This is the *existing* creator channel table from `creator.sql` — there is no
 * second creator account system. Verification is the only creator-level action
 * here; content itself is moderated in the Content module.
 */
export default function AdminCreators() {
  const [notice, setNotice] = useState<string | null>(null);

  async function toggleVerify(row: CreatorRow) {
    const reason = window.prompt(
      row.is_verified
        ? `Remove verification from "${row.channel_name}"? Give a reason:`
        : `Verify "${row.channel_name}"? Give a reason:`,
      ""
    );
    if (!reason || reason.trim().length < 3) return;
    try {
      await adminFetch(`/content/creators/${row.id}/verify`, {
        method: "POST",
        query: { verified: !row.is_verified, reason: reason.trim() },
      });
      setNotice(`"${row.channel_name}" is now ${row.is_verified ? "unverified" : "verified"}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not change verification.");
    }
  }

  const columns: Column<CreatorRow>[] = [
    {
      key: "channel",
      header: "Channel",
      render: (row) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-[12.5px] font-semibold text-slate-800">
            {row.channel_name}
            {row.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
          </p>
          <p className="text-[10.5px] text-slate-500">{row.handle ? `@${row.handle}` : "—"}</p>
        </div>
      ),
    },
    { key: "subs", header: "Subscribers", render: (row) => <span>{row.subscriber_count.toLocaleString("en-IN")}</span> },
    { key: "videos", header: "Videos", render: (row) => <span>{row.video_count}</span> },
    { key: "views", header: "Lifetime views", render: (row) => <span>{row.total_views.toLocaleString("en-IN")}</span> },
    {
      key: "region",
      header: "Region",
      render: (row) => <span className="text-[11.5px]">{[row.district, row.state].filter(Boolean).join(", ") || "—"}</span>,
    },
    {
      key: "verified",
      header: "Verified",
      render: (row) => <Badge tone={row.is_verified ? "green" : "neutral"}>{row.is_verified ? "yes" : "no"}</Badge>,
    },
  ];

  return (
    <AdminListPage<CreatorRow>
      title="Creator management"
      subtitle="Channels, reach and verification. Same creator system the app already uses."
      module="creator management"
      permission="content.view"
      path="/content/creators"
      columns={columns}
      rowKey={(row) => row.id}
      selects={[{ label: "Verification", param: "verified", options: ["true", "false"] }]}
      searchPlaceholder="Channel name or handle"
      emptyTitle="No creator channels"
      headerAction={notice ? <Badge tone="green">{notice}</Badge> : undefined}
      rowActions={(row) => (
        <Button variant="ghost" className="h-7 px-2 text-[11px]" icon={row.is_verified ? BadgeX : BadgeCheck} onClick={() => void toggleVerify(row)}>
          {row.is_verified ? "Unverify" : "Verify"}
        </Button>
      )}
    />
  );
}
