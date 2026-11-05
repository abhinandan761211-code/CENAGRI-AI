import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  IndianRupee,
  Package,
  Tractor,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { ErrorNote, Input, PrimaryButton } from "@/components/farm/farmerUI";
import { SchemaBanner } from "@/components/farm/SchemaBanner";
import { useAuth } from "@/hooks/useAuth";
import { useTableExists } from "@/lib/schemaCheck";
import { bookMachine, listMyMachineBookings, listRentableMachines } from "@/lib/farmerServices";
import type { MyMachineBooking, RentableMachine } from "@/lib/farmerServices";

const CATEGORIES = [
  { icon: Tractor, label: "Tractor", hint: "Ploughing, haulage, trolley work" },
  { icon: Package, label: "Harvester", hint: "Paddy and wheat harvesting" },
  { icon: Wrench, label: "Pump & sprayer", hint: "Irrigation and crop spraying" },
  { icon: CalendarDays, label: "Power tiller", hint: "Small plots and vegetable beds" },
];

/**
 * Equipment Rental.
 *
 * Reads the `equipment` table that equipment-owner accounts publish into, and
 * writes a row to `equipment_bookings` — the same tables the owner's Requests
 * screen lists. This screen used to be a demo preview showing zero machines even
 * when owners had listed them, with no way to request a booking at all.
 */
