import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useLang } from "@/i18n/LanguageContext";

/**
 * FAQ.
 *
 * Every answer below describes something that actually exists in the codebase —
 * the marketplace, the transport and equipment modules,
 * the warehouse bookings, the video hub. Where a capability does not exist yet
 * (image-based disease detection, live GPS tracking) the answer says so instead
 * of promising it.
 */
const FAQS = [
  {
    q: "What is Kalika?",
    a: "A connected agriculture platform. One account gives a farmer, buyer, retailer, worker, transporter, equipment owner, warehouse owner or content creator the tools for their part of the agricultural chain — crop advisory, mandi prices, weather, marketplace, logistics, storage and video learning.",
  },
  {
    q: "Who can register?",
    a: "Anyone in the agricultural chain can create an account and pick a role at signup. The eight roles are farmer, buyer, retailer, worker, transporter, equipment owner, warehouse owner and content creator. You can start free as a farmer.",
  },
  {
    q: "What services are available?",
    a: "Crop advisory, weather alerts, mandi prices, a produce marketplace, the CenFriend community, equipment rental, transport booking, warehouse and cold-storage booking, and the Kisan Video Hub. Each is its own module inside your dashboard.",
  },

  {
    q: "Can it identify a crop disease from a photo?",
    a: "Not yet. Photo-based disease detection is not implemented, so this page does not offer it. You can still describe symptoms and get advisory guidance. We will add image analysis when it genuinely works.",
  },
  {
    q: "How does a buyer connect with a farmer?",
    a: "Through the marketplace. A farmer lists produce with quantity and grade; buyers browse listings and place orders. Both sides see the same order record, and payment is confirmed by the platform rather than typed in by either party.",
  },
  {
    q: "How do I rent agricultural machinery?",
    a: "Create an equipment-owner account to list tractors, harvesters, seeders, sprayers or drones with a price and working area. Renters search by category and district, request specific dates, and the owner accepts — the system refuses two bookings that overlap those dates.",
  },
  {
    q: "How do I find transportation?",
    a: "Post a transport request with pickup, drop-off and load. Registered transporters see it, send quotes, and you accept one. The trip then has a status you can follow, and delivery proof is recorded when the goods are handed over.",
  },
  {
    q: "How do I book warehouse storage?",
    a: "Warehouse owners list facilities with capacity and rates. You send a storage request, receive a quotation with the full cost breakdown, and accept it. Capacity is reserved at that point — you cannot be overbooked into a full godown.",
  },
  {
    q: "Is Kisan Video Hub free to watch?",
    a: "Yes. Browsing and watching on the Kisan Video Hub is open to every signed-in account. Creating and publishing videos is available to content-creator accounts.",
  },
  {
    q: "Is my data and location shared anywhere?",
    a: "Each account sees only its own records — the database enforces this per user, not just the screens. Location sharing for live tracking is opt-in per trip, is off by default, and nothing is collected outside an active job.",
  },
];

const FAQ_KEYS = [
  ["faq.q1", "faq.a1"],
  ["faq.q2", "faq.a2"],
  ["faq.q3", "faq.a3"],
  ["faq.q5", "faq.a5"],
  ["faq.q6", "faq.a6"],
  ["faq.q7", "faq.a7"],
  ["faq.q8", "faq.a8"],
  ["faq.q9", "faq.a9"],
  ["faq.q10", "faq.a10"],
  ["faq.q11", "faq.a11"],
] as const;

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { t } = useLang();

  return (
    <section id="faq" className="bg-cream py-14 sm:py-16 lg:py-20">
      <div className="container-x">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <div className="max-w-xl">
            <span className="landing-eyebrow">{t("faq.eyebrow")}</span>
            <h2 className="landing-h2 mt-3">{t("faq.title")}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
              {t("faq.body")}
            </p>
            <Link
              to="/signup"
              className="landing-btn landing-btn-ghost mt-5 hidden sm:inline-flex"
            >
              {t("faq.cta")}
            </Link>
          </div>

          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {FAQ_KEYS.map(([qk, ak], index) => {
              const open = openIndex === index;
              return (
                <li key={qk}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(open ? null : index)}
                      aria-expanded={open}
                      aria-controls={`faq-panel-${index}`}
                      id={`faq-button-${index}`}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
                    >
                      <span className="text-[13.5px] font-semibold text-forest sm:text-sm">
                        {t(qk)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""
                          }`}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                  <div
                    id={`faq-panel-${index}`}
                    role="region"
                    aria-labelledby={`faq-button-${index}`}
                    hidden={!open}
                    className="px-4 pb-4 sm:px-5"
                  >
                    <p className="text-[12.5px] leading-relaxed text-slate-600 sm:text-[13px]">
                      {t(ak)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
