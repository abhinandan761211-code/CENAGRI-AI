// TEMPORARY QA harness — mounts the real FarmerDashboard on a public route so
// the mandi card can be screenshotted without a Supabase login. Deleted after.
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import FarmerDashboard from "@/pages/FarmerDashboard";
import { AuthProvider } from "@/hooks/useAuth";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <FarmerDashboard />
    </AuthProvider>
  </BrowserRouter>
);
