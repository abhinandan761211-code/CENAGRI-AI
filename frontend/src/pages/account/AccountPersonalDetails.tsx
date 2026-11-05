import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import PersonalDetailsForm from "@/components/account/PersonalDetailsForm";
import RetailerLayout from "@/components/retailer/RetailerLayout";
import WorkerLayout from "@/components/worker/WorkerLayout";
import TransporterLayout from "@/components/transporter/TransporterLayout";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import EmployerLayout from "@/components/employer/EmployerLayout";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Personal details for every account except the farmer.
 *
 * `/account/personal` used to be farmer-only: the page rendered `<FarmerShell>`
 * unconditionally and only the farmer's sidebar listed it. Buyer, retailer,
 * worker, transporter, warehouse, equipment owner and employer therefore had no
 * way to change their own name, phone or address after onboarding.
 *
 * This route renders the exact same `PersonalDetailsForm` — same save path, same
 * `profiles` / `profiles.details` writes — but inside the shell of the signed-in
 * account, so a buyer edits details inside the buyer dashboard and a warehouse
 * owner inside the warehouse layout.
 *
 * Farmers are bounced to `/account/personal`, which already renders the form in
 * `<FarmerShell>`. A pure Content Creator has no AccountShell; the farmer route
 * works for them too because the form only touches the shared profile row.
 */

type Frame = (page: ReactNode) => ReactNode;

/**
 * Each entry wraps the form in that module's own layout. These layouts own the
 * sidebar navigation, so the user stays inside the account they are editing.
 */
/**
 * One factory for all six layouts: only the component and its props differ, and
 * the heading/subtitle are translated once here rather than six times.
 */
function shells(title: string, subtitle: string): Record<string, Frame> {
  return {
    Retailer: (page) => (
      <RetailerLayout title={title} subtitle={subtitle}>
        {page}
      </RetailerLayout>
    ),
    Worker: (page) => (
      <WorkerLayout title={title} subtitle={subtitle}>
        {page}
      </WorkerLayout>
    ),
    Transporter: (page) => (
      <TransporterLayout title={title} subtitle={subtitle}>
        {page}
      </TransporterLayout>
    ),
    Warehouse: (page) => (
      <WarehouseLayout title={title} subtitle={subtitle}>
        {page}
      </WarehouseLayout>
    ),
    Equipment: (page) => (
      <EquipmentLayout title={title} subtitle={subtitle}>
        {page}
      </EquipmentLayout>
    ),
    Employer: (page) => (
      <EmployerLayout title={title} subtitle={subtitle}>
        {page}
      </EmployerLayout>
    ),
  };
}

export default function AccountPersonalDetails() {
  const { profile, loading } = useAuth();
  const { t } = useLang();
  const role = profile?.role ?? "";

  // Wait for the profile row before choosing a shell — otherwise a slow load
  // would flash the wrong account's sidebar.
  if (loading) {
    return <p className="py-16 text-center text-sm text-slate-500">{t("acc.loading")}</p>;
  }

  // The farmer already has this page, and Shop is the old label for Retailer.
  if (role === "Farmer" || role === "Content Creator" || !role) {
    return <Navigate to="/account/personal" replace />;
  }

  const shell = shells(t("acc.personal.title"), t("acc.personal.subtitle"))[
    role === "Shop" ? "Retailer" : role
  ];

  // Buyer has no module layout of its own — its dashboard builds AccountShell
  // inline — so the form renders in a plain surface rather than a second shell.
  //
  // The layout already prints the page title from its own `title` prop, so the
  // form's heading is left empty to avoid two "Personal Information" headings.
  return (
    <PersonalDetailsForm
      frame={shell ?? ((page) => page)}
      hideHeader={Boolean(shell) || Boolean(role)}
    />
  );
}
