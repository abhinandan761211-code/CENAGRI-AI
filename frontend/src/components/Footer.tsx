import Logo from "./Logo";

const COLUMNS = [
  {
    title: "Product",
    links: ["AI Advisory", "Market Prices", "Buyer Connect", "Equipment Rental", "Logistics"],
  },
  {
    title: "Company",
    links: ["About us", "Careers", "Press", "Partners", "Contact"],
  },
  {
    title: "Resources",
    links: ["Help centre", "Video guides", "Farmer stories", "API docs", "Status"],
  },
  {
    title: "Legal",
    links: ["Privacy policy", "Terms of use", "Data policy", "Grievance officer"],
  },
];

export default function Footer() {
  return (
    <footer className="bg-forest-dark text-brand-100">
      <div className="container-x py-12">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2.6fr]">
          <div>
            <Logo variant="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-200/80">
              AI-powered agriculture platform for Bengal — advisory, prices, buyers and
              logistics in one place.
            </p>
            <p className="mt-5 text-xs text-brand-200/60">
              Supporting SDG 1, 2 and 8 across rural India.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                  {col.title}
                </h3>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a
                        href="#"
                        className="text-[13px] text-brand-200/80 transition hover:text-white"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-brand-200/60">
            © {new Date().getFullYear()} CenAGRI-AI. All rights reserved.
          </p>
          <p className="text-xs text-brand-200/60">
            Made for farmers, with farmers.
          </p>
        </div>
      </div>
    </footer>
  );
}
