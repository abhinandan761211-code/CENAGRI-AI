// TEMPORARY QA harness — mounts the real FarmerDashboard signed in as a farmer
// located in Nadia, West Bengal. Only the Supabase network layer is stubbed
// (auth session + profile row); the mandi/weather calls go to the real backend
// through the dev proxy. Deleted after verification.
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

const DETAILS = { state: "West Bengal", district: "Nadia", village: "Karimpur", land_size: "2.5" };
const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "qa-farmer@example.test",
  created_at: "2026-01-01T00:00:00Z",
  user_metadata: { full_name: "QA Farmer", role: "Farmer", onboarded: true, details: DETAILS },
  app_metadata: {},
};
const SESSION = {
  access_token: "qa-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "qa-refresh-token",
  user: USER,
};

const MOD = (window as unknown as { __supabaseModule?: { createClient?: unknown } })
  .__supabaseModule;

if (!MOD?.createClient) {
  document.body.innerHTML = '<pre id="qa-error">QA: __supabaseModule hook missing in main.tsx</pre>';
} else {
  MOD.createClient = () => ({
    auth: {
      getSession: async () => ({ data: { session: SESSION }, error: null }),
      getUser: async () => ({ data: { user: USER }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }),
      updateUser: async () => ({ data: { user: USER }, error: null }),
      signOut: async () => ({ error: null }),
    },
    // profiles/farms tables: pretend they do not exist, which the app already
    // handles gracefully (it falls back to auth metadata for the profile).
    from: () => {
      const result = { data: null, error: { message: "qa stub", code: "QA", details: null, hint: null } };
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "upsert", "insert", "update", "delete"]) {
        builder[m] = () => builder;
      }
      builder.maybeSingle = async () => result;
      builder.single = async () => result;
      builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
      return builder;
    },
  });

  // Imported AFTER the stub is installed, so the module-level `createClient()`
  // in lib/supabase.ts (evaluated on import) picks it up.
  void (async () => {
    const { AuthProvider } = await import("@/hooks/useAuth");
    const { default: FarmerDashboard } = await import("@/pages/FarmerDashboard");
    await import("./index.css");
    createRoot(document.getElementById("root")!).render(
      <BrowserRouter>
        <AuthProvider>
          <FarmerDashboard />
        </AuthProvider>
      </BrowserRouter>
    );
    console.log("[qa] dashboard rendered");
  })();
}