export default function EquipmentRental() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const schema = useTableExists("equipment");

  const [machines, setMachines] = useState<RentableMachine[]>([]);
  const [bookings, setBookings] = useState<MyMachineBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");

  // Booking dialog
  const [bookingFor, setBookingFor] = useState<RentableMachine | null>(null);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const district = profile?.details?.district ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, mine] = await Promise.all([listRentableMachines(), listMyMachineBookings()]);
      setMachines(rows);
      setBookings(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load machines.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schema.exists !== false) void load();
  }, [schema.exists, load]);

  /** Machines in the farmer's own district first, then everything else. */
  const visible = useMemo(() => {
    const mine = (district ?? "").toLowerCase();
    const filtered = kind ? machines.filter((m) => m.kind === kind) : machines;
    return [...filtered].sort((a, b) => {
      const aMine = (a.district ?? "").toLowerCase() === mine ? 0 : 1;
      const bMine = (b.district ?? "").toLowerCase() === mine ? 0 : 1;
      return aMine - bMine;
    });
  }, [machines, kind, district]);

  const nearbyCount = useMemo(
    () => machines.filter((m) => (m.district ?? "").toLowerCase() === (district ?? "").toLowerCase()).length,
    [machines, district]
  );

  const typicalRate = useMemo(() => {
    const dayRates = machines.filter((m) => m.rate_unit === "day").map((m) => Number(m.rate_inr));
    if (dayRates.length === 0) return "—";
    const avg = dayRates.reduce((s, v) => s + v, 0) / dayRates.length;
    return `₹${Math.round(avg).toLocaleString("en-IN")}`;
  }, [machines]);

  const activeOwners = useMemo(
    () => new Set(machines.map((m) => m.owner_name ?? m.id)).size,
    [machines]
  );

  function openBooking(machine: RentableMachine) {
    setBookingFor(machine);
    setFrom(new Date().toISOString().slice(0, 10));
    setTo(new Date().toISOString().slice(0, 10));
    setFormError("");
  }

  async function submitBooking() {
    if (!bookingFor) return;
    setSaving(true);
    setFormError("");
    try {
      await bookMachine({ equipmentId: bookingFor.id, startsOn: from, endsOn: to });
      setBookingFor(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send the booking request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FeatureShell
      title="Equipment Rental"
      description="Rent tractors, pumps, harvesters and sprayers from owners in your block, by the hour or the day."
    >
      {schema.exists === false && (
        <SchemaBanner file={schema.file} tables={["equipment", "equipment_bookings"]} />
      )}

      <FarmerStats
        items={[
          {
            label: "Machines listed",
            value: String(machines.length),
            icon: Tractor,
            hint: nearbyCount > 0 ? `${nearbyCount} in your district` : "Across all districts",
          },
          { label: "Your bookings", value: String(bookings.length), icon: CalendarDays, hint: "Requests you have sent" },
          { label: "Typical day rate", value: typicalRate, icon: IndianRupee, hint: "Average of day rates" },
          { label: "Owners", value: String(activeOwners), icon: Users, hint: "With at least one machine" },
        ]}
      />

      {error && (
        <div className="px-4 sm:px-5">
          <ErrorNote message={error} />
        </div>
      )}

      <FarmerSection
        title="Browse by equipment type"
        description="Filter the machines owners have published"
        icon={Package}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          {CATEGORIES.map(({ icon: Icon, label, hint }) => {
            const count = machines.filter((m) => m.kind === label).length;
            const active = kind === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setKind(active ? "" : label)}
                aria-pressed={active}
                className={`rounded-xl border p-4 text-left transition hover:border-brand-300 hover:shadow-card ${active ? "border-brand-400 bg-brand-50/60" : "border-slate-200"
                  }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <p className="mt-2 text-sm font-semibold text-forest">{label}</p>
                <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
                <p className="mt-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {loading ? "Loading…" : `${count} listed`}
                </p>
              </button>
            );
          })}
        </div>
      </FarmerSection>

      <FarmerSection
        title={kind ? `${kind} available` : "Available machines"}
        description="Published by owners. Rates are theirs; nothing is charged until they accept."
        icon={Tractor}
      >
        {loading ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">Loading machines…</p>
        ) : visible.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Tractor className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-forest">No machines listed yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              Owners publish a machine with its rate and availability. As soon as one is listed it
              appears here, with a request button.
            </p>
            <button
              type="button"
              onClick={() => navigate("/marketplace")}
              className="btn-outline mt-4 h-9 px-4 text-xs"
            >
              Browse the marketplace meanwhile
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((machine) => (
              <li key={machine.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-forest">{machine.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {machine.kind}
                    {machine.owner_name ? ` · ${machine.owner_name}` : ""}
                    {machine.district ? ` · ${machine.district}` : ""}
                  </p>
                </div>
                <p className="text-[13px] font-bold text-brand-700">
                  ₹{Number(machine.rate_inr).toLocaleString("en-IN")}
                  <span className="text-[10px] font-medium text-slate-500"> / {machine.rate_unit}</span>
                </p>
                <PrimaryButton type="button" onClick={() => openBooking(machine)}>
                  Request booking
                </PrimaryButton>
              </li>
            ))}
          </ul>
        )}
      </FarmerSection>

      {bookings.length > 0 && (
        <FarmerSection title="Your booking requests" icon={CalendarDays}>
          <ul className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-[12px] sm:px-5">
                <span className="min-w-0 flex-1 truncate font-semibold text-forest">
                  {b.machine_title ?? "Machine"}
                </span>
                <span className="text-slate-500">
                  {b.starts_on} → {b.ends_on}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${b.status === "accepted"
                      ? "bg-emerald-50 text-emerald-700"
                      : b.status === "declined"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                >
                  {b.status}
                </span>
              </li>
            ))}
          </ul>
        </FarmerSection>
      )}

      <FarmerSection title="How renting works" icon={TrendingUp}>
        <ol className="divide-y divide-slate-100">
          {[
            ["Find a machine", "Filter by type. Rates come from the owner."],
            ["Send a request", "Pick your dates. The owner accepts or suggests another slot — nothing is charged until they accept."],
            ["Work the field", "The machine arrives on the agreed date. Payment is settled directly with the owner."],
          ].map(([title, body], index) => (
            <li key={title} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-forest">{title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </FarmerSection>

      {bookingFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-sm font-bold text-forest">Request {bookingFor.title}</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              ₹{Number(bookingFor.rate_inr).toLocaleString("en-IN")} per {bookingFor.rate_unit}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">From</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">To</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>

            {formError && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBookingFor(null)}
                disabled={saving}
                className="btn-outline h-9 px-3 text-xs"
              >
                Cancel
              </button>
              <PrimaryButton type="button" onClick={() => void submitBooking()} disabled={saving}>
                {saving ? "Sending…" : "Send request"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
