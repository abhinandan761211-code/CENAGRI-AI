import { Compass, Languages, ShieldCheck, Sprout } from "lucide-react";
import { WHY_CHOOSE } from "@/lib/data";

const ICONS = {
  compass: Compass,
  chat: Languages,
  shield: ShieldCheck,
  logo: Sprout,
} as const;

export default function WhyChoose() {
  return (
    <section id="solutions" className="bg-cream py-16 lg:py-20">
      <div className="container-x">
        <div className="max-w-2xl">
          <span className="eyebrow">Why choose CenAGRI-AI</span>
          <h2 className="section-title mt-2">Advice you can actually act on</h2>
          <p className="mt-3 text-slate-600">
            Most agri apps give you data. We give you the next step — specific to your
            field, your crop and your district.
          </p>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          {WHY_CHOOSE.map((f) => {
            const Icon = ICONS[f.icon];
            return (
              <article
                key={f.title}
                className="card flex gap-4 p-5 transition hover:shadow-card-hover"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-forest">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {f.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
