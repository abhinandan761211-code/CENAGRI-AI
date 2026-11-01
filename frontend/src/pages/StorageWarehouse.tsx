import { Boxes, CalendarDays, Snowflake, Thermometer, Warehouse } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";

/**
 * Storage & Warehouse — demo preview.
 *
 * `warehouses` and `storage_bookings` are defined in features.sql but hold no
 * rows, so capacity and rates are not shown. An invented "500 kg free" would
 * put a farmer's crop at risk when it turned out to be full.
 */
export default function StorageWarehouse() {
  return (
    <FeatureShell
      title="Storage & Warehouse"
      description="Store your harvest safely after picking — dry godown for grain, cold storage for vegetables and fruit."
      demo
      demoNote="Warehouse space and bookings need the `warehouses` and `storage_bookings` tables (in database/supabase/features.sql). Free capacity is never estimated here: an invented 'space available' could spoil a crop when the store turns out to be full."
    >
      <FarmerStats
        items={[
          { label: "Stores nearby", value: "0", icon: Warehouse, hint: "None listed in your district" },
          { label: "Your bookings", value: "0", icon: CalendarDays, hint: "Nothing stored yet" },
          { label: "Stored quantity", value: "0 kg", icon: Boxes, hint: "Across all bookings" },
          { label: "Free capacity", value: "—", icon: Thermometer, hint: "Reported by each store" },
        ]}
      />

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

      <FarmerSection title="No storage listed in your district yet" icon={Warehouse}>
        <div className="px-6 py-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Warehouse className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold text-forest">Storage bookings open when a store joins</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Warehouses publish their type, capacity and monthly rate. Free capacity is reported by
            the store itself — never estimated here.
          </p>
        </div>
      </FarmerSection>
    </FeatureShell>
  );
}
