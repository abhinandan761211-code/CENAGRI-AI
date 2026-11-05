import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Package, Route, Truck, Users } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { ErrorNote, Input, PrimaryButton } from "@/components/farm/farmerUI";
import { SchemaBanner } from "@/components/farm/SchemaBanner";
import { useAuth } from "@/hooks/useAuth";
import { useTableExists } from "@/lib/schemaCheck";
import { createTransportRequest, listAvailableVehicles, listMyTransportRequests } from "@/lib/farmerServices";
import type { AvailableVehicle, MyTransportRequest } from "@/lib/farmerServices";

const VEHICLES = [
  { label: "Truck", hint: "10 ton+ for mandi runs and bulk produce" },
  { label: "Tempo", hint: "1–3 ton for vegetables and short trips" },
  { label: "Tractor-trolley", hint: "Field-to-godown, rough tracks" },
  { label: "Other", hint: "Pickup and other small loads" },
];

/**
 * Transport Services.
 *
 * Lists `vehicles` published by transporter accounts and files a
 * `transport_requests` row the transporter's Requests screen reads. The page
 * used to show four static cards and a "nothing here yet" block regardless of
 * how many vehicles were registered.
 *
 * No fare is shown: distance and load decide it, and the owner quotes after
 * seeing the pickup and drop-off.
 */
export default function TransportServices() {
  const { profile } = useAuth();
  const schema = useTableExists("vehicles");

  const [vehicles, setVehicles] = useState<AvailableVehicle[]>([]);
  const [requests, setRequests] = useState<MyTransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ pickup: "", dropoff: "", load: "", when: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState(false);

  const district = profile?.details?.district ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [v, r] = await Promise.all([listAvailableVehicles(), listMyTransportRequests()]);
      setVehicles(v);
      setRequests(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load transport.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schema.exists !== false) void load();
  }, [schema.exists, load]);

  const nearbyVehicles = useMemo(
    () =>
      vehicles.filter((v) => (v.district ?? "").toLowerCase() === (district ?? "").toLowerCase()),
    [vehicles, district]
  );

  const loadBooked = useMemo(
    () => requests.reduce((sum, r) => sum + Number(r.load_kg ?? 0), 0),
    [requests]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSent(false);
    setSaving(true);
    try {
      await createTransportRequest({
        pickup: form.pickup,
        dropoff: form.dropoff,
        loadKg: form.load ? Number(form.load) : null,
        neededOn: form.when || null,
      });
      setForm({ pickup: "", dropoff: "", load: "", when: "" });
      setSent(true);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not raise the request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FeatureShell
      title="Transport Services"
      description="Book a truck, tempo or tractor-trolley to move produce from your field to the mandi, warehouse or buyer."
    >
      {schema.exists === false && (
        <SchemaBanner file={schema.file} tables={["vehicles", "transport_requests"]} />
      )}

      <FarmerStats
        items={[
          {
            label: "Vehicles listed",
            value: String(vehicles.length),
            icon: Truck,
            hint: nearbyVehicles.length > 0 ? `${nearbyVehicles.length} in your district` : "Across all districts",
          },
          { label: "Your trips", value: String(requests.length), icon: Route, hint: "Requests you have raised" },
          {
            label: "Load booked",
            value: loadBooked > 0 ? `${loadBooked.toLocaleString("en-IN")} kg` : "0 kg",
            icon: Package,
            hint: "Across all your trips",
          },
          { label: "Vehicle types", value: String(new Set(vehicles.map((v) => v.kind)).size), icon: Users, hint: "Kinds available" },
        ]}
      />

      {error && (
        <div className="px-4 sm:px-5">
          <ErrorNote message={error} />
        </div>
      )}

      <FarmerSection title="Available vehicles" description="Published by transport owners" icon={Truck}>
        {loading ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">Loading vehicles…</p>
        ) : vehicles.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Truck className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-forest">No vehicles listed yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              Transport owners list their vehicle, capacity and service area. As soon as one registers
              it appears here — you can still raise a trip request below.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {vehicles.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[12px] sm:px-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <Truck className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-forest">{v.kind}</span>
                  <span className="text-[11px] text-slate-500">
                    {v.district ?? "District not set"}
                    {v.state ? `, ${v.state}` : ""}
                  </span>
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  up to {Number(v.capacity_kg).toLocaleString("en-IN")} kg
                </span>
              </li>
            ))}
          </ul>
        )}
      </FarmerSection>

      <FarmerSection title="Plan a trip" description="Tell the owner what to move and when" icon={MapPin}>
        <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Pickup
            </span>
            <Input
              value={form.pickup}
              onChange={(e) => setForm({ ...form, pickup: e.target.value })}
              placeholder="Field / village, with a landmark"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Drop-off
            </span>
            <Input
              value={form.dropoff}
              onChange={(e) => setForm({ ...form, dropoff: e.target.value })}
              placeholder="Mandi, warehouse or buyer"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Needed on
            </span>
            <Input type="date" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Load (kg) <span className="font-normal normal-case text-slate-400">optional</span>
            </span>
            <Input
              type="number"
              min={1}
              value={form.load}
              onChange={(e) => setForm({ ...form, load: e.target.value })}
              placeholder="e.g. 2000"
            />
          </label>

          {formError && (
            <p role="alert" className="sm:col-span-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {formError}
            </p>
          )}
          {sent && (
            <p className="sm:col-span-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Request sent. Vehicle owners in your area can now see it.
            </p>
          )}

          <div className="sm:col-span-3 flex justify-end">
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Sending…" : "Raise trip request"}
            </PrimaryButton>
          </div>
        </form>
        <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Distance, load weight and road condition decide the fare. Owners quote after they see
            the pickup and drop-off, so you are never shown a made-up rate.
          </p>
        </div>
      </FarmerSection>

      {requests.length > 0 && (
        <FarmerSection title="Your trip requests" icon={Route}>
          <ul className="divide-y divide-slate-100">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-[12px] sm:px-5">
                <span className="min-w-0 flex-1 truncate font-semibold text-forest">
                  {r.pickup} → {r.dropoff}
                </span>
                {r.needed_on && <span className="text-slate-500">{r.needed_on}</span>}
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${r.status === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : r.status === "cancelled"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </FarmerSection>
      )}
    </FeatureShell>
  );
}
