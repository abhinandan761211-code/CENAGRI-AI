import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const STATS = [
  { value: "48,000+", label: "Farmers onboard" },
  { value: "12L+", label: "AI advisories served" },
  { value: "94%", label: "Said advice was useful" },
];

export default function Hero() {
  return (
    <section id="home" className="relative overflow-hidden bg-cream">
      {/* soft field glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70"
        style={{
          background:
            "radial-gradient(60% 70% at 20% 0%, #dcfce7 0%, rgba(220,252,231,0) 70%), radial-gradient(50% 60% at 90% 10%, #f0f4ea 0%, rgba(240,244,234,0) 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container-x relative grid items-center gap-12 pb-16 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-16">
        <div className="animate-fade-up">
          <span className="eyebrow rounded-full border border-brand-200 bg-white px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI for Bengal&apos;s farms
          </span>

          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-forest sm:text-5xl lg:text-[3.4rem]">
            Smart farming advice,
            <br />
            <span className="text-brand-700">in your own language.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            CenAGRI-AI brings weather alerts, crop advisory, live mandi prices and
            trusted buyers into one simple platform — built for farmers, traders and
            everyone who works between the field and the market.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/signup" className="btn-primary px-6 py-3 text-base">
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how-it-works" className="btn-outline px-6 py-3 text-base">
              <PlayCircle className="h-4 w-4" />
              See how it works
            </a>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-slate-200 pt-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="font-display text-xl font-bold text-forest sm:text-2xl">
                  {s.value}
                </dt>
                <dd className="mt-0.5 text-xs leading-snug text-slate-500 sm:text-sm">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative animate-fade-up [animation-delay:120ms]">
          <div className="relative overflow-hidden rounded-2xl border border-white/60 shadow-card-hover">
            <img
              src="/images/hero-farmer.jpg"
              alt="Farmer using the CenAGRI-AI mobile advisory app in a paddy field"
              className="h-[360px] w-full object-cover sm:h-[440px] lg:h-[520px]"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-dark/55 via-transparent to-transparent" />

            <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/95 p-3.5 shadow-card backdrop-blur">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
                Today&apos;s advisory
              </p>
              <p className="mt-1 text-sm font-medium leading-snug text-forest">
                বৃষ্টির সম্ভাবনা ৭০% — আজ সেচ দেওয়া থেকে বিরত থাকুন।
              </p>
            </div>
          </div>

          <div className="absolute -left-3 top-6 hidden rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-card sm:block">
            <p className="text-[11px] font-medium text-slate-500">Paddy · ₹2,340/qtl</p>
            <p className="text-xs font-bold text-brand-700">▲ 3.2% vs last week</p>
          </div>
        </div>
      </div>
    </section>
  );
}
