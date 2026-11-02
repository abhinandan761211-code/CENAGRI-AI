import { useMemo, useState } from "react";
import { CalendarCheck2, Car, CheckCircle2, XCircle } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { EquipmentStatusPill, SectionHeading } from "@/components/equipment/ui";
import { EmptyState, ErrorNotice, Loading, Panel, inputClass } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  checkAvailability,
  dateRange,
  describeEquipmentError,
  formatDate,
  listBlocks,
  listBookings,
  listEquipment,
  nextServiceLabel,
  todayISO,
  upcomingBookings,
} from "@/lib/equipment";
import type { Equipment, EquipmentBlock, EquipmentBooking } from "@/lib/equipment";

/**
 * Equipment Availability.
 *
 * Answers the only question that matters before promising a machine: are these
 * dates really free? The answer comes from the same conflict rules the database
 * enforces, so a "yes" here is not optimistic.
 */
export default function EquipmentAvailability() {
  const D = describeEquipmentError;
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);
  const blocks = useWorkerData<EquipmentBlock[]>(() => listBlocks(), [], D);

  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const equipmentList = equipment.data ?? [];
  const bookingList = bookings.data ?? [];
  const blockList = blocks.data ?? [];

  const checks = useMemo(
    () =>
      equipmentList.map((e) => ({
        equipment: e,
        result: checkAvailability(e.id, from, to, bookingList, blockList),
        upcoming: upcomingBookings(
          bookingList.filter((b) => b.equipment_id === e.id),
          3
        ),
      })),
    [equipmentList, from, to, bookingList, blockList]
  );

  /** 14-day strip per machine, for a quick visual. */
  const stripDays = useMemo(() => dateRange(today, addDays(today, 13)), [today]);

  if (equipment.state === "loading") {
    return (
      <EquipmentLayout title="Equipment Availability">
        <Loading label="Checking availability…" />
      </EquipmentLayout>
    );
  }

  const freeCount = checks.filter((c) => c.result.ok).length;

  return (
    <EquipmentLayout title="Equipment Availability" subtitle="Which machine can take which dates">
      {equipment.state === "error" && <ErrorNotice message={equipment.error} onRetry={equipment.reload} />}

      <Panel title="Check a date range" description="Run against real bookings and maintenance blocks">
        <div className="grid gap-2 p-4 sm:grid-cols-3 sm:p-5">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </label>
          <div className="flex items-end">
            <p className="text-[11.5px] text-slate-600">
              <strong className="font-bold text-forest">{freeCount}</strong> of {equipmentList.length} machine(s)
              free for this period.
            </p>
          </div>
        </div>
      </Panel>

      <section>
        <SectionHeading title="Machines" hint="Booked windows and block status at a glance" />
        {equipmentList.length === 0 ? (
          <Panel title="Machines">
            <EmptyState
              icon={Car}
              title="No machine registered"
              description="Availability is per machine. Add one to see its bookings and free dates here."
            />
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {checks.map(({ equipment: e, result, upcoming }) => {
              const service = nextServiceLabel(e.next_service_on);
              return (
                <Panel
                  key={e.id}
                  title={e.title}
                  description={e.category ?? "Uncategorised"}
                  action={<EquipmentStatusPill status={e.status} />}
                >
                  <div className="space-y-3 p-4">
                    <div
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold ${
                        result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
                      }`}
                    >
                      {result.ok ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Free {from === to ? `on ${formatDate(from)}` : `${formatDate(from)} → ${formatDate(to)}`}
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                          Not free — {result.reason}
                        </>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Next 14 days
                      </p>
                      <div className="flex gap-0.5">
                        {stripDays.map((d) => {
                          const booked = bookingList.some(
                            (b) =>
                              b.equipment_id === e.id &&
                              !["closed", "rejected", "declined", "cancelled"].includes(b.status) &&
                              d >= b.starts_on &&
                              d <= b.ends_on
                          );
                          const blocked = blockList.some(
                            (b) => b.equipment_id === e.id && d >= b.starts_on && d <= b.ends_on
                          );
                          return (
                            <div
                              key={d}
                              title={formatDate(d)}
                              className={`h-4 flex-1 rounded-sm ${
                                booked ? "bg-blue-500" : blocked ? "bg-amber-400" : "bg-emerald-200"
                              }`}
                            />
                          );
                        })}
                      </div>
                      <div className="mt-1 flex gap-3 text-[9.5px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm bg-emerald-200" /> free
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm bg-blue-500" /> booked
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm bg-amber-400" /> blocked
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarCheck2 className="h-3 w-3" /> {upcoming.length} upcoming
                      </span>
                      <span
                        className={
                          service.overdue ? "font-bold text-rose-700" : service.days != null && service.days <= 30 ? "font-bold text-amber-700" : ""
                        }
                      >
                        Service {service.label.toLowerCase()}
                      </span>
                    </div>

                    {upcoming.length > 0 && (
                      <ul className="space-y-1">
                        {upcoming.map((b) => (
                          <li key={b.id} className="truncate text-[10.5px] text-slate-600">
                            · {formatDate(b.starts_on)} → {formatDate(b.ends_on)} — {b.renter_name ?? "Renter"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      <Panel title="Rules the database enforces" description="So a promise on this screen holds">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• Two bookings for the same machine may not share a date — checked under a row lock.</li>
          <li>• A maintenance block refuses any booking that overlaps it.</li>
          <li>• A block cannot be created over an existing booking — cancel or move it first.</li>
          <li>• An operator cannot be assigned to two overlapping jobs.</li>
        </ul>
      </Panel>
    </EquipmentLayout >
  );
}

/** Small helper — `dateRange` needs both ends, so add days without importing again. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
