import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCreatorMode } from "@/hooks/useCreatorMode";

/**
 * Gate for the CREATE side of the Kisan Video Hub.
 *
 * Watching the hub is open to every signed-in account, so `/video-hub` itself
 * is not wrapped in this. Everything that publishes — the studio panel, upload,
 * shorts, live, analytics, comments, messages, monetisation — is.
 *
 * An account without Creator Mode is sent back to the watch feed rather than the
 * login screen: it is signed in and allowed to be here, just not to publish.
 *
 * The `?mode=create` form of the hub URL is checked separately by VideoHub,
 * because that is a query parameter on a page that must stay reachable.
 */
export default function CreatorModeRoute({ children }: { children: ReactNode }) {
  const { enabled } = useCreatorMode();
  const location = useLocation();

  if (!enabled) {
    return <Navigate to="/video-hub?creator=off" replace />;
  }

  void location;
  return <>{children}</>;
}
