import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  Boxes,
  CalendarCheck,
  ChartNoAxesCombined,
  Clapperboard,
  ClipboardCheck,
  FileText,
  IndianRupee,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  PackageCheck,
  PackageMinus,
  PercentCircle,
  Settings2,
  Store,
  Tag,
  Thermometer,
  Truck,
  UserRound,
  Users,
  Video,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import AccountShell from "@/components/account/AccountShell";
import type { SearchEntry, ShellNavItem, ShellNotification } from "@/components/account/AccountShell";
import { useAuth } from "@/hooks/useAuth";
import { listNotifications } from "@/lib/warehouse";

/** Every warehouse screen lives under this prefix. */
export const WAREHOUSE_BASE = "/warehouse";

export type WarehouseNavKey =
  | "home"
  | "warehouses"
  | "requests"
  | "bookings"
  | "inventory"
  | "inward"
  | "outward"
  | "monitoring"
  | "inspections"
  | "pricing"
  | "customers"
  | "staff"
  | "transport"
  | "earnings"
  | "documents"
  | "reports"
  | "messages"
  | "profile"
  | "hub"
  | "creator"
  | "settings";

export const WAREHOUSE_ROUTES: Record<Exclude<WarehouseNavKey, "hub" | "creator">, string> = {
  home: WAREHOUSE_BASE,
  warehouses: `${WAREHOUSE_BASE}/warehouses`,
  requests: `${WAREHOUSE_BASE}/requests`,
  bookings: `${WAREHOUSE_BASE}/bookings`,
  inventory: `${WAREHOUSE_BASE}/inventory`,
  inward: `${WAREHOUSE_BASE}/inward`,
  outward: `${WAREHOUSE_BASE}/outward`,
  monitoring: `${WAREHOUSE_BASE}/monitoring`,
  inspections: `${WAREHOUSE_BASE}/inspections`,
  pricing: `${WAREHOUSE_BASE}/pricing`,
  customers: `${WAREHOUSE_BASE}/customers`,
  staff: `${WAREHOUSE_BASE}/staff`,
  transport: `${WAREHOUSE_BASE}/transport`,
  earnings: `${WAREHOUSE_BASE}/earnings`,
  documents: `${WAREHOUSE_BASE}/documents`,
  reports: `${WAREHOUSE_BASE}/reports`,
  messages: `${WAREHOUSE_BASE}/messages`,
  profile: `${WAREHOUSE_BASE}/profile`,
  settings: `${WAREHOUSE_BASE}/settings`,
};

/** Sub-pages of "My Warehouses", so the detail route still lights the nav. */
export const WAREHOUSE_DETAIL_ROUTE = `${WAREHOUSE_BASE}/warehouses/:id`;
export const warehouseDetailPath = (id: string) => `${WAREHOUSE_ROUTES.warehouses}/${id}`;

const NAV: { key: WarehouseNavKey; label: string; tkey: string; icon: ShellNavItem["icon"] }[] = [
  { key: "home", label: "Overview", tkey: "s.overview", icon: LayoutDashboard },
  { key: "warehouses", label: "My Warehouses", tkey: "s.warehouses", icon: WarehouseIcon },
  { key: "requests", label: "Storage Requests", tkey: "s.storageRequests", icon: Inbox },
  { key: "bookings", label: "Bookings & Reservations", tkey: "s.reservations", icon: CalendarCheck },
  { key: "inventory", label: "Inventory Management", tkey: "s.inventoryManagement", icon: Boxes },
  { key: "inward", label: "Goods Inward", tkey: "s.goodsInward", icon: PackageCheck },
  { key: "outward", label: "Goods Outward", tkey: "s.goodsOutward", icon: PackageMinus },
  { key: "monitoring", label: "Storage Monitoring", tkey: "s.monitoring", icon: Thermometer },
  { key: "inspections", label: "Quality Inspection", tkey: "s.inspection", icon: ClipboardCheck },
  { key: "pricing", label: "Pricing & Storage Plans", tkey: "s.pricing", icon: Tag },
  { key: "customers", label: "Customer Management", tkey: "s.customers", icon: Users },
  { key: "staff", label: "Staff Management", tkey: "s.staff", icon: PercentCircle },
  { key: "transport", label: "Transport Coordination", tkey: "s.transport", icon: Truck },
  { key: "earnings", label: "Earnings & Payments", icon: IndianRupee, tkey: "Earnings & Payments" },
  { key: "documents", label: "Invoices & Documents", tkey: "s.invoices", icon: FileText },
  { key: "reports", label: "Reports & Analytics", tkey: "s.reports", icon: ChartNoAxesCombined },
  { key: "messages", label: "Messages", tkey: "s.messages", icon: MessageSquare },
  /* Watching is open to every account; publishing is the separate studio entry. */
  { key: "hub", label: "Kisan Video Hub", tkey: "s.videoHub", icon: Video },
  { key: "creator", label: "Creator Studio", tkey: "s.creatorStudio", icon: Clapperboard },
  { key: "profile", label: "My Profile", tkey: "s.profile", icon: Store },
  { key: "settings", label: "Settings", icon: Settings2, tkey: "Settings" },
];

/** "hub" and "creator" live outside /warehouse, so they resolve here. */
const NAV_HREF: Partial<Record<WarehouseNavKey, string>> = {
  hub: "/video-hub",
  creator: "/creator-mode",
};

