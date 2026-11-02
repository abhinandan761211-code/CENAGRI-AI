import { Users } from "lucide-react";
import AdminListPage from "@/pages/admin/AdminListPage";
import { Badge, toneFor } from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";

type ConnectionRow = { follower_id: string; following_id: string; created_at: string };
type ServiceRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  account_status: string;
  availability: { state: string | null; district: string | null; vehicle_type: string | null };
};

/**
 * CenFriend: community connections and the worker / transporter / equipment
 * listings that sit behind it.
 *
 * Deliberately shows relationships, not conversations — moderation gets what it
 * needs to act on a report without reading anyone's private messages.
 */
export default function AdminCenFriend() {
  const connColumns: Column<ConnectionRow>[] = [
    { key: "follower", header: "Follower", render: (row) => <code className="text-[11px]">{row.follower_id.slice(0, 8)}</code> },
    { key: "following", header: "Following", render: (row) => <code className="text-[11px]">{row.following_id.slice(0, 8)}</code> },
    { key: "since", header: "Since", render: (row) => <span className="text-[11.5px]">{new Date(row.created_at).toLocaleDateString("en-IN")}</span> },
  ];

  const serviceColumns: Column<ServiceRow>[] = [
    {
      key: "name",
      header: "Account",
      render: (row) => (
        <div>
          <p className="text-[12.5px] font-semibold text-slate-800">{row.full_name ?? "Unnamed"}</p>
          <p className="text-[10.5px] text-slate-500">{row.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Service", render: (row) => <Badge tone="sky">{row.role}</Badge> },
    {
      key: "region",
      header: "Region",
      render: (row) => (
        <span className="text-[11.5px]">
          {[row.availability?.district, row.availability?.state].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.account_status)}>{row.account_status}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <AdminListPage<ServiceRow>
        title="CenFriend"
        subtitle="Community connections and the worker, transporter and equipment services offered through the app"
        module="CenFriend"
        permission="cenfriend.view"
        path="/business/service-listings"
        columns={serviceColumns}
        rowKey={(row) => row.id}
        selects={[{ label: "Service", param: "kind", options: ["worker", "transporter", "equipment", "warehouse"] }]}
        searchParam=""
        emptyTitle="No service providers"
      />

      <AdminListPage<ConnectionRow>
        title="Follow relationships"
        subtitle="Who follows whom — relationship metadata only"
        module="CenFriend"
        permission="cenfriend.view"
        path="/business/connections"
        columns={connColumns}
        rowKey={(row) => `${row.follower_id}-${row.following_id}`}
        searchParam=""
        emptyTitle="No connections yet"
        footer={
          <p className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
            <Users className="h-3 w-3" />
            Private conversations are not exposed to administrators.
          </p>
        }
      />
    </div>
  );
}
