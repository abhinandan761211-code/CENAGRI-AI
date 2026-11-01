import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import CompleteProfile from "./pages/CompleteProfile";
import Dashboard from "./pages/Dashboard";
import FarmerDashboard from "./pages/FarmerDashboard";
import BuyerDashboard from "./pages/BuyerDashboard";
import CropAdvisory from "./pages/CropAdvisory";
import MyFarm from "./pages/MyFarm";
import WeatherAlerts from "./pages/WeatherAlerts";
import Marketplace from "./pages/Marketplace";
import CenFriend from "./pages/CenFriend";
import EquipmentRental from "./pages/EquipmentRental";
import TransportServices from "./pages/TransportServices";
import StorageWarehouse from "./pages/StorageWarehouse";
import RetailerHome from "./pages/retailer/RetailerHome";
import RetailerShop from "./pages/retailer/RetailerShop";
import RetailerProducts from "./pages/retailer/RetailerProducts";
import RetailerOrders from "./pages/retailer/RetailerOrders";
import RetailerInventory from "./pages/retailer/RetailerInventory";
import RetailerAnalytics from "./pages/retailer/RetailerAnalytics";
import RetailerOffers from "./pages/retailer/RetailerOffers";
import RetailerProcurement from "./pages/retailer/RetailerProcurement";
import RetailerMessages from "./pages/retailer/RetailerMessages";
import RetailerNotifications from "./pages/retailer/RetailerNotifications";
import RetailerSettings from "./pages/retailer/RetailerSettings";
import RetailerHelp from "./pages/retailer/RetailerHelp";
import CreatorHome from "./pages/creator/CreatorHome";
import CreatorChannel from "./pages/creator/CreatorChannel";
import CreatorUpload from "./pages/creator/CreatorUpload";
import CreatorShorts from "./pages/creator/CreatorShorts";
import CreatorAnalytics from "./pages/creator/CreatorAnalytics";
import CreatorComments from "./pages/creator/CreatorComments";
import CreatorMessages from "./pages/creator/CreatorMessages";
import CreatorNotifications from "./pages/creator/CreatorNotifications";
import CreatorSettings from "./pages/creator/CreatorSettings";
import CreatorMonetization from "./pages/creator/CreatorMonetization";
import CreatorLive from "./pages/creator/CreatorLive";
import VideoHub from "./pages/creator/VideoHub";
import WatchVideo from "./pages/creator/WatchVideo";

/** Keeps the landing page anchors working after client-side navigation. */
function ScrollToHash() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.replace("#", ""));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [hash, pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToHash />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/complete-profile" element={<CompleteProfile />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer-account"
            element={
              <ProtectedRoute>
                <FarmerDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/buyer-account"
            element={
              <ProtectedRoute>
                <BuyerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Retailer account — inputs, stock and customers. Kept separate from
              the buyer account: a retailer sells inputs, a buyer sources produce. */}
          <Route path="/retailer" element={<ProtectedRoute><RetailerHome /></ProtectedRoute>} />
          <Route path="/retailer/shop" element={<ProtectedRoute><RetailerShop /></ProtectedRoute>} />
          <Route path="/retailer/products" element={<ProtectedRoute><RetailerProducts /></ProtectedRoute>} />
          <Route path="/retailer/orders" element={<ProtectedRoute><RetailerOrders /></ProtectedRoute>} />
          <Route path="/retailer/inventory" element={<ProtectedRoute><RetailerInventory /></ProtectedRoute>} />
          <Route path="/retailer/analytics" element={<ProtectedRoute><RetailerAnalytics /></ProtectedRoute>} />
          <Route path="/retailer/offers" element={<ProtectedRoute><RetailerOffers /></ProtectedRoute>} />
          <Route path="/retailer/buy-from-farmers" element={<ProtectedRoute><RetailerProcurement /></ProtectedRoute>} />
          <Route path="/retailer/messages" element={<ProtectedRoute><RetailerMessages /></ProtectedRoute>} />
          <Route path="/retailer/notifications" element={<ProtectedRoute><RetailerNotifications /></ProtectedRoute>} />
          <Route path="/retailer/settings" element={<ProtectedRoute><RetailerSettings /></ProtectedRoute>} />
          <Route path="/retailer/help" element={<ProtectedRoute><RetailerHelp /></ProtectedRoute>} />

          {/* Content Creator studio. The hub, watch page and public channel are
              open to every signed-in role; the studio pages assume a channel. */}
          <Route path="/creator" element={<ProtectedRoute><CreatorHome /></ProtectedRoute>} />
          <Route path="/creator/channel" element={<ProtectedRoute><CreatorChannel /></ProtectedRoute>} />
          <Route path="/creator/upload" element={<ProtectedRoute><CreatorUpload /></ProtectedRoute>} />
          <Route path="/creator/shorts" element={<ProtectedRoute><CreatorShorts /></ProtectedRoute>} />
          <Route path="/creator/live" element={<ProtectedRoute><CreatorLive /></ProtectedRoute>} />
          <Route path="/creator/analytics" element={<ProtectedRoute><CreatorAnalytics /></ProtectedRoute>} />
          <Route path="/creator/monetization" element={<ProtectedRoute><CreatorMonetization /></ProtectedRoute>} />
          <Route path="/creator/comments" element={<ProtectedRoute><CreatorComments /></ProtectedRoute>} />
          <Route path="/creator/messages" element={<ProtectedRoute><CreatorMessages /></ProtectedRoute>} />
          <Route path="/creator/notifications" element={<ProtectedRoute><CreatorNotifications /></ProtectedRoute>} />
          <Route path="/creator/settings" element={<ProtectedRoute><CreatorSettings /></ProtectedRoute>} />

          {/* Kisan Video Hub — public discovery for all roles. */}
          <Route path="/video-hub" element={<ProtectedRoute><VideoHub /></ProtectedRoute>} />
          <Route path="/watch/:id" element={<ProtectedRoute><WatchVideo /></ProtectedRoute>} />
          <Route path="/channel/:id" element={<ProtectedRoute><CreatorChannel /></ProtectedRoute>} />

          {/* Farmer feature pages — every sidebar entry has a real route. */}
          <Route path="/my-farm" element={<ProtectedRoute><MyFarm /></ProtectedRoute>} />
          <Route path="/advisory" element={<ProtectedRoute><CropAdvisory /></ProtectedRoute>} />
          <Route path="/weather" element={<ProtectedRoute><WeatherAlerts /></ProtectedRoute>} />
          <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
          <Route path="/cenfriend" element={<ProtectedRoute><CenFriend /></ProtectedRoute>} />
          <Route path="/equipment" element={<ProtectedRoute><EquipmentRental /></ProtectedRoute>} />
          <Route path="/transport" element={<ProtectedRoute><TransportServices /></ProtectedRoute>} />
          <Route path="/storage" element={<ProtectedRoute><StorageWarehouse /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
