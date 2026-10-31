import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { loadProfile } from "@/lib/profile";
import { USER_ROLES } from "@/types";
import type { Profile, UserRole } from "@/types";

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  /** Signed in but no role picked yet (always true for a fresh Google sign-in). */
  needsRole: boolean;
  /** Signed in, has a role, but the role-specific questions were never answered. */
  needsDetails: boolean;
  completeRole: (role: UserRole, details?: Record<string, string>) => Promise<void>;
  saveDetails: (details: Record<string, string>) => Promise<void>;
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

  const completeRole = useCallback(async (role: UserRole, roleDetails: Record<string, string> = {}) => {
    const client = assertClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error("You are not signed in.");

    const { error: authError } = await client.auth.updateUser({
      data: { role, onboarded: true, details: roleDetails },
    });
    if (authError) throw authError;

    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          id: user.id,
          role,
          details: roleDetails,
          full_name:
            (user.user_metadata?.full_name as string | undefined) ??
            (user.user_metadata?.name as string | undefined) ??
            null,
          email: user.email ?? null,
          avatar_url:
            (user.user_metadata?.avatar_url as string | undefined) ??
            (user.user_metadata?.picture as string | undefined) ??
            null,
        },
        { onConflict: "id" }
      )
      .select()
      .maybeSingle();
    if (error) throw error;

    if (data) setProfile(data as Profile);
    else await syncProfile(await client.auth.getUser().then((r) => r.data.user));
  }, [syncProfile]);

  const saveDetails = useCallback(
    async (profileDetails: Record<string, string>) => {
      const client = assertClient();
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) throw new Error("You are not signed in.");

      const { error: authError } = await client.auth.updateUser({
        data: { details: profileDetails, onboarded: true },
      });
      if (authError) throw authError;

      const { data, error } = await client
        .from("profiles")
        .upsert({ id: user.id, details: profileDetails }, { onConflict: "id" })
        .select()
        .maybeSingle();
      if (error) throw error;

      if (data) setProfile(data as Profile);
      else await syncProfile(await client.auth.getUser().then((r) => r.data.user));
    },
    [syncProfile]
  );

  // Metadata is the source of truth right after OAuth (the profile row may not
  // exist yet), while the profile row wins once the role step has been saved.
  const metaRole = session?.user?.user_metadata?.role;
  const hasValidRole =
    (profile?.role && (USER_ROLES as readonly string[]).includes(profile.role)) ||
    (typeof metaRole === "string" && (USER_ROLES as readonly string[]).includes(metaRole));
  const needsRole = Boolean(session) && !hasValidRole;

  // Metadata is the fallback for accounts whose profile row is missing or was
  // created before the details column existed.
  const metaDetails = (session?.user?.user_metadata?.details ?? null) as
    | Record<string, string>
    | null;
  const filledDetails = profile?.details ?? metaDetails;
  const hasDetails = Boolean(filledDetails && Object.keys(filledDetails).length > 0);
  const needsDetails = Boolean(session) && !needsRole && !hasDetails;

  // If the role/details live only in auth metadata (older accounts, or the DB
  // trigger is not installed yet) show them instead of empty labels.
  const effectiveProfile = useMemo<Profile | null>(() => {
    if (!session) return null;
    const role = profile?.role ?? (typeof metaRole === "string" ? metaRole : null);
    const meta = session.user.user_metadata ?? {};

    return {
      id: profile?.id ?? session.user.id,
      full_name:
        profile?.full_name ??
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        null,
      email: profile?.email ?? session.user.email ?? null,
      phone: profile?.phone ?? null,
      role,
      avatar_url:
        profile?.avatar_url ??
        (meta.avatar_url as string | undefined) ??
        (meta.picture as string | undefined) ??
        null,
      details: filledDetails,
      created_at: profile?.created_at ?? "",
      updated_at: profile?.updated_at ?? "",
    };
  }, [session, profile, metaRole, filledDetails]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile: effectiveProfile,
      loading,
      configured: isSupabaseConfigured,
      needsRole,
      needsDetails,
      completeRole,
      saveDetails,
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
      effectiveProfile,
      loading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
      refreshProfile,
      needsRole,
      needsDetails,
      completeRole,
      saveDetails,
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