const KIND_ICON = {
  request: Inbox,
  quotation: FileText,
  booking: CalendarCheck,
  inward: PackageCheck,
  outward: PackageMinus,
  payment: IndianRupee,
  inspection: ClipboardCheck,
  environment: Thermometer,
  dispute: Bell,
  system: Bell,
} as const;

const SEARCH: SearchEntry[] = [
  { label: "My warehouses", keywords: "godown storage capacity location add edit", section: "Warehouses", to: WAREHOUSE_ROUTES.warehouses },
  { label: "Storage requests", keywords: "request crop requisition quote farmer depositor", section: "Bookings", to: WAREHOUSE_ROUTES.requests },
  { label: "Bookings", keywords: "booking reservation confirmed reserved allot", section: "Bookings", to: WAREHOUSE_ROUTES.bookings },
  { label: "Inventory", tkey: "s.inventory", keywords: "stock lot crop bags inventory stored goods", section: "Operations", to: WAREHOUSE_ROUTES.inventory },
  { label: "Goods inward", keywords: "inward grn receive receipt delivery gate entry", section: "Operations", to: WAREHOUSE_ROUTES.inward },
  { label: "Goods outward", keywords: "outward dispatch release gate pass delivery", section: "Operations", to: WAREHOUSE_ROUTES.outward },
  { label: "Storage monitoring", keywords: "temperature humidity moisture pest fumigation reading", section: "Operations", to: WAREHOUSE_ROUTES.monitoring },
  { label: "Quality inspection", keywords: "inspection grade damage rejected quality", section: "Operations", to: WAREHOUSE_ROUTES.inspections },
  { label: "Pricing", keywords: "rate plan per quintal month charge cold premium", section: "Business", to: WAREHOUSE_ROUTES.pricing },
  { label: "Customers", keywords: "depositor farmer buyer retailer trader contact", section: "Business", to: WAREHOUSE_ROUTES.customers },
  { label: "Staff", keywords: "staff operator permissions inward outward role", section: "Business", to: WAREHOUSE_ROUTES.staff },
  { label: "Transport", keywords: "vehicle truck transporter pickup dispatch request", section: "Business", to: WAREHOUSE_ROUTES.transport },
  { label: "Earnings", tkey: "s.earnings", keywords: "revenue payment invoice money pending paid", section: "Money", to: WAREHOUSE_ROUTES.earnings },
  { label: "Reports", keywords: "analytics export csv occupancy revenue report", section: "Money", to: WAREHOUSE_ROUTES.reports },
];

/**
 * Chrome for every warehouse screen.
 *
 * Uses the shared `AccountShell` — the same hover-rail sidebar, header search,
 * bell and profile menu as the farmer, buyer, retailer, worker and transporter
 * accounts. Only the navigation and the page content differ, which is what the
 * project's design system requires.
 *
 * No role gate: what makes an account a warehouse owner is that it owns a
 * `warehouses` row, and RLS scopes every query to `auth.uid()`. A farmer who
 * also runs a godown can therefore open this module without touching the farmer
 * dashboard.
 */
export default function WarehouseLayout({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const rows = await listNotifications();
      setUnread(rows.filter((n) => !n.read_at).length);
      setNotifications(
        rows.slice(0, 5).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body ?? "",
          icon: KIND_ICON[n.kind] ?? Bell,
          to: n.link ?? WAREHOUSE_ROUTES.home,
        }))
      );
    } catch {
      // A missing table must not break navigation; the pages show the error.
      setUnread(0);
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    if (user) void loadNotifications();
  }, [user, loadNotifications, pathname]);

  if (needsRole || needsDetails) {
    return <Navigate to="/complete-profile?next=/warehouse" replace />;
  }

  const name =
    profile?.details?.warehouse_name ||
    profile?.details?.business_name ||
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Warehouse Owner";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  // Longest prefix wins, so /warehouse/warehouses/abc lights up "warehouses".
  const activeKey: WarehouseNavKey =
    (Object.entries(WAREHOUSE_ROUTES)
      .filter(([, path]) => pathname === path || pathname.startsWith(`${path}/`))
      .sort((a, b) => b[1].length - a[1].length)[0]?.[0] as WarehouseNavKey | undefined) ?? "home";

  const nav: ShellNavItem[] = NAV.map(({ key, label, tkey, icon }) => ({
    label,
    tkey,
    icon,
    badge: key === "home" && unread > 0 ? unread : undefined,
    active: key === activeKey,
    to: NAV_HREF[key] ?? WAREHOUSE_ROUTES[key as Exclude<WarehouseNavKey, "hub" | "creator">],
  }));

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AccountShell
      nav={nav}
      search={SEARCH}
      searchPlaceholder="Search warehouses, bookings, lots…"
      notifications={notifications}
      displayName={name}
      initials={initials}
      avatarUrl={profile?.avatar_url}
      // The settings page only shows notifications and a read-only account
      // card, so point the profile menu at the shared details editor instead.
      settingsTo="/account/details"
      helpCard={{
        title: "Warehouse Support",
        body: "Booking, GRN, cold-chain aur payment help — Hindi, Bengali aur English mein.",
        phone: "1800-000-000",
      }}
      onSignOut={() => void handleSignOut()}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle ?? `${name} · storage operations`}</p>
        </div>
        {action}
      </div>
      {children}
    </AccountShell>
  );
}
