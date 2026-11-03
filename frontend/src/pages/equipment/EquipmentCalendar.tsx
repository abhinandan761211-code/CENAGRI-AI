import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Wrench } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { BookingStatusPill, SectionHeading } from "@/components/equipment/ui";
import { EmptyState, ErrorNotice, Loading, Panel, inputClass } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  buildCalendar,
  dateRange,
  describeEquipmentError,
  formatDate,
  listBlocks,
  listBookings,
  listEquipment,
  todayISO,
} from "@/lib/equipment";
import type { Equipment, EquipmentBlock, EquipmentBooking } from "@/lib/equipment";

/**
 * Equipment Calendar.
 *
 * One row per machine, one cell per day. The cell state is computed by the same
 * `buildCalendar` helper the availability checker uses, so the two can never
 * disagree about whether a date is free.
 */
export default function EquipmentCalendar() {
  const D = describeEquipmentError;
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);
  const blocks = useWorkerData<EquipmentBlock[]>(() => listBlocks(), [], D);

  const today = todayISO();
  const [monthOffset, setMonthOffset] = useState(0);
  const [equipmentId, setEquipmentId] = useState("all");

  const equipmentList = equipment.data ?? [];
  const bookingList = bookings.data ?? [];
  const blockList = blocks.data ?? [];

  const { days, monthLabel } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const from = first.toISOString().slice(0, 10);
    const to = last.toISOString().slice(0, 10);
    return {
      days: dateRange(from, to),
      monthLabel: first.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    };
  }, [monthOffset]);

  const shown = equipmentId === "all" ? equipmentList : equipmentList.filter((e) => e.id === equipmentId);

  const calendars = useMemo(
    () =>
      shown.map((e) => ({
        equipment: e,
        days: buildCalendar(days, bookingList, blockList, e.id),
      })),
    [shown, days, bookingList, blockList]
  );

  const upcoming = useMemo(
    () =>
      bookingList
        .filter((b) => b.ends_on >= today && !["closed", "rejected", "declined", "cancelled"].includes(b.status))
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
        .slice(0, 6),
    [bookingList, today]
  );

  if (equipment.state === "loading") {
    return (
      <EquipmentLayout title="Equipment Calendar">
        <Loading label="Loading calendar…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout title="Equipment Calendar" subtitle="Which machine is free, day by day">
      {equipment.state === "error" && <ErrorNotice message={equipment.error} onRetry={equipment.reload} />}

      <Panel
        title={monthLabel}
        description="Green = free · Blue = booked · Amber = maintenance block"
        action={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonthOffset((v) => v - 1)}
              aria-label="Previous month"
              className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setMonthOffset(0)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => setMonthOffset((v) => v + 1)}
              aria-label="Next month"
              className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        <div className="border-b border-slate-100 p-3">
          <select
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            className={`${inputClass} h-8 max-w-xs text-[11.5px]`}
          >
            <option value="all">All machines</option>
            {equipmentList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>

        {equipmentList.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No machine to schedule"
            description="Add a machine first — the calendar shows its booked, blocked and free days."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                    Machine
                  </th>
                  {days.map((d) => {
                    const date = new Date(`${d}T00:00:00`);
                    const weekend = date.getDay() === 0 || date.getDay() === 6;
                    const isToday = d === today;
                    return (
                      <th
                        key={d}
                        className={`w-[26px] border-l border-slate-100 py-1.5 text-center text-[9px] font-bold ${isToday ? "bg-brand-50 text-brand-800" : weekend ? "text-slate-400" : "text-slate-600"
                          }`}
                        title={formatDate(d)}
                      >
                        {date.getDate()}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {calendars.map(({ equipment: e, days: cells }) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 max-w-[160px] truncate bg-white px-3 py-1.5 text-[11px] font-semibold text-forest">
                      {e.title}
                    </td>
                    {cells.map((cell) => (
                      <td key={cell.date} className="border-l border-slate-100 p-0.5">
                        <div
                          title={
                            cell.state === "booked"
                              ? `${formatDate(cell.date)} — booked by ${cell.booking?.renter_name ?? "renter"}`
                              : cell.state === "blocked"
                                ? `${formatDate(cell.date)} — ${cell.block?.kind}${cell.block?.reason ? `: ${cell.block.reason}` : ""}`
                                : `${formatDate(cell.date)} — ${cell.state}`
                          }
                          className={`h-6 rounded ${cell.state === "booked"
                              ? "bg-blue-500"
                              : cell.state === "blocked"
                                ? "bg-amber-400"
                                : cell.state === "past"
                                  ? "bg-slate-100"
                                  : "bg-emerald-100"
                            }`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Upcoming rentals" description="Next booked windows">
          {upcoming.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              No upcoming rental on the calendar.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">
                      {b.equipment_title ?? "Machine"} · {b.renter_name ?? "Renter"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      {formatDate(b.starts_on)} → {formatDate(b.ends_on)}
                    </p>
                  </div>
                  <BookingStatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Blocked periods" description="Maintenance and unavailability">
          {blockList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
              Nothing is blocked. Add a block from a machine's edit screen, or by logging maintenance.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {blockList.map((b) => {
                const machine = equipmentList.find((e) => e.id === b.equipment_id);
                return (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800">
                      <Wrench className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-semibold text-forest">
                        {machine?.title ?? "Machine"} · <span className="capitalize">{b.kind}</span>
                      </p>
                      <p className="text-[10.5px] text-slate-500">
                        {formatDate(b.starts_on)} → {formatDate(b.ends_on)}
                        {b.reason ? ` · ${b.reason}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <section>
        <SectionHeading title="Why the calendar is authoritative" />
        <Panel title="One source of truth">
          <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
            <li>• A booking and a maintenance block both occupy dates — the calendar paints both.</li>
            <li>• Confirming a booking re-checks these dates under a lock, so a second tab cannot double-book.</li>
            <li>• Rejected, declined and cancelled bookings release their dates immediately.</li>
          </ul>
        </Panel>
      </section>
    </EquipmentLayout>
  );
}
