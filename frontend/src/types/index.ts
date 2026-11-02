export type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

export type Role = {
  title: string;
  description: string;
  image: string;
  href: string;
  /** Value the signup form expects for this role. */
  signupRole?: string;
};

export type Feature = {
  icon: "compass" | "chat" | "shield" | "logo";
  title: string;
  description: string;
};

export type VideoCard = {
  title: string;
  duration: string;
  image: string;
};

export const USER_ROLES = [
  "Farmer",
  "Buyer",
  "Retailer",
  "Shop",
  "Worker",
  "Equipment",
  "Transporter",
  "Warehouse",
  "Content Creator",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Row in `public.profiles` (1:1 with `auth.users`). */
export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  avatar_url: string | null;
  /** Role-specific answers (district, crops, vehicle type …). */
  details: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};
