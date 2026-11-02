import { useMemo, useState } from "react";
import { MapPin, Navigation, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import EquipmentLayout, { EQUIPMENT_ROUTES, equipmentEditPath } from "@/components/equipment/EquipmentLayout";
import { NoTrackingNotice, SectionHeading } from "@/components/equipment/ui";
import { EmptyState, ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import { describeEquipmentError, formatDate, listBookings, listEquipment } from "@/lib/equipment";
import type { Equipment, EquipmentBooking } from "@/lib/equipment";

/**
 * Equipment Location & Service Area.
 *
 * Deliberately contains no map and no GPS. What it shows is exactly what the
 * owner recorded: where each machine is kept, which districts it serves, how far
 * it will travel, and where it is booked to work next.
 *
 * Anything not on file is shown as "not set" rather than guessed.
 */
export default function EquipmentLocation() {
  const D = describeEquipmentError;
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);

  const [district, setDistrict] = useState("all");

  const equipmentList = equipment.data ?? [];
  const bookingList = bookings.data ?? [];

  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const e of equipmentList) {
      if (e.district) set.add(e.district);
      for (const d of e.service_districts) set.add(d);
    }
    return [...set].sort();
  }, [equipmentList]);

  const shown = district === "all" ? equipmentList : equipmentList.filter((e) => e.district === district);

  /** Where each machine is next booked to work. */
  const nextJob = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map<string, EquipmentBooking>();
    for (const b of bookingList) {
      if (b.ends_on < today) continue;
      if (["closed", "rejected", "declined", "cancelled"].includes(b.status)) continue;
      const current = map.get(b.equipment_id);
      if (!current || b.starts_on < current.starts_on) map.set(b.equipment_id, b);
    }
    return map;
  }, [bookingList]);

  if (equipment.state === "loading") {
    return (
      <EquipmentLayout title="Equipment Location">
        <Loading label="Loading locations…" />
      </EquipmentLayout>
    );
  }

  const withLocation = equipmentList.filter((e) => e.location_text || e.district || e.village).length;

  return (
    <EquipmentLayout title="Equipment Location" subtitle="Where each machine is kept and where it works">
      {equipment.state === "error" && <ErrorNotice message={equipment.error} onRetry={equipment.reload} />}

      <NoTrackingNotice />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Machines" value={String(equipmentList.length)} hint="In your fleet" />
        <Tile label="Location set" value={String(withLocation)} hint="Have an address" />
        <Tile label="Districts served" value={String(districts.length)} hint="Across the fleet" />
        <Tile
          label="Delivery offered"
          value={String(equipmentList.filter((e) => e.offers_delivery).length)}
          hint="Can travel to the farm"
        />
      </section>

      <Panel
        title="Machines by location"
        description="Recorded location and service area"
        action={
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11.5px] text-slate-700"
          >
            <option value="all">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        }
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No machine registered"
            description="Location and service area are set per machine on its edit screen. Add a machine to record where it is kept."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((e) => {
              const next = nextJob.get(e.id);
              return (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={equipmentEditPath(e.id)}
                        className="truncate text-[12.5px] font-semibold text-forest hover:underline"
                      >
                        {e.title}
                      </Link>
                      <p className="text-[10.5px] text-slate-500">
                        {[e.location_text, e.village, e.district, e.state].filter(Boolean).join(", ") ||
                          "Location not set"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {e.offers_delivery && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-bold text-emerald-800">
                          <Truck className="h-2.5 w-2.5" /> delivery
                        </span>
                      )}
                      {e.service_radius_km != null && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-600">
                          {e.service_radius_km} km radius
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                    {e.service_districts.length > 0 ? (
                      <>
                        <span className="font-semibold text-slate-600">Serves:</span>
                        {e.service_districts.map((d) => (
                          <span key={d} className="rounded-full bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-800">
                            {d}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span>Service districts not set — renters cannot filter on this machine.</span>
                    )}
                  </div>

                  {next && (
                    <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-slate-600">
                      <Navigation className="h-3 w-3 shrink-0 text-slate-400" />
                      Next job {formatDate(next.starts_on)} at {next.farm_location ?? "location not given"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <section>
        <SectionHeading title="What this module does and does not know" />
        <Panel title="Honest limits">
          <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
            <li>
              • <strong>No live tracking.</strong> Nothing is polled, no position is stored between jobs, and
              no ETA is calculated.
            </li>
            <li>
              • The <strong>next job</strong> line above is the booking's farm address, not a GPS fix.
            </li>
            <li>
              • "Location not set" is a real answer — the owner simply has not recorded it.
            </li>
            <li>
              • Service radius is a business statement, not a distance calculation. A renter can still
              request a machine outside it.
            </li>
          </ul>
        </Panel>
      </section>

      <Panel title="Improve your reach" description="What makes a machine easier to find">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• Fill in the district — renters filter by it before anything else.</li>
          <li>• Add every district you genuinely serve; an overstated radius leads to cancellations.</li>
          <li>• Turn on delivery only if you can actually move the machine to a farm.</li>
        </ul>
        <div className="border-t border-slate-100 px-4 py-3">
          <Link
            to={EQUIPMENT_ROUTES.equipment}
            className="text-[11px] font-bold text-brand-700 hover:underline"
          >
            Go to My Equipment →
          </Link>
        </div>
      </Panel>
    </EquipmentLayout>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-[15px] font-extrabold text-forest">{value}</p>
      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
