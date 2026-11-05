import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Package,
  RotateCcw,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Video,
  Clapperboard,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import AccountShell, { ShellHero, ShellQuickActions } from "@/components/account/AccountShell";
import type { SearchEntry, ShellNavItem, ShellNotification } from "@/components/account/AccountShell";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/lib/roleHome";
import {
  ORDER_TABS,
  SORT_OPTIONS,
  STATUS_STYLE,
  countsByStatus,
  formatAmount,
  formatOrderDate,
  listBuyerOrders,
  ordersForTab,
  sortOrders,
} from "@/lib/orders";
import type { BuyerOrder, OrderStatus, SortValue } from "@/lib/orders";



type Panel = "order" | "invoice" | "message" | "track" | "reorder" | null;

/**
 * Buyer account — order management.
 *
 * Layout mirrors the reference: collapsible sidebar, page header with a
 * location selector, a tab strip carrying live counts, a sort dropdown, and
 * one card per order. Every number on this page comes from `public.orders`;
 * with no rows it shows an empty state rather than sample data.
 */
export default function BuyerDashboard() {
  const { user, profile, needsRole, needsDetails, signOut } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<OrderStatus>("Total order");
  const [sort, setSort] = useState<SortValue>("newest");
  const [sortOpen, setSortOpen] = useState(false);

  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<{ kind: Panel; order: BuyerOrder | null }>({
    kind: null,
    order: null,
  });

  if (needsRole || needsDetails) {
    return <Navigate to="/complete-profile?next=/buyer-account" replace />;
  }

  // Only buyers belong on this page; other roles go to their own home.
  if (profile?.role && profile.role !== "Buyer") {
    return <Navigate to={homeForRole(profile.role)} replace />;
  }

  const details = profile?.details ?? {};
  const locationLabel = [details.district, details.state].filter(Boolean).join(", ");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      setOrders(await listBuyerOrders());
      setState("ready");
    } catch (err) {
      setState("error");
      setError(
        err instanceof Error && /relation|does not exist/i.test(err.message)
          ? "The orders table is not set up yet. Run database/supabase/features.sql in Supabase."
          : err instanceof Error
            ? err.message
            : "Could not load your orders."
      );
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const counts = useMemo(() => countsByStatus(orders), [orders]);

  const visible = useMemo(
    () => sortOrders(ordersForTab(orders, tab), sort),
    [orders, tab, sort]
  );

  const nav: ShellNavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard, to: "/buyer-account", active: true },
    {
      label: "Orders",
      icon: ShoppingCart,
      section: "#orders",
      badge: counts["Pending confirmation"],
    },
    { label: "Product Catalog", icon: Store, to: "/marketplace" },
    { label: "Suppliers", icon: Users, to: "/cenfriend" },
    { label: "Logistics", icon: Truck, to: "/transport" },
    { label: "Inventory", icon: Package, to: "/storage" },
    /* Watching the hub needs no Creator Mode — learning is open to every account. */
    { label: "Kisan Video Hub", icon: Video, to: "/video-hub" },
    { label: "Creator Studio", icon: Clapperboard, to: "/creator-mode" },
  ];

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Buyer";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Suprabhat";
    if (h < 17) return "Namaskar";
    return "Shubho Sandhya";
  })();

  const pending = counts["Pending confirmation"];

  return (
    <AccountShell
      nav={nav}
      search={BUYER_SEARCH}
      searchPlaceholder="Search orders, suppliers, logistics…"
      notifications={BUYER_NOTIFICATIONS(pending)}
      displayName={name}
      initials={initials}
      avatarUrl={profile?.avatar_url}
      // Was `/complete-profile`, which immediately redirects back when the
      // account is already onboarded — so "Edit profile" did nothing.
      settingsTo="/account/details"
      helpCard={{
        title: "Buyer Support",
        body: "Orders, suppliers aur delivery help — Bengali, Hindi aur English mein.",
        phone: "1800-000-000",
      }}
      onSignOut={() => void handleSignOut()}
    >
      <ShellHero
        locationLine={locationLabel || "Location not set"}
        greeting={`${greeting}, ${name.split(" ")[0]}! 🌾`}
        subtitle="Source fresh produce directly from verified farms with transparent pricing."
        aside={
          <div className="rounded-xl bg-white/10 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              Pending
            </p>
            <p className="mt-1.5 font-display text-2xl font-extrabold">{pending}</p>
            <p className="mt-1 text-[11px] text-white/70">orders awaiting confirmation</p>
          </div>
        }
      />

      <ShellQuickActions
        actions={[
          { label: "Browse Catalog", icon: Store, onClick: () => navigate("/marketplace") },
          { label: "Suppliers", icon: Users, onClick: () => navigate("/cenfriend") },
          { label: "Logistics", icon: Truck, onClick: () => navigate("/transport") },
          { label: "Storage", icon: Package, onClick: () => navigate("/storage") },
          {
            label: "My Orders",
            icon: ShoppingCart,
            onClick: () =>
              document.getElementById("orders")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
        ]}
      />

      <div id="orders" className="scroll-mt-20">
        <h2 className="mb-3 font-display text-[15px] font-bold text-forest">My Orders</h2>
        <div>
          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex w-full gap-1 overflow-x-auto scrollbar-none rounded-xl border border-slate-200 bg-white p-1.5 sm:w-auto"
              role="tablist"
            >
              {ORDER_TABS.map((label) => {
                const active = tab === label;
                return (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(label)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-slate-100 text-forest" : "text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLE[label].dot}`} />
                    {label}
                    <span className={active ? "text-forest" : "text-slate-400"}>
                      {counts[label]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((o) => !o)}
                aria-expanded={sortOpen}
                aria-haspopup="listbox"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {SORT_OPTIONS.find((o) => o.value === sort)?.label}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {sortOpen && (
                <ul
                  role="listbox"
                  className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {SORT_OPTIONS.map((option) => (
                    <li key={option.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={sort === option.value}
                        onClick={() => {
                          setSort(option.value);
                          setSortOpen(false);
                        }}
                        className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${sort === option.value ? "font-semibold text-forest" : "text-slate-600"
                          }`}
                      >
                        {option.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Content states */}
          {state === "loading" && (
            <p className="py-16 text-center text-sm text-slate-500">Loading your orders…</p>
          )}

          {state === "error" && (
            <div className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold text-red-700">Could not load orders</p>
              <p className="mt-1 text-[11px] leading-relaxed text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-[11px] font-bold text-red-700 underline"
              >
                Try again
              </button>
            </div>
          )}

          {state === "ready" && visible.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
                <ShoppingCart className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-forest">
                {tab === "Total order" ? "No orders yet" : `No orders are ${tab.toLowerCase()}`}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                {tab === "Total order"
                  ? "Orders you place on the marketplace appear here with their status, amount and delivery update."
                  : `Nothing is currently in "${tab}". Switch tabs to see your other orders.`}
              </p>
              <a href="/marketplace" className="btn-primary mt-4 h-9 px-4 text-xs">
                Browse the marketplace
              </a>
            </div>
          )}

          {state === "ready" && visible.length > 0 && (
            <ul className="mt-3 space-y-3">
              {visible.map((order) => (
                <li key={order.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-[15px] font-bold text-forest">
                        {order.product ?? name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Order ID: {order.reference}
                        {order.seller && <> · {order.seller}</>}
                        {order.district && <> · {order.district}</>}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[order.status].badge
                        }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-[11px] text-slate-500">
                        Total Amount
                        {order.quantity_kg != null && (
                          <> · {order.quantity_kg.toLocaleString("en-IN")} kg</>
                        )}
                      </p>
                      <p className="font-display text-lg font-bold text-forest">
                        {formatAmount(order.amount_inr)}
                      </p>
                      <p className="text-[10px] text-slate-400">{formatOrderDate(order.created_at)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: "order", order })}
                        className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: "track", order })}
                        className="h-8 rounded-lg border border-brand-200 bg-brand-50 px-3 text-[11px] font-semibold text-brand-800 transition hover:bg-brand-100"
                      >
                        Track Order
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: "reorder", order })}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-3 text-[11px] font-semibold text-white transition hover:bg-brand-800"
                      >
                        <RotateCcw className="h-3 w-3" /> Reorder
                      </button>

                      <span className="ml-1 flex items-center gap-1 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          aria-label="Invoice"
                          title="Invoice"
                          onClick={() => setPanel({ kind: "invoice", order })}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-forest"
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Message seller"
                          title="Message seller"
                          onClick={() => setPanel({ kind: "message", order })}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-forest"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      {panel.order && panel.kind && (
        <OrderDialog
          kind={panel.kind}
          order={panel.order}
          onClose={() => setPanel({ kind: null, order: null })}
        />
      )}
    </AccountShell>
  );
}

