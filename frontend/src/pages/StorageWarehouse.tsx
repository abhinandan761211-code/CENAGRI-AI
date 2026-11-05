import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, CalendarDays, Snowflake, Thermometer, Warehouse } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { ErrorNote, Input, PrimaryButton } from "@/components/farm/farmerUI";
import { SchemaBanner } from "@/components/farm/SchemaBanner";
import { useAuth } from "@/hooks/useAuth";
import { useTableExists } from "@/lib/schemaCheck";
import { createStorageBooking, listMyStorageBookings, listStorageOptions } from "@/lib/farmerServices";
import type { MyStorageBooking, StorageOption } from "@/lib/farmerServices";

/**
 * Storage & Warehouse.
 *
 * Reads `warehouses` published by warehouse accounts and writes a
 * `storage_bookings` row their Bookings screen lists. The page used to be a
 * static preview that reported zero stores even when the table had rows.
 *
 * Free capacity is shown exactly as the store reports it (`available_kg`) and is
 * never estimated here: an invented "space available" could spoil a crop when
 * the store turns out to be full.
 */
export default function StorageWarehouse() {
  const { profile } = useAuth();
  const schema = useTableExists("warehouses");

  const [stores, setStores] = useState<StorageOption[]>([]);
  const [bookings, setBookings] = useState<MyStorageBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [bookingFor, setBookingFor] = useState<StorageOption | null>(null);
  const [quantity, setQuantity] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const district = profile?.details?.district ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, mine] = await Promise.all([listStorageOptions(), listMyStorageBookings()]);
      setStores(rows);
      setBookings(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load storage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schema.exists !== false) void load();
  }, [schema.exists, load]);

  const nearby = useMemo(
    () => stores.filter((s) => (s.district ?? "").toLowerCase() === (district ?? "").toLowerCase()),
    [stores, district]
  );

  const storedKg = useMemo(
    () => bookings.reduce((sum, b) => sum + Number(b.quantity_kg ?? 0), 0),
    [bookings]
  );

  const freeCapacity = useMemo(
    () => stores.reduce((sum, s) => sum + Number(s.available_kg ?? 0), 0),
    [stores]
  );

  function openBooking(store: StorageOption) {
    setBookingFor(store);
    setQuantity("");
    setStartsOn(today);
    setEndsOn(today);
    setFormError("");
  }

  async function submitBooking() {
    if (!bookingFor) return;
    setSaving(true);
    setFormError("");
    try {
      await createStorageBooking({
        warehouseId: bookingFor.id,
        quantityKg: Number(quantity),
        startsOn,
        endsOn,
      });
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
      title="Storage & Warehouse"
      description="Store your harvest safely after picking — dry godown for grain, cold storage for vegetables and fruit."
    >
      {schema.exists === false && (
        <SchemaBanner file={schema.file} tables={["warehouses", "storage_bookings"]} />
      )}

      <FarmerStats
        items={[
          {
            label: "Stores listed",
            value: String(stores.length),
            icon: Warehouse,
            hint: nearby.length > 0 ? `${nearby.length} in your district` : "Across all districts",
          },
          { label: "Your bookings", value: String(bookings.length), icon: CalendarDays, hint: "Requests you have sent" },
          {
            label: "Stored quantity",
            value: storedKg > 0 ? `${storedKg.toLocaleString("en-IN")} kg` : "0 kg",
            icon: Boxes,
            hint: "Across all bookings",
          },
          {
            label: "Free capacity",
            value: stores.length === 0 ? "—" : `${Math.round(freeCapacity).toLocaleString("en-IN")} kg`,
            icon: Thermometer,
            hint: "Reported by each store",
          },
        ]}
      />

      {error && (
        <div className="px-4 sm:px-5">
          <ErrorNote message={error} />
        </div>
      )}

      <FarmerSection
        title="Choose the right storage"
        description="Grain and vegetables need very different conditions"
        icon={Warehouse}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <div className="rounded-xl border border-slate-200 p-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-50 text-amber-700">
              <Thermometer className="h-[18px] w-[18px]" />
            </span>
            <p className="mt-2 text-sm font-semibold text-forest">Dry godown</p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Paddy, wheat, mustard and pulses. Ventilated, protected from rain and rodents — good
              for months of storage.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-50 text-sky-700">
              <Snowflake className="h-[18px] w-[18px]" />
            </span>
            <p className="mt-2 text-sm font-semibold text-forest">Cold storage</p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Potato, onion, vegetables and fruit. Temperature-controlled to slow ripening and
              prevent spoilage.
            </p>
          </div>
        </div>
      </FarmerSection>

      <FarmerSection
        title={district ? `Stores in ${district} and elsewhere` : "Available stores"}
        description="Capacity as reported by each store"
        icon={Warehouse}
      >
        {loading ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">Loading stores…</p>
        ) : stores.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Warehouse className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-forest">No storage listed yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              Warehouses publish their type, capacity and monthly rate. Free capacity is reported by
              the store itself — never estimated here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stores.map((store) => {
              const free = Number(store.available_kg ?? 0);
              return (
                <li key={store.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                    {store.kind === "Cold" ? <Snowflake className="h-4 w-4" /> : <Thermometer className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-forest">{store.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {store.kind} · {store.district ?? "District not set"}
                      {" · "}
                      {free > 0 ? `${free.toLocaleString("en-IN")} kg free` : "Full"}
                    </p>
                  </div>
                  {store.rate_inr != null && (
                    <p className="text-[13px] font-bold text-brand-700">
                      ₹{Number(store.rate_inr).toLocaleString("en-IN")}
                      <span className="text-[10px] font-medium text-slate-500">
                        {" "}
                        /{store.rate_unit === "quintal_month" ? "quintal·month" : "kg·month"}
                      </span>
                    </p>
                  )}
                  <PrimaryButton
                    type="button"
                    onClick={() => openBooking(store)}
                    disabled={free <= 0}
                  >
                    {free > 0 ? "Book space" : "Full"}
                  </PrimaryButton>
                </li>
              );
            })}
          </ul>
        )}
      </FarmerSection>

      {bookings.length > 0 && (
        <FarmerSection title="Your storage bookings" icon={CalendarDays}>
          <ul className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-[12px] sm:px-5">
                <span className="min-w-0 flex-1 truncate font-semibold text-forest">
                  {b.warehouse_name ?? "Store"}
                </span>
                <span className="text-slate-500">{Number(b.quantity_kg).toLocaleString("en-IN")} kg</span>
                <span className="text-slate-500">
                  {b.starts_on} → {b.ends_on}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${b.status === "accepted"
                      ? "bg-emerald-50 text-emerald-700"
                      : b.status === "cancelled"
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

      <FarmerSection title="Before you store" description="What a booking needs" icon={Boxes}>
        <ul className="divide-y divide-slate-100">
          {[
            ["Quantity and crop", "Storage is priced per quintal per month, so the weight and crop decide the cost."],
            ["Start and end date", "Most godowns book by the month. Cold storage often runs until you sell."],
            ["Confirm the space", "The owner accepts the booking — capacity is only reserved after that."],
          ].map(([title, body]) => (
            <li key={title} className="px-4 py-3 sm:px-5">
              <p className="text-[13px] font-semibold text-forest">{title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{body}</p>
            </li>
          ))}
        </ul>
      </FarmerSection>

      {bookingFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-sm font-bold text-forest">Book space at {bookingFor.name}</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {Number(bookingFor.available_kg ?? 0).toLocaleString("en-IN")} kg free
              {bookingFor.rate_inr != null
                ? ` · ₹${Number(bookingFor.rate_inr).toLocaleString("en-IN")} per ${bookingFor.rate_unit === "quintal_month" ? "quintal" : "kg"
                }/month`
                : ""}
            </p>

            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">Quantity (kg)</span>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 2000"
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">From</span>
                <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Until</span>
                <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
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
