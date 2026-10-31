import { Quote } from "lucide-react";
import { TESTIMONIALS } from "@/lib/data";

export default function Testimonials() {
  return (
    <section id="stories" className="bg-cream py-16 lg:py-20">
      <div className="container-x">
        <div className="max-w-2xl">
          <span className="eyebrow">Success stories</span>
          <h2 className="section-title mt-2">Trusted in 14 districts of West Bengal</h2>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="card flex flex-col p-6">
              <Quote className="h-6 w-6 text-brand-300" />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-700">
                {t.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-forest text-xs font-bold text-white">
                  {t.initials}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-forest">{t.name}</span>
                  <span className="block text-xs text-slate-500">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
