import { Archive, Store } from "lucide-react";
import { useState } from "react";
import AdminListPage from "@/pages/admin/AdminListPage";
import { Badge } from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

type ListingRow = {
  id: string;
  title: string;
  category: string | null;
  quantity_kg: number | null;
  price_inr: number | null;
  unit: string | null;
  district: string | null;
  state: string | null;
  status: string;
  seller: { full_name: string | null; email: string | null } | null;
};

/** Marketplace listings and shop products. No payment data is ever read here. */
export default function AdminMarketplace() {
  const [source, setSource] = useState<"listings" | "retailer-products">("listings");

  const listingColumns: Column<ListingRow>[] = [
    {
      key: "title",
      header: "Listing",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-slate-800">{row.title}</p>
          <p className="text-[10.5px] text-slate-500">{row.seller?.full_name ?? row.seller?.email ?? "Unknown seller"}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (row) => <Badge tone="sky">{row.category ?? "—"}</Badge> },
    {
      key: "qty",
      header: "Quantity",
      render: (row) => <span>{row.quantity_kg ?? "—"} {row.unit ?? ""}</span>,
    },
    {
      key: "price",
      header: "Price",
      render: (row) => <span>{row.price_inr ? `₹${row.price_inr.toLocaleString("en-IN")}` : "—"}</span>,
    },
    { key: "region", header: "Region", render: (row) => <span className="text-[11.5px]">{[row.district, row.state].filter(Boolean).join(", ") || "—"}</span> },
    { key: "status", header: "Status", render: (row) => <Badge tone={row.status === "active" ? "green" : "neutral"}>{row.status}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: "listings", label: "Crop listings" },
            { key: "retailer-products", label: "Shop products" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSource(tab.key)}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${source === tab.key ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {source === "listings" ? (
        <AdminListPage<ListingRow>
          title="Marketplace"
          subtitle="Farmer listings on the marketplace. Moderation is a status change, never a delete."
          module="marketplace"
          permission="marketplace.view"
          path="/business/listings"
          columns={listingColumns}
          rowKey={(row) => row.id}
          selects={[{ label: "Status", param: "status", options: ["active", "sold", "archived"] }]}
          searchPlaceholder="Listing title"
          emptyTitle="No listings"
          footer={
            <p className="text-[10.5px] text-slate-400">
              <Archive className="mr-1 inline h-3 w-3" />
              Payment card data is never stored or shown in this panel.
            </p>
          }
        />
      ) : (
        <ShopProducts onModerate={(id, action) => void moderate(id, action)} />
      )}
    </div>
  );
}

async function moderate(id: string, action: "hide" | "restore") {
  const reason = window.prompt(`Reason for ${action === "hide" ? "hiding" : "restoring"} this product:`, "");
  if (!reason || reason.trim().length < 3) return;
  await adminFetch(`/business/products/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ action, reason: reason.trim() }),
  });
}

/** Shape of `retailer_products` as the admin endpoint returns it. */
type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price_inr: number | null;
  stock_qty: number | null;
  status: "active" | "paused" | "archived";
};

const onSale = (row: ProductRow) => row.status === "active";

function ShopProducts({ onModerate }: { onModerate: (id: string, action: "hide" | "restore") => void }) {
  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      render: (row) => (
        <div>
          <p className="text-[12.5px] font-semibold text-slate-800">{row.name}</p>
          <p className="text-[10.5px] text-slate-500">{row.brand ?? "—"}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (row) => <Badge tone="sky">{row.category ?? "—"}</Badge> },
    { key: "price_inr", header: "Price", render: (row) => <span>{row.price_inr != null ? `₹${Number(row.price_inr).toLocaleString("en-IN")}` : "—"}</span> },
    { key: "stock_qty", header: "Stock", render: (row) => <span>{row.stock_qty ?? "—"}</span> },
  ];

  return (
    <AdminListPage<ProductRow>
      title="Shop products"
      subtitle="Products sold by retailers through the CenAGRI shop"
      module="marketplace"
      permission="marketplace.view"
      path="/business/retailer-products"
      columns={columns}
      rowKey={(row) => row.id}
      searchPlaceholder="Product name or brand"
      emptyTitle="No shop products"
      rowActions={(row) => (
        <button
          type="button"
          onClick={() => onModerate(row.id, onSale(row) ? "hide" : "restore")}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline"
        >
          <Store className="h-3 w-3" />
          {onSale(row) ? "Hide" : "Restore"}
        </button>
      )}
    />
  );
}
