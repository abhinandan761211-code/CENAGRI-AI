import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { loadProfile } from "@/lib/profile";
import type { Profile, UserRole } from "@/types";

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role: UserRole;
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function assertClient() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your frontend .env file."
    );
  }
  return supabase;
}

/** Where Supabase should send users back after OAuth / email links. */
export function siteUrl(path = "/auth/callback") {
  const configured = import.meta.env.VITE_SITE_URL?.trim();
  const origin = configured ? configured.replace(/\/$/, "") : window.location.origin;
  return `${origin}${path}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const syncProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await loadProfile(user));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await syncProfile(data.session?.user ?? null);
      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      void syncProfile(nextSession?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [syncProfile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await assertClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback<AuthValue["signUpWithEmail"]>(async (params) => {
    const { data, error } = await assertClient().auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        emailRedirectTo: siteUrl("/auth/callback"),
        data: {
          full_name: params.fullName,
          phone: params.phone ?? "",
          role: params.role,
        },
      },
    });
    if (error) throw error;
    // When email confirmation is enabled Supabase returns no session.
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async (next = "/dashboard") => {
    const { error } = await assertClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl("/auth/callback")}?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await assertClient().auth.signOut();
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await assertClient().auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl("/reset-password"),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await assertClient().auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    await syncProfile(user);
  }, [syncProfile]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      configured: isSupabaseConfigured,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
