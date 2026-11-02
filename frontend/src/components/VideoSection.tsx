import { ArrowRight, Play } from "lucide-react";
import { VIDEOS } from "@/lib/data";
import { useLang } from "@/i18n/LanguageContext";

/** i18n keys for the four thumbnails, in the same order as VIDEOS. */
const TITLE_KEYS = ["videos.v1", "videos.v2", "videos.v3", "videos.v4"] as const;

export default function VideoSection() {
  const { t } = useLang();

  return (
    <section
      id="resources"
      className="border-y border-slate-200 bg-white py-14 sm:py-16 lg:py-20"
    >
      <div className="container-x">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <span className="landing-eyebrow">{t("videos.eyebrow")}</span>
            <h2 className="landing-h2 mt-3">{t("videos.title")}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
              {t("videos.body")}
            </p>
          </div>
          <a
            href="/video-hub"
            className="landing-btn landing-btn-ghost hidden shrink-0 sm:inline-flex"
          >
            {t("videos.openHub")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        {/* One column on phones (full-width thumbnail), two from sm, four from lg. */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {VIDEOS.map((v, i) => (
            <a
              key={v.title}
              href="/video-hub"
              className="landing-card landing-lift group overflow-hidden"
            >
              <div className="relative aspect-video overflow-hidden bg-sand">
                <img
                  src={v.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 grid place-items-center bg-forest-dark/30 transition group-hover:bg-forest-dark/45">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 text-forest shadow-card">
                    <Play className="h-4 w-4 translate-x-[1px] fill-forest" />
                  </span>
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-forest-dark/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {v.duration}
                </span>
              </div>
              <p className="p-3.5 text-[13.5px] font-semibold leading-snug text-forest">
                {t(TITLE_KEYS[i] ?? "videos.v1")}
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
