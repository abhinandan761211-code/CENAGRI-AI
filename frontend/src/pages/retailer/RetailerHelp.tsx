import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  ChartNoAxesCombined,
  IndianRupee,
  Mail,
  MessageSquare,
  Package,
  Phone,
  ShoppingCart,
  Sprout,
  Store,
  Warehouse,
} from "lucide-react";
import { Link } from "react-router-dom";
import RetailerLayout, { RETAILER_ROUTES } from "@/components/retailer/RetailerLayout";
import { Panel } from "@/components/retailer/ui";
import { useLang } from "@/i18n/LanguageContext";

const GUIDES: { icon: LucideIcon; title: string; body: string; to: string; cta: string }[] = [
  {
    icon: Store,
    title: "r.h.g1Title",
    body: "r.h.g1Body",
    to: RETAILER_ROUTES.shop,
    cta: "r.h.openShop",
  },
  {
    icon: Package,
    title: "r.h.g2Title",
    body: "r.h.g2Body",
    to: RETAILER_ROUTES.products,
    cta: "r.h.addProduct",
  },
  {
    icon: ShoppingCart,
    title: "r.h.g3Title",
    body: "r.h.g3Body",
    to: RETAILER_ROUTES.orders,
    cta: "r.h.openOrders",
  },
  {
    icon: Warehouse,
    title: "r.h.g4Title",
    body: "r.h.g4Body",
    to: RETAILER_ROUTES.inventory,
    cta: "r.h.openInventory",
  },
  {
    icon: ChartNoAxesCombined,
    title: "r.h.g5Title",
    body: "r.h.g5Body",
    to: RETAILER_ROUTES.analytics,
    cta: "r.h.openAnalytics",
  },
  {
    icon: Sprout,
    title: "r.h.g6Title",
    body: "r.h.g6Body",
    to: RETAILER_ROUTES.buy,
    cta: "r.h.buyFarmers",
  },
];

/**
 * Help & Support — short in-app guides plus contact details.
 *
 * Kept as static content: it is documentation, not a data feature, so it does
 * not depend on Supabase being set up.
 */
export default function RetailerHelp() {
  const { t } = useLang();
  return (
    <RetailerLayout title={t("r.h.title")} subtitle={t("r.h.subtitle")}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Panel title={t("r.h.quickGuides")} description={t("r.h.everything")}>
            <ul className="divide-y divide-slate-100">
              {GUIDES.map(({ icon: Icon, title, body, to, cta }) => (
                <li key={title} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-forest">{t(title as never)}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t(body as never)}</p>
                  </div>
                  <Link
                    to={to}
                    className="mt-0.5 shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    {t(cta as never)}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t("r.h.expiryWhy")} description={t("r.h.compliance")}>
            <div className="space-y-2 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
              <p className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
                An expired fertiliser or pesticide must never reach a farmer's field — it can fail
                to work, or worse, damage the crop.
              </p>
              <p className="flex items-start gap-2">
                <IndianRupee className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Batches within 30 days are marked <strong>critical</strong>, within 90 days{" "}
                <strong>soon</strong>, and expired stock is flagged in red on the inventory screen.
              </p>
              <p className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                A notification is raised automatically when a batch enters its 30-day window.
              </p>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={t("r.h.contactKalika")}>
            <div className="space-y-3 p-4 sm:p-5">
              <a
                href="mailto:support@kalika.example"
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Mail className="h-4 w-4 text-slate-400" />
                support@kalika.example
              </a>
              <a
                href="tel:+919000000000"
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Phone className="h-4 w-4 text-slate-400" />
                +91 90000 00000
              </a>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Support hours: Monday–Saturday, 10 AM – 6 PM IST. Verification requests are usually
                reviewed within 2 working days.
              </p>
            </div>
          </Panel>

          <Panel title={t("r.h.accountTypes")}>
            <div className="space-y-2 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
              <p>
                <strong className="text-forest">Retailer</strong> — sells agricultural inputs and
                manages stock. This dashboard.
              </p>
              <p>
                <strong className="text-forest">Buyer</strong> — sources produce from farmers.
              </p>
              <p className="text-slate-400">
                Direct farmer procurement works for both, but the two accounts keep separate orders,
                stock and reporting.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </RetailerLayout>
  );
}
