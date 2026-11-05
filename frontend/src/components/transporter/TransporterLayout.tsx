import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  CalendarClock,
  Clapperboard,
  ClipboardList,
  FileText,
  IndianRupee,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  Route,
  Search,
  Star,
  Truck,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import AccountShell from "@/components/account/AccountShell";
import type { SearchEntry, ShellNavItem, ShellNotification } from "@/components/account/AccountShell";
import { useAuth } from "@/hooks/useAuth";
import { listNotifications } from "@/lib/transporter";
import type { TransporterNotification } from "@/lib/transporter";

/** Every transporter screen lives under this prefix. */
export const TRANSPORTER_BASE = "/transporter";

export type TransporterNavKey =
  | "home"
  | "requests"
  | "bookings"
  | "trips"
  | "tracking"
  | "vehicles"
  | "drivers"
  | "availability"
  | "earnings"
  | "invoices"
  | "reviews"
  | "messages"
  | "profile"
  | "hub"
  | "creator"
  | "settings";

export const TRANSPORTER_ROUTES: Record<Exclude<TransporterNavKey, "hub" | "creator">, string> = {
  home: TRANSPORTER_BASE,
  requests: `${TRANSPORTER_BASE}/requests`,
  bookings: `${TRANSPORTER_BASE}/bookings`,
  trips: `${TRANSPORTER_BASE}/trips`,
  tracking: `${TRANSPORTER_BASE}/tracking`,
  vehicles: `${TRANSPORTER_BASE}/vehicles`,
  drivers: `${TRANSPORTER_BASE}/drivers`,
  availability: `${TRANSPORTER_BASE}/availability`,
  earnings: `${TRANSPORTER_BASE}/earnings`,
  invoices: `${TRANSPORTER_BASE}/invoices`,
  reviews: `${TRANSPORTER_BASE}/reviews`,
  messages: `${TRANSPORTER_BASE}/messages`,
  profile: `${TRANSPORTER_BASE}/profile`,
  settings: `${TRANSPORTER_BASE}/settings`,
};

const NAV: { key: TransporterNavKey; label: string; tkey: string; icon: ShellNavItem["icon"] }[] = [
  { key: "home", label: "Overview", tkey: "s.overview", icon: LayoutDashboard },
  { key: "requests", label: "Find Transport Requests", tkey: "s.transportRequests", icon: Search },
  { key: "bookings", label: "My Bookings", tkey: "s.bookings", icon: ClipboardList },
  { key: "trips", label: "Active Trips", tkey: "s.activeTrips", icon: Navigation },
  { key: "tracking", label: "Live Tracking", tkey: "s.tracking", icon: MapPin },
  { key: "vehicles", label: "My Vehicles", tkey: "s.vehicles", icon: Truck },
  { key: "drivers", label: "Driver Management", tkey: "s.drivers", icon: Users },
  { key: "availability", label: "Availability & Schedule", tkey: "s.availability", icon: CalendarClock },
  { key: "earnings", label: "Earnings & Payments", icon: IndianRupee, tkey: "Earnings & Payments" },
  { key: "invoices", label: "Invoices & Documents", tkey: "s.invoices", icon: FileText },
  { key: "reviews", label: "Reviews & Ratings", icon: Star, tkey: "Reviews & Ratings" },
  { key: "messages", label: "Messages", tkey: "s.messages", icon: MessageSquare },
  /* Watching is open to every account; publishing is the separate studio entry. */
  { key: "hub", label: "Kisan Video Hub", tkey: "s.videoHub", icon: Video },
  { key: "creator", label: "Creator Studio", tkey: "s.creatorStudio", icon: Clapperboard },
  { key: "profile", label: "My Profile", tkey: "s.profile", icon: UserRound },
  { key: "settings", label: "Settings", icon: Route, tkey: "Settings" },
];

/** "hub" and "creator" live outside /transporter, so they resolve here. */
const NAV_HREF: Partial<Record<TransporterNavKey, string>> = {
  hub: "/video-hub",
  creator: "/creator-mode",
};

