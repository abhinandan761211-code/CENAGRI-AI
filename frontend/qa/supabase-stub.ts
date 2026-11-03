/**
 * QA-only Supabase stub: a signed-in session, no network.
 * Reached through `@/lib/supabase` when the QA config rewrites @lib/creator.
 */
const QA_USER = {
  id: "u-qa",
  email: "qa@cenagri.test",
  aud: "authenticated",
  role: "authenticated",
  created_at: new Date().toISOString(),
  user_metadata: {
    full_name: "QA Farmer",
    role: "Farmer",
    onboarded: true,
    details: { state: "Bihar" },
  },
  app_metadata: {},
};

const QA_SESSION = {
  access_token: "qa",
  refresh_token: "qa",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: QA_USER,
};

const PROFILE = {
  id: "u-qa",
  full_name: "QA Farmer",
  email: "qa@cenagri.test",
  phone: null,
  role: "Farmer",
  avatar_url: null,
  details: { state: "Bihar" },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const isSupabaseConfigured = true;

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: QA_SESSION }, error: null }),
    getUser: async () => ({ data: { user: QA_USER }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }),
    signOut: async () => ({ error: null }),
  },
  from: () => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    b.select = self;
    b.eq = self;
    b.in = self;
    b.order = self;
    b.limit = async () => ({ data: [], error: null });
    b.range = async () => ({ data: [], error: null });
    b.maybeSingle = async () => ({ data: PROFILE, error: null });
    b.single = async () => ({ data: PROFILE, error: null });
    b.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: [PROFILE], error: null }).then(res);
    return b;
  },
  rpc: async () => ({ data: null, error: null }),
};
