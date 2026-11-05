import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/lib/roleHome";

/**
 * Sends a signed-in user to the account that matches their role.
 *
 * `/dashboard` and the post-login redirect used to have two different rules:
 * the dashboard redirected by role, but Login navigated straight to
 * `/dashboard?redirect=…` or to whatever `?redirect=` said, so an account could
 * land on a page that was not its own, or ping-pong between `/dashboard` and
 * `/farmer-account` because one rule kept re-applying the other's redirect.
 *
 * Now every role-aware entry point resolves through `homeForRole` here: a
 * farmer opens the farmer account, a buyer the buyer account, and so on. An
 * explicit `?redirect=` is followed only when it points inside this role's own
 * area (e.g. `/farmer-account/…` for a farmer, `/my-farm` for a farmer); any
 * other target falls back to the role's home so one account can never be
 * dropped into another account's screen.
 */
export default function RoleHome() {
  const { profile, needsRole, needsDetails } = useAuth();
  const [params] = useSearchParams();
  const home = homeForRole(profile?.role);

  if (needsRole || needsDetails) {
    const next = encodeURIComponent(params.get("redirect") || home);
    return <Navigate to={`/complete-profile?next=${next}`} replace />;
  }

  const asked = params.get("redirect");
  const isOwnArea = Boolean(asked) && isSafe(asked!) && belongsToArea(home, asked!);

  return <Navigate to={isOwnArea ? asked! : home} replace />;
}

/** Every path prefix that belongs to some role's account. */
const ROLE_PREFIXES = [
  "/farmer-account",
  "/buyer-account",
  "/retailer",
  "/worker",
  "/transporter",
  "/warehouse",
  "/equipment-owner",
  "/creator",
];

function isSafe(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

function belongsToArea(home: string, path: string): boolean {
  if (roleArea(path)) return path === home || path.startsWith(`${home}/`);
  // A shared page (marketplace, advisory, CenFriend…) is fine for any role; a
  // role home is what it is.
  return true;
}

function roleArea(path: string): boolean {
  return ROLE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
