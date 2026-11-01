import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading, configured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream">
        <Loader2 className="h-7 w-7 animate-spin text-brand-700" />
      </div>
    );
  }

  if (!configured || !user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  /**
   * Signed in but the current account's profile has not loaded yet. Rendering
   * the page now is what made a role page (or its redirect) flash with the
   * previous account's data before correcting itself a moment later.
   */
  if (profile?.id !== user.id) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream">
        <Loader2 className="h-7 w-7 animate-spin text-brand-700" />
      </div>
    );
  }

  return <>{children}</>;
}
