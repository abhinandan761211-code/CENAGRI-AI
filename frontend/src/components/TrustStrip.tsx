import { CloudSun, Sprout, Landmark, Truck, Store } from "lucide-react";

const ITEMS = [
  { icon: CloudSun, label: "IMD Weather" },
  { icon: Sprout, label: "ICAR Advisories" },
  { icon: Landmark, label: "Mandi Prices" },
  { icon: Truck, label: "Logistics Partners" },
  { icon: Store, label: "Verified Buyers" },
];

export default function TrustStrip() {
  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="container-x py-5">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Built on trusted Indian data
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            {ITEMS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                <Icon className="h-4 w-4 text-brand-600" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
