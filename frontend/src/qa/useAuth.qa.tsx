/**
 * QA-only auth provider (temporary) — role-switchable.
 *
 * Swapped in by `vite.qa.config.ts` for `@/hooks/useAuth`. The role and
 * signed-in state are read from localStorage so the login flow (sign in → land
 * on the account) can be exercised without Supabase:
 *
 *   localStorage.setItem("qa.role", "Buyer")
 *   localStorage.setItem("qa.signedIn", "1")
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type UserRole = "Farmer" | "Buyer" | "Retailer" | "Worker" | "Transporter" | "Warehouse" | "Equipment" | "Content Creator";

const ROLE_KEY = "qa.role";
const SIGNED_IN_KEY = "qa.signedIn";

function readRole(): UserRole {
  const saved = localStorage.getItem(ROLE_KEY) as UserRole | null;
  return saved ?? "Farmer";
}

function buildUser(role: UserRole) {
  return { id: "qa-user-1", email: "qa@kalika.test", user_metadata: { role } };
}

function buildProfile(role: UserRole) {
  return {
    id: "qa-user-1",
    full_name: "QA Farmer",
    email: "qa@kalika.test",
    phone: null,
    role,
    state: "Chhattisgarh",
    district: "Raipur",
    village: null,
    details: {
      state: "Chhattisgarh",
      district: "Raipur",
      village: "Abhanpur",
      crops: ["Paddy"],
      land_acres: 3,
    },
    avatar_url: null,
  };
}

const QAContext = createContext<Record<string, unknown>>({});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => localStorage.getItem(SIGNED_IN_KEY) === "1");
  const [role, setRole] = useState<UserRole>(readRole);

  const signInWithEmail = useCallback(async (email: string) => {
    if (email.includes("wrong")) throw new Error("Invalid login credentials");
    // `qa.delay` simulates a slow / not-yet-connected account so the
    // "Signing you in…" screen can be exercised.
    const delay = Number(localStorage.getItem("qa.delay") ?? 0);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const nextRole = readRole();
    setRole(nextRole);
    localStorage.setItem(SIGNED_IN_KEY, "1");
    setSignedIn(true);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(SIGNED_IN_KEY);
    setSignedIn(false);
  }, []);

  const value = useMemo(() => {
    const user = signedIn ? buildUser(role) : null;
    const profile = signedIn ? buildProfile(role) : null;
    return {
      session: signedIn ? { access_token: "qa", user } : null,
      user,
      profile,
      loading: false,
      configured: true,
      needsRole: false,
      needsDetails: false,
      completeRole: async () => { },
      saveDetails: async () => { },
      setCreatorMode: async () => true,
      signInWithEmail,
      signUpWithEmail: async () => ({ needsEmailConfirmation: false }),
      signInWithGoogle: async () => { },
      signOut,
      resetPassword: async () => { },
      updatePassword: async () => { },
      refreshProfile: async () => { },
    };
  }, [signedIn, role, signInWithEmail, signOut]);

  return <QAContext.Provider value={value}>{children}</QAContext.Provider>;
}

export function useAuth() {
  return useContext(QAContext) as never;
}

export function siteUrl(path = "/auth/callback") {
  return `${window.location.origin}${path}`;
}
