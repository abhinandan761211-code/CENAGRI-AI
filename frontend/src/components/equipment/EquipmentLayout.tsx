import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  Clapperboard,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardList,
  FileCheck2,
  FileText,
  IndianRupee,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  PlusCircle,
  Settings2,
  Star,
  Tractor,
  Video,
  UserCog,
  UserRound,
  Wrench,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import AccountShell from "@/components/account/AccountShell";
import type { SearchEntry, ShellNavItem, ShellNotification } from "@/components/account/AccountShell";
import { useAuth } from "@/hooks/useAuth";
import { listNotifications } from "@/lib/equipment";

/**
 * Every equipment screen lives under this prefix.
 *
 * Not `/equipment` — that path is the farmer-facing "find a machine" page.
 * Two routes sharing a path would silently shadow each other.
 */
export const EQUIPMENT_BASE = "/equipment-owner";

export type EquipmentNavKey =
  | "home"
  | "equipment"
  | "add"
  | "requests"
  | "bookings"
  | "calendar"
  | "operators"
  | "maintenance"
  | "availability"
  | "location"
  | "earnings"
  | "agreements"
  | "documents"
  | "reviews"
  | "messages"
  | "profile"
  | "hub"
  | "creator"
  | "settings";

export const EQUIPMENT_ROUTES: Record<Exclude<EquipmentNavKey, "hub" | "creator">, string> = {
  home: EQUIPMENT_BASE,
  equipment: `${EQUIPMENT_BASE}/equipment`,
  add: `${EQUIPMENT_BASE}/equipment/new`,
  requests: `${EQUIPMENT_BASE}/requests`,
  bookings: `${EQUIPMENT_BASE}/bookings`,
  calendar: `${EQUIPMENT_BASE}/calendar`,
  operators: `${EQUIPMENT_BASE}/operators`,
  maintenance: `${EQUIPMENT_BASE}/maintenance`,
  availability: `${EQUIPMENT_BASE}/availability`,
  location: `${EQUIPMENT_BASE}/location`,
  earnings: `${EQUIPMENT_BASE}/earnings`,
  agreements: `${EQUIPMENT_BASE}/agreements`,
  documents: `${EQUIPMENT_BASE}/documents`,
  reviews: `${EQUIPMENT_BASE}/reviews`,
  messages: `${EQUIPMENT_BASE}/messages`,
  profile: `${EQUIPMENT_BASE}/profile`,
  settings: `${EQUIPMENT_BASE}/settings`,
};

export const equipmentEditPath = (id: string) => `${EQUIPMENT_ROUTES.equipment}/${id}`;

/**
 * "Add equipment" and "edit equipment" share the `/equipment/equipment/*`
 * prefix, so the nav highlights `equipment` for both. `add` is a shortcut that
 * lands on the form with no id.
 */
const NAV: { key: EquipmentNavKey; label: string; tkey: string; icon: ShellNavItem["icon"] }[] = [
  { key: "home", label: "Overview", tkey: "s.overview", icon: LayoutDashboard },
  { key: "equipment", label: "My Equipment", tkey: "s.equipment", icon: Tractor },
  { key: "add", label: "Add Equipment", tkey: "s.addEquipment", icon: PlusCircle },
  { key: "requests", label: "Rental Requests", tkey: "s.rentalRequests", icon: ClipboardList },
  { key: "bookings", label: "Bookings & Rentals", tkey: "s.rentals", icon: CalendarDays },
  { key: "calendar", label: "Equipment Calendar", tkey: "s.equipmentCalendar", icon: CalendarRange },
  { key: "operators", label: "Operator Management", tkey: "s.operators", icon: UserCog },
  { key: "maintenance", label: "Equipment Maintenance", tkey: "s.maintenance", icon: Wrench },
  { key: "availability", label: "Equipment Availability", tkey: "s.equipmentAvailability", icon: ChartNoAxesCombined },
  { key: "location", label: "Equipment Location", tkey: "s.location", icon: MapPin },
  { key: "earnings", label: "Earnings & Payments", icon: IndianRupee, tkey: "Earnings & Payments" },
  { key: "agreements", label: "Rental Agreements", tkey: "s.agreements", icon: FileText },
  { key: "documents", label: "Documents & Verification", tkey: "s.documents", icon: FileCheck2 },
  { key: "reviews", label: "Reviews & Ratings", icon: Star, tkey: "Reviews & Ratings" },
  { key: "messages", label: "Messages", tkey: "s.messages", icon: MessageSquare },
  /* Watching is open to every account; publishing is the separate studio entry. */
  { key: "hub", label: "Kisan Video Hub", tkey: "s.videoHub", icon: Video },
  { key: "creator", label: "Creator Studio", tkey: "s.creatorStudio", icon: Clapperboard },
  { key: "profile", label: "My Profile", tkey: "s.profile", icon: UserRound },
  { key: "settings", label: "Settings", icon: Settings2, tkey: "Settings" },
];