const KIND_ICON = {
  request: Package,
  offer: FileText,
  booking: ClipboardList,
  trip: Navigation,
  payment: IndianRupee,
  review: Star,
  system: Bell,
} as const;

const SEARCH: SearchEntry[] = [
  { label: "Find transport requests", keywords: "requests load cargo pickup dropoff find work", section: "Work", to: "/transporter/requests" },
  { label: "My bookings", keywords: "bookings accepted confirmed", section: "Work", to: "/transporter/bookings" },
  { label: "Active trips", keywords: "trip transit delivered active", section: "Work", to: "/transporter/trips" },
  { label: "Live tracking", keywords: "track location gps status eta", section: "Work", to: "/transporter/tracking" },
  { label: "Vehicles", keywords: "fleet truck pickup capacity rc insurance", section: "Fleet", to: "/transporter/vehicles" },
  { label: "Drivers", keywords: "driver licence assign staff", section: "Fleet", to: "/transporter/drivers" },
  { label: "Availability", keywords: "schedule dates unavailable leave", section: "Fleet", to: "/transporter/availability" },
  { label: "Earnings", tkey: "s.earnings", keywords: "money revenue payment invoice paid", section: "Money", to: "/transporter/earnings" },
  { label: "Reviews", tkey: "s.reviews", keywords: "rating feedback stars customer", section: "Account", to: "/transporter/reviews" },
  { label: "Kisan Video Hub", tkey: "s.videoHub", keywords: "video watch learn tutorial shorts training", section: "Learn", to: "/video-hub" },
];

/**
 * Chrome for every transporter screen.
 *
 * Uses the same `AccountShell` as every other account, so the hover-rail
 * sidebar, header search, bell and profile menu are identical — only the
 * navigation and page content differ.
 *
 * No role gate: like the employer side, what makes an account a transporter is
 * that it owns a vehicle, and RLS scopes everything to `auth.uid()`. That means
 * a farmer who also runs a pickup truck can open this module without any change
 * to the farmer dashboard.
 */
export default function TransporterLayout({
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
      setUnread(rows.filter((n: TransporterNotification) => !n.read_at).length);
      setNotifications(
        rows.slice(0, 5).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body ?? "",
          icon: KIND_ICON[n.kind] ?? Bell,
          to: n.link ?? TRANSPORTER_ROUTES.home,
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
    return <Navigate to="/complete-profile?next=/transporter" replace />;
  }

  const name =
    profile?.details?.business_name ||
    profile?.details?.shop_name ||
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Transporter";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  // Longest prefix wins, so /transporter/requests/abc lights up "requests".
  const activeKey: TransporterNavKey =
    (Object.entries(TRANSPORTER_ROUTES)
      .filter(([, path]) => pathname === path || pathname.startsWith(`${path}/`))
      .sort((a, b) => b[1].length - a[1].length)[0]?.[0] as TransporterNavKey | undefined) ?? "home";

  const nav: ShellNavItem[] = NAV.map(({ key, label, tkey, icon }) => ({
    label,
    tkey,
    icon,
    badge: key === "home" && unread > 0 ? unread : undefined,
    active: key === activeKey,
    to: NAV_HREF[key] ?? TRANSPORTER_ROUTES[key as Exclude<TransporterNavKey, "hub" | "creator">],
  }));

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AccountShell
      nav={nav}
      search={SEARCH}
      searchPlaceholder="Search requests, bookings, vehicles…"
      notifications={notifications}
      displayName={name}
      initials={initials}
      avatarUrl={profile?.avatar_url}
      settingsTo={TRANSPORTER_ROUTES.settings}
      helpCard={{
        title: "Transporter Support",
        body: "Booking, payment aur document help — Hindi, Bengali aur English mein.",
        phone: "1800-000-000",
      }}
      onSignOut={() => void handleSignOut()}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle ?? `${name} · logistics`}</p>
        </div>
        {action}
      </div>
      {children}
    </AccountShell>
  );
}