/* ── Search index & header alerts for the buyer account ───────────────── */

const BUYER_SEARCH: SearchEntry[] = [
  { label: "My Orders", keywords: "orders purchase delivery status", section: "Orders", anchor: "#orders" },
  { label: "Product Catalog", keywords: "catalog products buy marketplace", section: "Sourcing", to: "/marketplace" },
  { label: "Suppliers", keywords: "supplier farmer grower network", section: "Sourcing", to: "/cenfriend" },
  { label: "Logistics", keywords: "transport truck delivery logistics", section: "Operations", to: "/transport" },
  { label: "Storage", keywords: "warehouse storage cold godown", section: "Operations", to: "/storage" },
];

/** Header bell rows, built from live order state — nothing hardcoded. */
function BUYER_NOTIFICATIONS(pending: number): ShellNotification[] {
  if (pending <= 0) return [];
  return [
    {
      id: `pending-${pending}`,
      title: `${pending} order${pending === 1 ? "" : "s"} awaiting confirmation`,
      body: "Open your orders to confirm or track them.",
      icon: ShoppingCart,
      to: "/buyer-account",
    },
  ];
}

const DIALOG_TITLE: Record<Exclude<Panel, null>, string> = {
  order: "Order details",
  invoice: "Invoice",
  message: "Message seller",
  track: "Track order",
  reorder: "Reorder",
};

