import { Play } from "lucide-react";
import { VIDEOS } from "@/lib/data";

export default function VideoSection() {
  return (
    <section id="resources" className="border-y border-slate-200 bg-white py-16 lg:py-20">
      <div className="container-x">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <span className="eyebrow">Watch &amp; learn</span>
            <h2 className="section-title mt-2">Short guides, made for real use</h2>
            <p className="mt-3 text-slate-600">
              Two-minute walkthroughs in Bengali and English, filmed with farmers who
              use CenAGRI-AI every day.
            </p>
          </div>
        </div>

        <div className="mt-9 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {VIDEOS.map((v) => (
            <a
              key={v.title}
              href="#watch"
              className="group card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="relative aspect-video overflow-hidden bg-sand">
                <img
                  src={v.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 grid place-items-center bg-forest-dark/25 transition group-hover:bg-forest-dark/40">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-forest shadow-card">
                    <Play className="h-4 w-4 translate-x-[1px] fill-forest" />
                  </span>
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-forest-dark/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {v.duration}
                </span>
              </div>
              <p className="p-3 text-[13px] font-semibold leading-snug text-forest">
                {v.title}
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
