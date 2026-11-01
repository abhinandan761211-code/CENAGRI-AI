import type { UserRole } from "@/types";

/**
 * Where each account type belongs. This is the single source of truth for role
 * routing — the generic dashboard and every role-specific page use it, so a
 * user can never be sent to (or left on) another role's screen.
 *
 * "Shop" is the legacy label for a retailer.
 */
export function homeForRole(role: string | UserRole | null | undefined): string {
  switch (role) {
    case "Farmer":
      return "/farmer-account";
    case "Buyer":
      return "/buyer-account";
    case "Retailer":
    case "Shop":
      return "/retailer";
    case "Content Creator":
      return "/creator";
    default:
      return "/dashboard";
  }
}
