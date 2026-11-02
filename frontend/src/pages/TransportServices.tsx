import { MapPin, Package, Route, Truck, Users } from "lucide-react";
import { FeatureShell } from "@/components/farm/FeatureShell";
import { FarmerSection, FarmerStats } from "@/components/farm/FarmerShell";
import { SchemaBanner } from "@/components/farm/SchemaBanner";
import { useTableExists } from "@/lib/schemaCheck";

const VEHICLES = [
  { label: "Truck", hint: "10 ton+ for mandi runs and bulk produce" },
  { label: "Tempo", hint: "1–3 ton for vegetables and short trips" },
  { label: "Tractor-trolley", hint: "Field-to-godown, rough tracks" },
  { label: "Pickup", hint: "Small loads, same-day delivery" },
];

/**
 * Transport Services — demo preview.
 *
 * `vehicles` and `transport_requests` exist in features.sql, but with no rows
 * there is nothing real to show. Prices are omitted rather than invented.
 */
export default function TransportServices() {
  const schema = useTableExists("vehicles");

  return (
    <FeatureShell
      title="Transport Services"
      description="Book a truck, tempo or tractor-trolley to move produce from your field to the mandi, warehouse or buyer."
      demo
      demoNote="Vehicle owners and trip requests need the `vehicles` and `transport_requests` tables (in database/supabase/features.sql). With no rows nothing is quoted here — transport prices vary by distance, load and road, so an invented number would mislead you."
    >
      {schema.exists === false && (
        <SchemaBanner file={schema.file} tables={["vehicles", "transport_requests"]} />
      )}

      <FarmerStats
        items={[
          { label: "Vehicles nearby", value: "0", icon: Truck, hint: "None listed in your block" },
          { label: "Your trips", value: "0", icon: Route, hint: "No trips booked yet" },
          { label: "Load booked", value: "0 kg", icon: Package, hint: "Across all your trips" },
          { label: "Trip providers", value: "0", icon: Users, hint: "Owners accepting trips" },
        ]}
      />

      <FarmerSection
        title="Available vehicle types"
        description="Pick the one that suits your load and road"
        icon={Truck}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          {VEHICLES.map(({ label, hint }) => (
            <div key={label} className="rounded-xl border border-slate-200 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Truck className="h-[18px] w-[18px]" />
              </span>
              <p className="mt-2 text-sm font-semibold text-forest">{label}</p>
              <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
            </div>
          ))}
        </div>
      </FarmerSection>

      <FarmerSection title="Plan a trip" description="What a booking collects from you" icon={MapPin}>
        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          {[
            ["Pickup", "Your field or village, with a landmark."],
            ["Drop-off", "Mandi, warehouse or the buyer's address."],
            ["When", "The date the load must move — harvest day."],
          ].map(([label, body]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-100/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{body}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Distance, load weight and road condition decide the fare. Owners quote after they see
            the pickup and drop-off, so you are never shown a made-up rate.
          </p>
        </div>
      </FarmerSection>

      <FarmerSection title="No transport listed in your block yet" icon={Truck}>
        <div className="px-6 py-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Truck className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold text-forest">Trip requests open when a provider joins</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Transport owners list their vehicle, capacity and service area. Once one registers in
            your district you can raise a trip request here.
          </p>
        </div>
      </FarmerSection>
    </FeatureShell>
  );
}
