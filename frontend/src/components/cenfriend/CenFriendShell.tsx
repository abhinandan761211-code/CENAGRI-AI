import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Bookmark,
  Compass,
  Home,
  MessageCircle,
  MessageSquare,
  PlusSquare,
  Settings,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { FarmerShell } from "@/components/farm/FarmerShell";
import { useAuth } from "@/hooks/useAuth";
import { listNotifications } from "@/lib/social";

/**
 * CenFriend's own navigation.
 *
 * Layout follows the brief's responsive contract:
 *
 *   desktop — the app sidebar (from FarmerShell), a 228px CenFriend rail, the
 *             600–680px content column, and a 288px right column
 *   tablet  — the app sidebar collapses; the rail stays
 *   mobile  — the rail is replaced by a five-slot bottom bar and the feed goes
 *             full width
 *
 * The nav lives INSIDE FarmerShell, not beside it. That is what keeps one
 * identity: a farmer never leaves their account to use CenFriend, and the
 * follower counts here are the same ones the Creator Studio reads.
 *
 * Settings appears ONCE, as a real entry in `CENFRIEND_NAV`. The old rail drew
 * a second "Settings" link below the list, which duplicated the entry in both
 * the desktop rail and the mobile drawer.
 */

type NavKey =
  | "home"
  | "explore"
  | "create"
  | "requests"
  | "notifications"
  | "saved"
  | "messages"
  | "comments"
  | "profile"
  | "settings";

type NavItem = { key: NavKey; label: string; icon: LucideIcon; to: string };

export const CENFRIEND_NAV: NavItem[] = [
  { key: "home", label: "Home", icon: Home, to: "/cenfriend" },
  { key: "explore", label: "Explore", icon: Compass, to: "/cenfriend/explore" },
  { key: "create", label: "Create", icon: PlusSquare, to: "/cenfriend/create" },
  { key: "requests", label: "Follow requests", icon: UserPlus, to: "/cenfriend/requests" },
  { key: "notifications", label: "Notifications", icon: Bell, to: "/cenfriend/notifications" },
  { key: "messages", label: "Messages", icon: MessageCircle, to: "/cenfriend/messages" },
  { key: "comments", label: "Comments", icon: MessageSquare, to: "/cenfriend/comments" },
  { key: "saved", label: "Saved", icon: Bookmark, to: "/cenfriend/saved" },
  { key: "profile", label: "Profile", icon: User, to: "/cenfriend/me" },
  { key: "settings", label: "Settings", icon: Settings, to: "/cenfriend/settings" },
];

function activeKey(pathname: string): NavKey | null {
  if (pathname === "/cenfriend" || pathname === "/cenfriend/") return "home";
  if (pathname.startsWith("/cenfriend/explore")) return "explore";
  if (pathname.startsWith("/cenfriend/create")) return "create";
  if (pathname.startsWith("/cenfriend/requests")) return "requests";
  if (pathname.startsWith("/cenfriend/notifications")) return "notifications";
  if (pathname.startsWith("/cenfriend/comments")) return "comments";
  if (pathname.startsWith("/cenfriend/saved")) return "saved";
  if (pathname.startsWith("/cenfriend/settings")) return "settings";
  if (pathname.startsWith("/cenfriend/stories")) return "create";
  if (pathname.startsWith("/cenfriend/u/") || pathname.startsWith("/cenfriend/me")) return "profile";
  if (pathname.startsWith("/cenfriend/messages")) return "messages";
  // The app-wide /messages route still highlights Messages if it is ever
  // reached from outside CenFriend.
  if (pathname.startsWith("/messages")) return "messages";
  return null;
}

/**
 * The unread badge on the bell.
 *
 * Refreshed on navigation rather than on a timer: a poll every few seconds for
 * every open tab is a lot of load for a number that only needs to be roughly
 * right, and the notifications screen shows the exact count anyway.
 */
function useUnreadCount(pathname: string): number {
  const [unread, setUnread] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let alive = true;
    listNotifications({ limit: 1 })
      .then((res) => {
        if (alive) setUnread(res.unread ?? 0);
      })
      .catch(() => {
        /* a badge that fails to load is better than a screen-level error */
      });
    return () => {
      alive = false;
    };
  }, [user, pathname]);

  return unread;
}

/** Five slots fit a phone bar comfortably; the rest live in Settings/More. */
const MOBILE_NAV: NavKey[] = ["home", "explore", "create", "comments", "profile"];

/**
 * The three-column contract, in one place.
 *
 *   rail    228px   (brief: 220–250)
 *   content minmax(0,1fr) with a 680px cap  (brief: 600–680)
 *   aside   288px   (brief: 280–320)
 *
 * `minmax(0,1fr)` on the middle track is what stops a long single-word caption
 * from pushing the layout wider than the viewport — the classic cause of
 * horizontal overflow on a feed.
 */
const RAIL_WIDTH = "w-[228px]";
const CONTENT_MAX = "max-w-[680px]";
const ASIDE_WIDTH = "w-[288px]";

