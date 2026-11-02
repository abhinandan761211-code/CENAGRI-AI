import { Cloud, CloudOff } from "lucide-react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import { Badge, Empty, ErrorNotice, Loading, Panel } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";

type WeatherStatus = {
  configured: boolean;
  provider: string | null;
  capability: string;
  note: string;
};

/**
 * Weather management.
 *
 * The API does not own a weather feed today, and this page says so instead of
 * drawing an empty "0 alerts" dashboard. When a provider is integrated, the
 * shape of this screen is already here: status, locations, alert rules.
 */
export default function AdminWeather() {
  const { can } = useAdmin();
  const { data, loading, error, reload } = useAdminData<WeatherStatus>(
    () => adminFetch<WeatherStatus>("/agri/weather/status"),
    []
  );

  if (!can("agri_data.view")) {
    return (
      <AdminLayout title="Weather management">
        <NoAccess module="weather data" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Weather management" subtitle="Provider status and alert configuration">
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <Panel title="Provider">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">
                {data.configured ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-slate-800">
                  {data.provider ?? "No weather provider configured"}
                </p>
                <p className="text-[11px] text-slate-500">{data.note}</p>
              </div>
              <Badge tone={data.configured ? "green" : "amber"}>
                {data.configured ? "connected" : "not integrated"}
              </Badge>
            </div>
          </Panel>

          <Panel title="Weather alerts" description="Rules that push an alert to farmers in a district">
            <Empty
              icon={CloudOff}
              title="Alert configuration is not available yet"
              description="Alert rules can be added once a weather provider is integrated. Until then, no alert is sent — which is accurate, not silent."
            />
          </Panel>
        </>
      )}
    </AdminLayout>
  );
}
