import { useMemo } from "react";
import { CalendarDays, IndianRupee, Tractor, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import EquipmentLayout, { EQUIPMENT_ROUTES, equipmentEditPath } from "@/components/equipment/EquipmentLayout";
import { EquipmentStatusPill, SectionHeading } from "@/components/equipment/ui";
import { ErrorNotice, Loading, Panel } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  dashboardTotals,
  describeEquipmentError,
  formatDate,
  formatINR,
  listBookings,
  listEquipment,
  listInvoices,
  listOpenRequests,
  nextServiceLabel,
} from "@/lib/equipment";
import type {
  Equipment,
  EquipmentBooking,
  EquipmentInvoice,
  RentalRequest,
} from "@/lib/equipment";

/**
 * Equipment owner profile.
 *
 * The account itself (name, email, avatar) lives in the shared `profiles` table
 * and is edited by the shared profile flow. This page summarises the rental
 * business and links to the per-machine records for the detail.
 */
export default function EquipmentProfile() {
  const { profile, user } = useAuth();
  const D = describeEquipmentError;

  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);
  const requests = useWorkerData<RentalRequest[]>(() => listOpenRequests({}), [], D);
  const invoices = useWorkerData<EquipmentInvoice[]>(() => listInvoices(), [], D);

  const equipmentList = equipment.data ?? [];
  const bookingList = bookings.data ?? [];
  const requestList = requests.data ?? [];
  const invoiceList = invoices.data ?? [];

  const totals = useMemo(
    () =>
      dashboardTotals({
        equipment: equipmentList,
        bookings: bookingList,
        requests: requestList,
        invoices: invoiceList,
      }),
    [equipmentList, bookingList, requestList, invoiceList]
  );

  const displayName =
    profile?.details?.business_name ||
    profile?.details?.shop_name ||
    profile?.full_name ||
    user?.email?.split("@")[0] ||
    "Equipment Owner";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const districts = [
    ...new Set(equipmentList.map((e) => e.district).filter(Boolean) as string[]),
  ];

  const serviceDueCount = equipmentList.filter((e) => {
    const s = nextServiceLabel(e.next_service_on);
    return s.overdue || (s.days != null && s.days <= 30);
  }).length;

  if (equipment.state === "loading") {
    return (
      <EquipmentLayout title="My Profile">
        <Loading label="Loading profile…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout title="My Profile" subtitle="Your rental business at a glance">
      {equipment.state === "error" && <ErrorNotice message={equipment.error} onRetry={equipment.reload} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Business" description="Account details from your CenAGRI profile">
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-100 text-[16px] font-extrabold text-brand-800">
                {initials || "EQ"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold text-forest">{displayName}</p>
                <p className="truncate text-[11px] text-slate-500">{profile?.email ?? user?.email ?? "—"}</p>
                <p className="text-[11px] text-slate-500">{profile?.phone ?? "No phone on file"}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {equipmentList.length} machine(s)
              </span>
              {districts.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {districts.slice(0, 3).join(", ")}
                </span>
              )}
            </div>

            <Link
              to={EQUIPMENT_ROUTES.settings}
              className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Account settings
            </Link>
          </div>
        </Panel>

        <Panel title="Rental business" description="Derived from your live records" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
            <Stat icon={Tractor} label="Machines" value={String(totals.total)} />
            <Stat icon={CalendarDays} label="Active rentals" value={String(totals.activeBookings)} />
            <Stat icon={IndianRupee} label="Paid earnings" value={formatINR(totals.earnings)} />
            <Stat
              icon={Wrench}
              label="Service due"
              value={String(serviceDueCount)}
              tone={serviceDueCount > 0 ? "warn" : undefined}
            />
          </dl>
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-[11px] leading-relaxed text-slate-600">
              These figures are calculated from your machines, bookings and invoices — they are not inputs,
              so they cannot drift from what actually happened.
            </p>
          </div>
        </Panel>
      </div>

      <section>
        <SectionHeading title="My machines" />
        <Panel title="Fleet" description="Each machine has its own record">
          {equipmentList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">No equipment registered.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {equipmentList.map((e) => {
                const service = nextServiceLabel(e.next_service_on);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={equipmentEditPath(e.id)}
                        className="truncate text-[12px] font-semibold text-forest hover:underline"
                      >
                        {e.title}
                      </Link>
                      <p className="text-[10.5px] text-slate-500">
                        {e.category ?? "Uncategorised"} · since {formatDate(e.created_at)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold ${
                        service.overdue ? "text-rose-700" : service.days != null && service.days <= 30 ? "text-amber-700" : "text-slate-400"
                      }`}
                    >
                      {service.label}
                    </span>
                    <EquipmentStatusPill status={e.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      <Panel title="Where to edit what" description="Kept deliberately separate">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>
            • <strong>Name, email, phone, avatar</strong> — shared account profile, used by every account
            type.
          </li>
          <li>
            • <strong>Machine details and pricing</strong> — My Equipment → Edit.
          </li>
          <li>
            • <strong>Operators</strong> — Operator Management.
          </li>
          <li>
            • <strong>Documents and verification</strong> — Documents & Verification.
          </li>
        </ul>
      </Panel>
    </EquipmentLayout>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Tractor;
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className={`mt-0.5 truncate text-[14px] font-extrabold ${tone === "warn" ? "text-amber-700" : "text-forest"}`}>
        {value}
      </dd>
    </div>
  );
}