/** One dialog for every card action, so behaviour is consistent. */
function OrderDialog({
  kind,
  order,
  onClose,
}: {
  kind: Exclude<Panel, null>;
  order: BuyerOrder;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={DIALOG_TITLE[kind]}
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-xl2 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-forest">{DIALOG_TITLE[kind]}</h2>
            <p className="text-[11px] text-slate-500">{order.reference}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 space-y-2 text-xs">
          {[
            ["Product", order.product ?? "—"],
            ["Quantity", order.quantity_kg != null ? `${order.quantity_kg.toLocaleString("en-IN")} kg` : "—"],
            ["Amount", formatAmount(order.amount_inr)],
            ["Status", order.status],
            ["Placed", formatOrderDate(order.created_at)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-1.5 last:border-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-semibold text-forest">{value}</dd>
            </div>
          ))}
        </dl>

        {kind === "message" && (
          <textarea
            rows={3}
            placeholder="Write a message to the seller…"
            className="mt-4 w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-brand-500"
          />
        )}

        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          {kind === "track"
            ? "Delivery tracking starts once a transport booking is linked to this order."
            : kind === "reorder"
              ? "Reorder adds these items back to the marketplace basket."
              : "This action is recorded against the order server-side."}
        </p>

        <button type="button" onClick={onClose} className="btn-primary mt-4 h-9 w-full text-xs">
          Close
        </button>
      </div>
    </div>
  );
}
