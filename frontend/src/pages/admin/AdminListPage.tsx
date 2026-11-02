import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Button,
  DataTable,
  Empty,
  ErrorNotice,
  Loading,
  Pager,
  Panel,
  inputClass,
} from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";
import type { Page } from "@/lib/admin/api";

/**
 * One list screen, used by every module that is "a paged table with filters".
 *
 * Centralising it means pagination, loading, empty and error states behave the
 * same in all twenty modules, and a fix lands everywhere at once instead of in
 * each page copy.
 */

export type SelectOption = { label: string; param: string; options: string[] };

export default function AdminListPage<T>({
  title,
  subtitle,
  module,
  permission,
  path,
  query = {},
  columns,
  rowKey,
  selects = [],
  searchPlaceholder = "Search…",
  searchParam = "q",
  pageSize = 25,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  headerAction,
  footer,
  badgeKey,
  rowActions,
}: {
  title: string;
  subtitle?: string;
  /** Shown in the no-access state. */
  module: string;
  permission: string;
  path: string;
  query?: Record<string, string | undefined>;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  selects?: SelectOption[];
  searchPlaceholder?: string;
  searchParam?: string;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  headerAction?: ReactNode;
  footer?: ReactNode;
  badgeKey?: "kyc" | "reports" | "tickets";
  rowActions?: (row: T) => ReactNode;
}) {
  const { can } = useAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});

  const loader = useCallback(
    () =>
      adminFetch<Page<T>>(path, {
        query: {
          ...query,
          page,
          page_size: pageSize,
          ...(appliedSearch ? { [searchParam]: appliedSearch } : {}),
          ...choice,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, page, appliedSearch, JSON.stringify(choice), JSON.stringify(query)]
  );
  const { data, loading, error, reload } = useAdminData(loader, [loader]);

  if (!can(permission)) {
    return (
      <AdminLayout title={title} subtitle={subtitle}>
        <NoAccess module={module} />
      </AdminLayout>
    );
  }

  const withActions: Column<T>[] = rowActions
    ? [
        ...columns,
        {
          key: "_actions",
          header: "",
          className: "text-right",
          render: (row) => <div className="flex justify-end gap-1.5">{rowActions(row)}</div>,
        },
      ]
    : columns;

  return (
    <AdminLayout
      title={title}
      subtitle={subtitle}
      action={headerAction}
      badges={badgeKey ? { [badgeKey]: null } : undefined}
    >
      {(selects.length > 0 || searchParam) && (
        <Panel>
          <div className="flex flex-wrap items-end gap-3">
            {searchParam && (
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setPage(1);
                        setAppliedSearch(search.trim());
                      }
                    }}
                    placeholder={searchPlaceholder}
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </div>
            )}
            {selects.map((select) => (
              <div key={select.param}>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {select.label}
                </label>
                <select
                  value={choice[select.param] ?? ""}
                  onChange={(e) => {
                    setPage(1);
                    setChoice({ ...choice, [select.param]: e.target.value });
                  }}
                  className={inputClass}
                >
                  <option value="">All</option>
                  {select.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {searchParam && (
              <Button
                onClick={() => {
                  setPage(1);
                  setAppliedSearch(search.trim());
                }}
              >
                Apply
              </Button>
            )}
          </div>
        </Panel>
      )}

      {error && <ErrorNotice message={error} onRetry={reload} />}

      <Panel
        title={title}
        description={data ? `${data.total?.toLocaleString("en-IN") ?? "—"} records` : "Loading…"}
        flush
      >
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={withActions}
              rows={data?.rows ?? []}
              rowKey={rowKey}
              empty={<Empty icon={Search} title={emptyTitle} description={emptyDescription} />}
            />
            {(data?.rows.length ?? 0) > 0 && (
              <Pager page={page} pageSize={pageSize} total={data?.total ?? null} onPage={setPage} />
            )}
          </>
        )}
      </Panel>

      {footer}
    </AdminLayout>
  );
}

export type { Page };
