import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  Briefcase,
  MessageSquare,
  PlusCircle,
  Users,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import AccountShell from "@/components/account/AccountShell";
import type { SearchEntry, ShellNavItem, ShellNotification } from "@/components/account/AccountShell";
import { useAuth } from "@/hooks/useAuth";
import { listEmployerNotifications } from "@/lib/employer";
import type { EmployerNotification } from "@/lib/employer";

/** Every employer screen lives under this prefix. */
export const EMPLOYER_BASE = "/employer";

export type EmployerNavKey = "home" | "post" | "jobs" | "applicants" | "messages" | "notifications";

export const EMPLOYER_ROUTES: Record<EmployerNavKey, string> = {
  home: EMPLOYER_BASE,
  post: `${EMPLOYER_BASE}/post`,
  jobs: `${EMPLOYER_BASE}/jobs`,
  applicants: `${EMPLOYER_BASE}/applicants`,
  messages: `${EMPLOYER_BASE}/messages`,
  notifications: `${EMPLOYER_BASE}/notifications`,
};

const NAV: { key: EmployerNavKey; label: string; icon: ShellNavItem["icon"] }[] = [
  { key: "home", label: "Dashboard", icon: Briefcase },
  { key: "post", label: "Post a Job", icon: PlusCircle },
  { key: "jobs", label: "My Jobs", icon: Briefcase },
  { key: "applicants", label: "Applicants", icon: Users },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "notifications", label: "Notifications", icon: Bell },
];

const EMPLOYER_SEARCH: SearchEntry[] = [
  { label: "Post a job", keywords: "new job hiring wage workers post", section: "Jobs", to: "/employer/post" },
  { label: "My jobs", keywords: "listings posted open closed jobs", section: "Jobs", to: "/employer/jobs" },
  { label: "Applicants", keywords: "apply accept reject workers applications", section: "Hiring", to: "/employer/applicants" },
  { label: "Messages", keywords: "worker chat reply talk", section: "Hiring", to: "/employer/messages" },
  { label: "Pay & attendance", keywords: "payment attendance money wage", section: "Hiring", to: "/employer/jobs" },
];

const KIND_ICON = {
  application: Users,
  message: MessageSquare,
  work: Briefcase,
  system: Bell,
} as const;

/**
 * Chrome for the employer (job-posting) side of the worker module.
 *
 * Deliberately has NO role check: any account that owns land or a farm business
 * can hire — a farmer, a buyer, a retailer or a warehouse. What scopes the data
 * is `employer_id = auth.uid()` in RLS, not an account-type string. That is why
 * this screen is reachable from every account type without changing any
 * existing dashboard.
 *
 * Uses the same `AccountShell` as every other account, so the sidebar, header,
 * search, bell and profile menu are identical.
 */
export default function EmployerLayout({
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
      const rows = await listEmployerNotifications();
      setUnread(rows.filter((n: EmployerNotification) => !n.read_at).length);
      setNotifications(
        rows.slice(0, 5).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body ?? "",
          icon: KIND_ICON[n.kind] ?? Bell,
          to: n.link ?? EMPLOYER_ROUTES.notifications,
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
    return <Navigate to="/complete-profile?next=/employer" replace />;
  }

  const name =
    profile?.details?.shop_name ||
    profile?.details?.business_name ||
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Employer";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const activeKey: EmployerNavKey =
    (Object.entries(EMPLOYER_ROUTES).find(([, path]) => path === pathname)?.[0] as
      | EmployerNavKey
      | undefined) ?? "home";

  const nav: ShellNavItem[] = NAV.map(({ key, label, icon }) => ({
    label,
    icon,
    badge: key === "notifications" ? unread : undefined,
    active: key === activeKey,
    to: EMPLOYER_ROUTES[key],
  }));

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AccountShell
      nav={nav}
      search={EMPLOYER_SEARCH}
      searchPlaceholder="Search jobs, applicants, messages…"
      notifications={notifications}
      displayName={name}
      initials={initials}
      avatarUrl={profile?.avatar_url}
      settingsTo={EMPLOYER_ROUTES.home}
      helpCard={{
        title: "Employer Support",
        body: "Hiring, wages aur worker verification help — Hindi, Bengali aur English mein.",
        phone: "1800-000-000",
      }}
      onSignOut={() => void handleSignOut()}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {subtitle ?? `${name} · hiring dashboard`}
          </p>
        </div>
        {action}
      </div>
      {children}
    </AccountShell>
  );
}
