const STEPS = [
  {
    step: "01",
    title: "Create your profile",
    body: "Pick your role, your block and your crops. Takes under two minutes, works on any phone.",
  },
  {
    step: "02",
    title: "Get your daily brief",
    body: "Weather, pest risk, irrigation advice and today's market rate — delivered in Bengali every morning.",
  },
  {
    step: "03",
    title: "Act with confidence",
    body: "Ask the AI in your own words, compare buyers, book equipment or a truck, and track results.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-slate-200 bg-white py-16 lg:py-20">
      <div className="container-x">
        <div className="max-w-2xl">
          <span className="eyebrow">How it works</span>
          <h2 className="section-title mt-2">Three steps from field to decision</h2>
          <p className="mt-3 text-slate-600">
            No training required. If you can send a WhatsApp message, you can use CenAGRI-AI.
          </p>
        </div>

        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.step} className="relative rounded-xl2 border border-slate-200 bg-cream/60 p-6">
              <span className="font-display text-3xl font-extrabold text-brand-200">
                {s.step}
              </span>
              <h3 className="mt-3 font-display text-lg font-bold text-forest">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
