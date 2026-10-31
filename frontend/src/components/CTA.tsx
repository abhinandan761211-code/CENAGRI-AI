import { ArrowRight, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section id="signup" className="bg-cream pb-16 lg:pb-20">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-2xl bg-forest px-6 py-12 text-center sm:px-12 lg:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(60% 120% at 10% 0%, #2b6350 0%, rgba(43,99,80,0) 70%), radial-gradient(50% 100% at 95% 100%, #16a34a 0%, rgba(22,163,74,0) 70%)",
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <span className="eyebrow rounded-full bg-white/10 px-3 py-1.5 text-brand-200">
              Free to start
            </span>
            <h2 className="mx-auto mt-4 max-w-2xl font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl">
              Your next harvest deserves better decisions.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brand-100 sm:text-base">
              Join 48,000+ farmers, buyers and agri-businesses already using CenAGRI-AI.
              No card needed.
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-bold text-forest transition hover:bg-brand-50"
              >
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#app"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <Smartphone className="h-4 w-4" />
                Get the app
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
