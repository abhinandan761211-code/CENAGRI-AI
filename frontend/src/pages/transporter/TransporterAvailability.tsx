import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  Truck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import TransporterLayout, { TRANSPORTER_ROUTES } from "@/components/transporter/TransporterLayout";
import { BookingStatusPill } from "@/components/transporter/ui";
import { EmptyState, ErrorNotice, Loading, Modal, Panel } from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  ACTIVE_BOOKING_STATUSES,
  bookingsOn,
  describeTransporterError,
  formatDate,
  formatTime,
  listAvailability,
  listBookings,
  listDrivers,
  listFleet,
  setDayAvailability,
  todayISO,
} from "@/lib/transporter";
import type { AvailabilityRow, Driver, FleetVehicle, TransportBooking } from "@/lib/transporter";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Availability & scheduling.
 *
 * Shows, for one day, which vehicles and drivers are already committed and
 * which are free. A day with work cannot be marked unavailable without an
 * explicit confirmation — the same "no silent conflict" rule as the worker
 * calendar.
 */
export default function TransporterAvailability() {
  const D = describeTransporterError;

  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<string>(todayISO());
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);
  const drivers = useWorkerData<Driver[]>(() => listDrivers(), [], D);
  const availability = useWorkerData<AvailabilityRow[]>(() => listAvailability(), [], D);

  const rows = bookings.data ?? [];
  const vehicles = fleet.data ?? [];
  const driverRows = drivers.data ?? [];

  const dayMap = useMemo(() => {
    const map = new Map<string, AvailabilityRow>();
    for (const row of availability.data ?? []) map.set(row.day, row);
    return map;
  }, [availability.data]);

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const start = new Date(year, month, 1 - ((new Date(year, month, 1).getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const selectedJobs = selected ? bookingsOn(rows, selected) : [];
  const loading = bookings.state === "loading" || fleet.state === "loading";
  const failed =
    bookings.state === "error"
      ? bookings
      : fleet.state === "error"
        ? fleet
        : availability.state === "error"
          ? availability
          : null;

  /** Vehicles/drivers already committed that day. */
  const busyVehicles = new Set(selectedJobs.map((b) => b.vehicle_id).filter(Boolean) as string[]);
  const busyDrivers = new Set(selectedJobs.map((b) => b.driver_id).filter(Boolean) as string[]);

  async function mark(day: string, available: boolean) {
    setBusy(true);
    setError("");
    try {
      await setDayAvailability(day, available);
      setPendingDay(null);
      availability.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  function requestToggle(day: string) {
    const blocking = bookingsOn(rows, day).filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status) || b.status === "pickup_scheduled");
    if (blocking.length > 0) {
      setPendingDay(day);
      return;
    }
    void mark(day, !(dayMap.get(day)?.available === true));
  }

  const conflicts = pendingDay ? bookingsOn(rows, pendingDay) : [];

  return (
    <TransporterLayout
      title="Availability & Schedule"
      subtitle="Which days and vehicles are free"
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = new Date(cursor);
              next.setMonth(cursor.getMonth() - 1);
              setCursor(next);
            }}
            aria-label="Previous month"
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursor(now);
              setSelected(todayISO());
            }}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              const next = new Date(cursor);
              next.setMonth(cursor.getMonth() + 1);
              setCursor(next);
            }}
            aria-label="Next month"
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
      {loading && <Loading label="Loading schedule…" />}
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}
      {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}

      {!loading && !failed && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel
            title={cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            description="Click a date to see what is booked"
          >
            <div className="p-3 sm:p-4">
              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <p key={d} className="text-center text-[10px] font-bold uppercase text-slate-400">
                    {d}
                  </p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((day) => {
                  const key = iso(day);
                  const jobs = bookingsOn(rows, key);
                  const isOff = dayMap.get(key)?.available === false;
                  const isToday = key === todayISO();
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(key)}
                      className={`relative flex min-h-[56px] flex-col rounded-lg border p-1.5 text-left transition ${
                        selected === key
                          ? "border-brand-700 bg-brand-50"
                          : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
                      } ${day.getMonth() === cursor.getMonth() ? "" : "opacity-40"}`}
                    >
                      <span
                        className={`text-[11px] font-bold ${
                          isToday ? "w-fit rounded-full bg-brand-700 px-1.5 text-white" : "text-slate-700"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <span className="mt-auto flex flex-wrap items-center gap-0.5">
                        {jobs.slice(0, 3).map((j) => (
                          <span
                            key={j.id}
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                            aria-hidden="true"
                          />
                        ))}
                        {isOff && <CircleSlash className="h-2.5 w-2.5 text-slate-400" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Booked trip
                </span>
                <span className="flex items-center gap-1">
                  <CircleSlash className="h-3 w-3 text-slate-400" /> Marked unavailable
                </span>
              </div>
            </div>
          </Panel>

          <aside className="space-y-4">
            <Panel title="Selected day" description={selected ? formatDate(selected) : "Pick a date"}>
              <div className="space-y-3 p-4">
                {selected && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] text-slate-600">Availability</span>
                      <button
                        type="button"
                        onClick={() => requestToggle(selected)}
                        className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                          dayMap.get(selected)?.available === false
                            ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        }`}
                      >
                        {dayMap.get(selected)?.available === false ? "Unavailable" : "Available"}
                      </button>
                    </div>

                    {selectedJobs.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                        No trips booked on this day.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {selectedJobs.map((job) => (
                          <li key={job.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                            <p className="truncate text-[11.5px] font-semibold text-forest">{job.title}</p>
                            <p className="truncate text-[10.5px] text-slate-500">
                              {job.pickup_time ? formatTime(job.pickup_time) : "Time not set"} ·{" "}
                              {job.vehicle_registration ?? "No vehicle"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </Panel>

            <Panel title="On this day" description="Who is already committed">
              <div className="space-y-3 p-4">
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    <Truck className="h-3 w-3" /> Vehicles
                  </p>
                  {vehicles.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No vehicles yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {vehicles.map((v) => {
                        const busy = busyVehicles.has(v.id);
                        return (
                          <li key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate font-semibold text-slate-700">
                              {v.registration_no ?? v.vehicle_type}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${
                                busy ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {busy ? "Booked" : "Free"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    <Users className="h-3 w-3" /> Drivers
                  </p>
                  {driverRows.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No drivers added.</p>
                  ) : (
                    <ul className="space-y-1">
                      {driverRows.map((d) => {
                        const busy = busyDrivers.has(d.id);
                        return (
                          <li key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate font-semibold text-slate-700">{d.full_name}</span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${
                                busy ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {busy ? "Booked" : "Free"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </Panel>

            <Panel title="Upcoming trips">
              {rows.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status) || b.status === "pickup_scheduled").length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px] text-slate-500">Nothing scheduled.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows
                    .filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status) || b.status === "pickup_scheduled")
                    .slice(0, 5)
                    .map((b) => (
                      <li key={b.id} className="flex items-center gap-2 px-3.5 py-2.5">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-brand-700" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-semibold text-forest">{b.title}</p>
                          <p className="text-[10.5px] text-slate-500">
                            {b.pickup_on ? formatDate(b.pickup_on) : "Date not set"}
                          </p>
                        </div>
                        <Link
                          to={`${TRANSPORTER_ROUTES.trips}/${b.id}`}
                          className="shrink-0 text-[10.5px] font-bold text-brand-700 hover:underline"
                        >
                          Open
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      )}

      {!loading && !failed && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon={CalendarDays}
            title="No bookings on the calendar yet"
            description="Once you accept a transport request, its pickup date appears here and you can see which vehicles and drivers are busy."
          />
        </div>
      )}

      {/* ── Conflict confirmation ── */}
      <Modal
        open={Boolean(pendingDay)}
        onClose={() => setPendingDay(null)}
        title="You already have trips this day"
        subtitle={pendingDay ? formatDate(pendingDay) : undefined}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Marking this day unavailable does <strong>not</strong> cancel the trips below. Contact the
              requester separately if you cannot make it.
            </span>
          </div>
          <ul className="space-y-1.5">
            {conflicts.map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-semibold text-forest">{job.title}</p>
                  <p className="truncate text-[10.5px] text-slate-500">{job.pickup} → {job.dropoff}</p>
                </div>
                <BookingStatusPill status={job.status} />
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPendingDay(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !pendingDay}
              onClick={() => pendingDay && void mark(pendingDay, dayMap.get(pendingDay)?.available !== false)}
              className="inline-flex h-9 items-center rounded-lg bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Mark unavailable anyway"}
            </button>
          </div>
        </div>
      </Modal>
    </TransporterLayout>
  );
}