/** "hub" and "creator" live outside /equipment-owner, so they resolve here. */
const NAV_HREF: Partial<Record<EquipmentNavKey, string>> = {
  hub: "/video-hub",
  creator: "/creator-mode",
};

const KIND_ICON = {
  request: ClipboardList,
  quotation: FileText,
  booking: CalendarDays,
  operator: UserCog,
  reminder: Bell,
  maintenance: Wrench,
  payment: IndianRupee,
  review: Star,
  system: Bell,
} as const;

const SEARCH: SearchEntry[] = [
  { label: "My equipment", keywords: "tractor harvester machine add edit list", section: "Equipment", to: EQUIPMENT_ROUTES.equipment },
  { label: "Add equipment", keywords: "register new machine create", section: "Equipment", to: EQUIPMENT_ROUTES.add },
  { label: "Rental requests", keywords: "request farmer job quote rent enquiry", section: "Work", to: EQUIPMENT_ROUTES.requests },
  { label: "Bookings", keywords: "booking rental confirmed scheduled job", section: "Work", to: EQUIPMENT_ROUTES.bookings },
  { label: "Calendar", tkey: "s.calendar", keywords: "calendar slots dates availability booked", section: "Work", to: EQUIPMENT_ROUTES.calendar },
  { label: "Operators", keywords: "driver operator assign licence staff", section: "Work", to: EQUIPMENT_ROUTES.operators },
  { label: "Maintenance", keywords: "service repair breakdown parts spare", section: "Fleet", to: EQUIPMENT_ROUTES.maintenance },
  { label: "Availability", keywords: "available schedule block unavailable", section: "Fleet", to: EQUIPMENT_ROUTES.availability },
  { label: "Location", keywords: "location service area district village radius", section: "Fleet", to: EQUIPMENT_ROUTES.location },
  { label: "Earnings", tkey: "s.earnings", keywords: "revenue payment invoice money profit", section: "Money", to: EQUIPMENT_ROUTES.earnings },
  { label: "Agreements", keywords: "agreement contract terms rental", section: "Money", to: EQUIPMENT_ROUTES.agreements },
  { label: "Reviews", tkey: "s.reviews", keywords: "rating feedback stars customer", section: "Account", to: EQUIPMENT_ROUTES.reviews },
  { label: "Kisan Video Hub", tkey: "s.videoHub", keywords: "video watch learn tutorial shorts machine training", section: "Learn", to: "/video-hub" },
];

/**
 * Chrome for every equipment screen.
 *
 * Uses the shared `AccountShell` — same hover-rail sidebar, header search, bell
 * and profile menu as the farmer, buyer, retailer, worker, transporter and
 * warehouse accounts. Only the navigation and page content differ.
 *
 * No role gate: what makes an account an equipment owner is that it owns an
 * `equipment` row, and RLS scopes every query to `auth.uid()`. A farmer who also
 * rents out a tractor can open this module untouched.
 */
export default function EquipmentLayout({
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
          to: n.link ?? EQUIPMENT_ROUTES.home,
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
    return <Navigate to="/complete-profile?next=/equipment-owner" replace />;
  }

  const name =
    profile?.details?.business_name ||
    profile?.details?.shop_name ||
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Equipment Owner";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  // Longest prefix wins; `/equipment/equipment/new` maps to `add`.
  const match =
    Object.entries(EQUIPMENT_ROUTES)
      .filter(([, path]) => pathname === path || pathname.startsWith(`${path}/`))
      .sort((a, b) => b[1].length - a[1].length)[0]?.[0] ??
    (pathname.endsWith("/new") && pathname.startsWith(EQUIPMENT_ROUTES.equipment)
      ? "add"
      : "home");
  const activeKey = match as EquipmentNavKey;

  const nav: ShellNavItem[] = NAV.map(({ key, label, tkey, icon }) => ({
    label,
    tkey,
    icon,
    badge: key === "home" && unread > 0 ? unread : undefined,
    active: key === activeKey,
    to: NAV_HREF[key] ?? EQUIPMENT_ROUTES[key as Exclude<EquipmentNavKey, "hub" | "creator">],
  }));

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AccountShell
      nav={nav}
      search={SEARCH}
      searchPlaceholder="Search machines, bookings, operators…"
      notifications={notifications}
      displayName={name}
      initials={initials}
      avatarUrl={profile?.avatar_url}
      // The settings page has no personal-details form, so the profile menu goes
      // to the shared editor (same `profiles` row, this module's shell).
      settingsTo="/account/details"
      helpCard={{
        title: "Equipment Support",
        body: "Booking, operator aur payment help — Hindi, Bengali aur English mein.",
        phone: "1800-000-000",
      }}
      onSignOut={() => void handleSignOut()}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle ?? `${name} · machinery rental`}</p>
        </div>
        {action}
      </div>
      {children}
    </AccountShell>
  );
}
