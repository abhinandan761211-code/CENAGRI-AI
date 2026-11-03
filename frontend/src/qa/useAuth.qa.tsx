/**
 * QA-only auth provider (temporary).
 *
 * Swapped in by `vite.qa.config.ts` for `@/hooks/useAuth` so the protected
 * routes render with a signed-in, fully-profiled user and no Supabase session.
 */
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

type UserRole = "Farmer" | "Buyer" | "Retailer" | "Content Creator";

const user = {
  id: "qa-user-1",
  email: "qa@cenagri.test",
} as never;

const profile = {
  id: "qa-user-1",
  full_name: "QA Farmer",
  email: "qa@cenagri.test",
  phone: null,
  role: "Farmer" as UserRole,
  state: "Chhattisgarh",
  district: "Raipur",
  village: null,
  // Nested block the farmer pages read (`profile.details.district`, …).
  details: {
    state: "Chhattisgarh",
    district: "Raipur",
    village: "Abhanpur",
    crops: ["Paddy"],
    land_acres: 3,
  },
  avatar_url: null,
} as never;

const value = {
  session: { access_token: "qa", user } as never,
  user,
  profile,
  loading: false,
  configured: true,
  needsRole: false,
  needsDetails: false,
  completeRole: async () => { },
  saveDetails: async () => { },
  signInWithEmail: async () => { },
  signUpWithEmail: async () => ({ needsEmailConfirmation: false }),
  signInWithGoogle: async () => { },
  signOut: async () => { },
  resetPassword: async () => { },
  updatePassword: async () => { },
  refreshProfile: async () => { },
};

const QAContext = createContext(value);

export function AuthProvider({ children }: { children: ReactNode }) {
  const memo = useMemo(() => value, []);
  return <QAContext.Provider value={memo}>{children}</QAContext.Provider>;
}

export function useAuth() {
  return useContext(QAContext);
}

export function siteUrl(path = "/auth/callback") {
  return `${window.location.origin}${path}`;
}
