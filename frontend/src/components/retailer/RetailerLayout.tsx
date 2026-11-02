import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChartNoAxesCombined,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  ShoppingCart,
  Sprout,
  Store,
  Video,
  Warehouse,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import AccountShell from "@/components/account/AccountShell";
import type { SearchEntry, ShellNavItem, ShellNotification } from "@/components/account/AccountShell";
import { useAuth } from "@/hooks/useAuth";
import { listNotifications } from "@/lib/retailer";
import type { RetailerNotification } from "@/lib/retailer";

/** Every retailer screen lives under this prefix. */
export const RETAILER_BASE = "/retailer";

export type RetailerNavKey =
  | "home"
  | "shop"
  | "products"
  | "orders"
  | "inventory"
  | "analytics"
  | "offers"
  | "buy"
  | "messages"
  | "notifications"
  | "creator"
  | "settings"
  | "help";

export const RETAILER_ROUTES: Record<Exclude<RetailerNavKey, "creator">, string> = {
  home: RETAILER_BASE,
  shop: `${RETAILER_BASE}/shop`,
  products: `${RETAILER_BASE}/products`,
  orders: `${RETAILER_BASE}/orders`,
  inventory: `${RETAILER_BASE}/inventory`,
  analytics: `${RETAILER_BASE}/analytics`,
  offers: `${RETAILER_BASE}/offers`,
  buy: `${RETAILER_BASE}/buy-from-farmers`,
  messages: `${RETAILER_BASE}/messages`,
  notifications: `${RETAILER_BASE}/notifications`,
  settings: `${RETAILER_BASE}/settings`,
  help: `${RETAILER_BASE}/help`,
};

const NAV: { key: RetailerNavKey; label: string; icon: ShellNavItem["icon"] }[] = [
  { key: "home", label: "Home", icon: LayoutDashboard },
  { key: "shop", label: "My Shop", icon: Store },
  { key: "products", label: "Products", icon: Package },
  { key: "orders", label: "Orders", icon: ShoppingCart },
  { key: "inventory", label: "Inventory", icon: Warehouse },
  { key: "analytics", label: "Sales Analytics", icon: ChartNoAxesCombined },
  { key: "offers", label: "Offers & Discounts", icon: Megaphone },
  { key: "buy", label: "Buy from Farmers", icon: Sprout },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "creator", label: "Creator Studio", icon: Video },
];

/**
 * Where each key goes. "creator" lives outside /retailer, so it is kept out of
 * `RETAILER_ROUTES` (that map is typed to the in-app keys the shell uses for
 * its active state) and resolved here instead.
 */
const NAV_HREF: Partial<Record<RetailerNavKey, string>> = { creator: "/creator/settings" };

/** Notification kind → the icon shown in the header bell. */
const KIND_ICON = {
  order: ShoppingCart,
  payment: IndianRupee,
  low_stock: AlertTriangle,
  expiry: CalendarClock,
  procurement: Sprout,
  system: Bell,
} as const;

const NOTIFICATION_SEARCH: SearchEntry[] = [
  { label: "Low stock", keywords: "stock out of stock reorder inventory", section: "Alerts", to: "/retailer/inventory" },
  { label: "Expiry", keywords: "expire expiry batch fertiliser pesticide", section: "Alerts", to: "/retailer/inventory" },
  { label: "Pending orders", keywords: "orders processing shipped deliver", section: "Sales", to: "/retailer/orders" },
  { label: "Monthly profit", keywords: "profit margin earnings report", section: "Sales", to: "/retailer/analytics" },
  { label: "GST details", keywords: "gst gstin license verification shop", section: "Shop", to: "/retailer/shop" },
  { label: "Add product", keywords: "new product seed fertiliser pesticide tool irrigation", section: "Catalogue", to: "/retailer/products" },
  { label: "Coupons", keywords: "offer discount coupon festival seasonal", section: "Promotions", to: "/retailer/offers" },
];

/**
 * Shared chrome for every retailer screen.
 *
 * Uses the same `AccountShell` as the farmer dashboard, so all account types
 * share one base layout — only the nav, search index, notifications and page
 * content differ.
 *
 * Also guards the role: a buyer or farmer who lands on /retailer is sent back
 * to their own dashboard, which keeps the account types separate.
 */
export default function RetailerLayout({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Right-hand header button, e.g. "Add product". */
  action?: ReactNode;
  children: ReactNode;
}) {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const rows = await listNotifications();
      setUnreadCount(rows.filter((n: RetailerNotification) => !n.read_at).length);
      setNotifications(
        rows.slice(0, 5).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body ?? "",
          icon: KIND_ICON[n.kind] ?? Bell,
          to: n.link ?? RETAILER_ROUTES.notifications,
        }))
      );
    } catch {
      // A missing table must not break navigation; the pages show the error.
      setUnreadCount(0);
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    if (user) void loadNotifications();
  }, [user, loadNotifications, pathname]);

  if (needsRole || needsDetails) {
    return <Navigate to="/complete-profile?next=/retailer" replace />;
  }
  // Legacy accounts may still carry the old "Shop" label.
  const role = profile?.role;
  const isRetailer = role === "Retailer" || role === "Shop";
  if (role && !isRetailer) {
    return <Navigate to={role === "Buyer" ? "/buyer-account" : "/dashboard"} replace />;
  }

  const shopName = profile?.details?.shop_name;
  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Retailer";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const activeKey: RetailerNavKey =
    (Object.entries(RETAILER_ROUTES).find(([, path]) => path === pathname)?.[0] as
      | RetailerNavKey
      | undefined) ?? "home";

  const nav: ShellNavItem[] = NAV.map(({ key, label, icon }) => ({
    label,
    icon,
    badge: key === "notifications" ? unreadCount : undefined,
    active: key === activeKey,
    to: NAV_HREF[key] ?? RETAILER_ROUTES[key as Exclude<RetailerNavKey, "creator">],
  }));

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AccountShell
      nav={nav}
      search={NOTIFICATION_SEARCH}
      searchPlaceholder="Search products, orders, stock…"
      notifications={notifications}
      displayName={name}
      initials={initials}
      avatarUrl={profile?.avatar_url}
      settingsTo={RETAILER_ROUTES.settings}
      helpCard={{
        title: "Retailer Support",
        body: "Stock, GST aur order help — Bengali, Hindi aur English mein.",
        phone: "1800-000-000",
      }}
      onSignOut={() => void handleSignOut()}
    >
      {/* Page heading — the hero on Home carries its own greeting. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {shopName ? `${shopName} · ` : ""}
            {subtitle ?? `Namaskar, ${name.split(" ")[0]}`}
          </p>
        </div>
        {action}
      </div>
      {children}
    </AccountShell>
  );
}
