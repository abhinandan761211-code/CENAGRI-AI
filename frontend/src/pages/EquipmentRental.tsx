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

const CATEGORIES = [
  { icon: Tractor, label: "Tractor", hint: "Ploughing, haulage, trolley work" },
  { icon: Package, label: "Harvester", hint: "Paddy and wheat harvesting" },
  { icon: Wrench, label: "Pump & sprayer", hint: "Irrigation and crop spraying" },
  { icon: CalendarDays, label: "Power tiller", hint: "Small plots and vegetable beds" },
];

/**
 * Equipment Rental — demo preview.
 *
 * No `equipment` or `equipment_bookings` table exists yet, so availability and
 * rates are NOT shown. A fake "available today" would send a farmer to a
 * machine that is not there.
 */
export default function EquipmentRental() {
  const navigate = useNavigate();

  return (
    <FeatureShell
      title="Equipment Rental"
      description="Rent tractors, pumps, harvesters and sprayers from owners in your block, by the hour or the day."
      demo
      demoNote="Availability, owners and bookings need the `equipment` and `equipment_bookings` tables (already defined in database/supabase/features.sql). Until rows exist, this screen deliberately shows no prices and no availability — a fake 'available today' would send you to a machine that is not there."
    >
      <FarmerStats
        items={[
          { label: "Machines nearby", value: "0", icon: Tractor, hint: "None listed in your block" },
          { label: "Your bookings", value: "0", icon: CalendarDays, hint: "Nothing booked" },
          { label: "Typical day rate", value: "—", icon: IndianRupee, hint: "Set by each owner" },
          { label: "Active owners", value: "0", icon: Users, hint: "Owners with a live machine" },
        ]}
      />

      <FarmerSection
        title="Browse by equipment type"
        description="What you can rent once owners list their machines"
        icon={Package}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          {CATEGORIES.map(({ icon: Icon, label, hint }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:shadow-card"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <p className="mt-2 text-sm font-semibold text-forest">{label}</p>
              <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
              <p className="mt-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                Availability unknown
              </p>
            </div>
          ))}
        </div>
      </FarmerSection>

      <FarmerSection title="How renting works" icon={TrendingUp}>
        <ol className="divide-y divide-slate-100">
          {[
            ["Find a machine", "Filter by type and your block. Rates and free dates come from the owner."],
            ["Send a request", "Pick your dates. The owner accepts or suggests another slot — nothing is charged until they accept."],
            ["Work the field", "The machine arrives on the agreed date. Payment is settled directly with the owner."],
          ].map(([title, body], index) => (
            <li key={title} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800">
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

      <FarmerSection title="No machines listed in your area yet" icon={Tractor}>
        <div className="px-6 py-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Tractor className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold text-forest">
            Bookings open once owners list equipment
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Owners publish their machine with a rate and available dates. Until then this screen
            shows no prices and no availability.
          </p>
          <button
            type="button"
            onClick={() => navigate("/marketplace")}
            className="btn-outline mt-4 h-9 px-4 text-xs"
          >
            Browse the marketplace meanwhile
          </button>
        </div>
      </FarmerSection>
    </FeatureShell>
  );
}