export function CenFriendShell({
  children,
  activeOverride,
  wide = false,
  aside,
}: {
  children: ReactNode;
  activeOverride?: NavKey;
  /** Feed pages use the full width; profile-style pages keep the 2-column grid. */
  wide?: boolean;
  /**
   * The right column. When given, it replaces the generic profile card — Explore
   * passes suggestions, tags and topics; other pages keep the simple shortcut.
   * `xl` only: below that the feed needs the room more than the column does.
   */
  aside?: ReactNode;
}) {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const active = activeOverride ?? activeKey(pathname);
  const unread = useUnreadCount(pathname);

  const profileTo = profile?.id ? `/cenfriend/u/${profile.id}` : "/cenfriend/settings";
  const items = CENFRIEND_NAV.map((item) =>
    item.key === "profile" ? { ...item, to: profileTo } : item
  );

  const renderRailItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = active === item.key;
    const isProfile = item.key === "profile";
    return (
      <Link
        key={item.key}
        to={item.to}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition ${isActive
            ? "bg-brand-50 text-brand-800"
            : "text-slate-600 hover:bg-slate-50 hover:text-forest"
          }`}
      >
        {isActive && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-1 rounded-r-full bg-brand-700" />}
        <span className="relative">
          <Icon className="h-5 w-5" strokeWidth={isActive || isProfile ? 2.3 : 1.8} />
          {item.key === "notifications" && unread > 0 && (
            <span className="absolute -right-1.5 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-rose-600 px-0.5 text-[8px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className="truncate">{isProfile ? "My profile" : item.label}</span>
      </Link>
    );
  };

  const defaultAside = (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <Link to={profileTo} className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-forest text-xs font-bold text-white">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-10 w-10 object-cover" />
          ) : (
            (profile?.full_name ?? "CA").slice(0, 2).toUpperCase()
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold text-forest">{profile?.full_name ?? "Your account"}</span>
          <span className="block truncate text-[11px] text-slate-500">{profile?.role ?? "Kalika member"}</span>
        </span>
      </Link>
      <Link
        to="/cenfriend/settings"
        className="mt-3 block rounded-md border border-slate-200 py-1.5 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-50"
      >
        Account privacy &amp; safety
      </Link>
    </div>
  );

  const hasAside = wide || !!aside;

  return (
    <FarmerShell bottomBar={false}>
      <div className={`flex min-w-0 gap-5 ${hasAside ? "justify-center" : ""}`}>
        {/* ── Desktop / tablet rail ── */}
        <nav
          aria-label="CenFriend"
          // Two breakpoints on purpose. `md` shows the rail to match the app
          // shell, but the five-slot phone bar would then overlap it, so the
          // bar is hidden from `md` and the rail gets its own bottom padding
          // instead. At `lg` the app shell has its own phone bar and the rail
          // no longer needs the extra room.
          className={`sticky top-20 mb-20 hidden h-fit shrink-0 flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-2 md:flex md:mb-24 lg:mb-0 ${RAIL_WIDTH}`}
        >
          <p className="px-3 py-2 font-display text-base font-extrabold tracking-tight text-forest">CenFriend</p>
          {items.map(renderRailItem)}
          <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-brand-800">
              <Users className="h-3.5 w-3.5" /> Agriculture community
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-brand-700">
              One account, every role — farmers, buyers, retailers and creators in one feed.
            </p>
          </div>
        </nav>

        {/* ── Content column ── */}
        {/*
          Feed pages get the Instagram column (≤680). Everything else gets the
          full leftover width up to 1120: a stories composer and a form do not
          read better in a narrow strip, and capping them at 768 is what left
          the right half of a 1440px screen empty.
        */}
        <div className={`min-w-0 flex-1 ${wide ? `mx-auto w-full ${CONTENT_MAX}` : "w-full max-w-[1120px]"}`}>{children}</div>

        {/* ── Right column ── */}
        {hasAside && (
          <aside aria-label="Discover" className={`sticky top-20 hidden h-fit shrink-0 ${ASIDE_WIDTH} xl:block`}>
            {aside ?? defaultAside}
          </aside>
        )}
      </div>

      {/* ── Mobile bottom bar ── */}
      <nav
        aria-label="CenFriend sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex items-stretch">
          {MOBILE_NAV.map((key) => {
            const item = items.find((i) => i.key === key);
            if (!item) return null;
            const Icon = item.icon;
            const isActive = active === key;
            return (
              <li key={key} className="flex-1">
                <Link
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label}
                  className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${isActive ? "text-brand-700" : "text-slate-500"
                    }`}
                >
                  <Icon className="h-[21px] w-[21px]" strokeWidth={isActive ? 2.4 : 1.9} />
                  {key === "notifications" && unread > 0 && (
                    <span className="absolute right-5 top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-rose-600 px-0.5 text-[8px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                  {item.label.split(" ")[0]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </FarmerShell>
  );
}

export default CenFriendShell;
