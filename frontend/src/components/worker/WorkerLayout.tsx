import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clapperboard,
  FileText,
  IndianRupee,
  LayoutDashboard,
  MessageSquare,
  Star,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { homeForRole } from "@/lib/roleHome";
import AccountShell from "@/components/account/AccountShell";
import type { SearchEntry, ShellNavItem, ShellNotification } from "@/components/account/AccountShell";
import { useAuth } from "@/hooks/useAuth";
import { listWorkerNotifications } from "@/lib/worker";
import type { WorkerNotification } from "@/lib/worker";

/** Every worker screen lives under this prefix. */
export const WORKER_BASE = "/worker";

export type WorkerNavKey =
  | "home"
  | "jobs"
  | "applications"
  | "active"
  | "calendar"
  | "earnings"
  | "profile"
  | "reviews"
  | "messages"
  | "notifications"
  | "hire"
  | "hub"
  | "creator";

export const WORKER_ROUTES: Record<Exclude<WorkerNavKey, "creator" | "hub" | "hire">, string> = {
  home: WORKER_BASE,
  jobs: `${WORKER_BASE}/jobs`,
  applications: `${WORKER_BASE}/applications`,
  active: `${WORKER_BASE}/active-work`,
  calendar: `${WORKER_BASE}/calendar`,
  earnings: `${WORKER_BASE}/earnings`,
  profile: `${WORKER_BASE}/profile`,
  reviews: `${WORKER_BASE}/reviews`,
  messages: `${WORKER_BASE}/messages`,
  notifications: `${WORKER_BASE}/notifications`,
};

const NAV: { key: WorkerNavKey; label: string; tkey: string; icon: ShellNavItem["icon"] }[] = [
  { key: "home", label: "Dashboard", tkey: "s.dashboard", icon: LayoutDashboard },
  { key: "jobs", label: "Find Jobs", tkey: "s.jobs", icon: Briefcase },
  { key: "applications", label: "My Applications", tkey: "s.applications", icon: FileText },
  { key: "active", label: "Active Work", tkey: "s.activeWork", icon: CheckCircle2 },
  { key: "calendar", label: "Work Calendar", tkey: "s.calendar", icon: CalendarDays },
  { key: "earnings", label: "Earnings", tkey: "s.earnings", icon: IndianRupee },
  { key: "profile", label: "My Profile", tkey: "s.profile", icon: UserRound },
  { key: "reviews", label: "Reviews", tkey: "s.reviews", icon: Star },
  { key: "messages", label: "Messages", tkey: "s.messages", icon: MessageSquare },
  { key: "notifications", label: "Notifications", tkey: "s.notifications", icon: Bell },
  { key: "hire", label: "Hire Workers", tkey: "s.hireWorkers", icon: Users },
  /* Watching the hub needs no Creator Mode — learning is open to every account. */
  { key: "hub", label: "Kisan Video Hub", tkey: "s.videoHub", icon: Video },
  { key: "creator", label: "Creator Studio", tkey: "s.creatorStudio", icon: Clapperboard },
];

/** "hub", "creator" and "hire" live outside /worker, so they are resolved separately. */
const NAV_HREF: Partial<Record<WorkerNavKey, string>> = {
  hub: "/video-hub",
  creator: "/creator-mode",
  hire: "/employer",
};

const KIND_ICON = {
  job: Briefcase,
  application: FileText,
  schedule: CalendarDays,
  payment: IndianRupee,
  verification: CheckCircle2,
  system: Bell,
} as const;

const WORKER_SEARCH: SearchEntry[] = [
  { label: "Find work", keywords: "jobs find search apply work hire wage", section: "Jobs", to: "/worker/jobs" },
  { label: "My applications", keywords: "applied pending accepted rejected withdraw", section: "Jobs", to: "/worker/applications" },
  { label: "Active work", keywords: "current job ongoing attendance progress", section: "Work", to: "/worker/active-work" },
  { label: "Calendar & availability", keywords: "schedule dates unavailable leave calendar", section: "Work", to: "/worker/calendar" },
  { label: "Earnings", tkey: "s.earnings", keywords: "payment money wage paid pending transaction", section: "Money", to: "/worker/earnings" },
  { label: "Skills", tkey: "s.skills", keywords: "skills harvesting sowing spraying experience", section: "Profile", to: "/worker/profile" },
  { label: "Reviews", tkey: "s.reviews", keywords: "rating feedback stars review employer", section: "Profile", to: "/worker/reviews" },
];

/**
 * Shared chrome for every worker screen.
 *
 * Uses the same `AccountShell` as the farmer, buyer and retailer dashboards, so
 * every account type shares one base layout — only the nav, search index,
 * notifications and page content differ. Hover-collapsible sidebar, header
 * search, bell and profile menu all come from there.
 *
 * The role guard keeps account types separate: a farmer who opens `/worker`
 * is sent back to their own dashboard.
 */
export default function WorkerLayout({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Right-hand header button, e.g. "Edit profile". */
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
      const rows = await listWorkerNotifications();
      setUnreadCount(rows.filter((n: WorkerNotification) => !n.read_at).length);
      setNotifications(
        rows.slice(0, 5).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body ?? "",
          icon: KIND_ICON[n.kind] ?? Bell,
          to: n.link ?? WORKER_ROUTES.notifications,
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
    return <Navigate to="/complete-profile?next=/worker" replace />;
  }

  // Workers stay on /worker. Everyone else goes to their own account rather
  // than being allowed to browse another account type's shell. Sending them to
  // the bare `/dashboard` made them bounce: the dashboard sent them back here.
  const role = profile?.role;
  if (role && role !== "Worker") {
    return <Navigate to={homeForRole(role)} replace />;
  }

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Worker";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const activeKey: WorkerNavKey =
    (Object.entries(WORKER_ROUTES).find(([, path]) => path === pathname)?.[0] as
      | WorkerNavKey
      | undefined) ?? "home";

  const nav: ShellNavItem[] = NAV.map(({ key, label, tkey, icon }) => ({
    label,
    tkey,
    icon,
    badge: key === "notifications" ? unreadCount : undefined,
    active: key === activeKey,
    to: NAV_HREF[key] ?? WORKER_ROUTES[key as Exclude<WorkerNavKey, "creator" | "hub" | "hire">],
  }));

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AccountShell
      nav={nav}
      search={WORKER_SEARCH}
      searchPlaceholder="Search jobs, applications, earnings…"
      notifications={notifications}
      displayName={name}
      initials={initials}
      avatarUrl={profile?.avatar_url}
      settingsTo={WORKER_ROUTES.profile}
      helpCard={{
        title: "Worker Helpline",
        body: "Job, payment aur safety help — Hindi, Bengali aur English mein.",
        phone: "1800-000-000",
      }}
      onSignOut={() => void handleSignOut()}
    >
      {/* Page heading — the home screen's hero carries its own greeting. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {subtitle ?? `Namaskar, ${name.split(" ")[0]}`}
          </p>
        </div>
        {action}
      </div>
      {children}
    </AccountShell>
  );
}
