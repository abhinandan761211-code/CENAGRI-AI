import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { LanguageProvider } from "./i18n/LanguageContext";
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
import CropAdvisory from "./pages/farmer/AdvisoryPage";
import MyFarm from "./pages/farmer/FarmPage";
import CropManagement from "./pages/farmer/CropPage";
import CropCalendar from "./pages/farmer/CalendarPage";
import DiseaseDetection from "./pages/farmer/DiseasePage";
import WeatherAlerts from "./pages/farmer/WeatherPage";
import MandiPage from "./pages/farmer/MandiPage";
import SoilPage from "./pages/farmer/SoilPage";
import IrrigationPage from "./pages/farmer/IrrigationPage";
import ActivitiesPage from "./pages/farmer/ActivitiesPage";
import OrdersSalesPage from "./pages/farmer/OrdersSalesPage";
import ExpensesPage from "./pages/farmer/ExpensesPage";
import LabourPage from "./pages/farmer/LabourPage";
import SchemesPage from "./pages/farmer/SchemesPage";
import InsurancePage from "./pages/farmer/InsurancePage";
import GroupsPage from "./pages/farmer/GroupsPage";
import MessagesPage, { NotificationsPage as FarmerNotificationsPage } from "./pages/farmer/MessagesPage";
import ProfilePage from "./pages/farmer/ProfilePage";
import PersonalPage from "./pages/farmer/PersonalPage";
import FarmingInfoPage from "./pages/farmer/FarmingInfoPage";
import DocumentsPage from "./pages/farmer/DocumentsPage";
import LanguagePage from "./pages/farmer/LanguagePage";
import NotificationSettingsPage from "./pages/farmer/NotificationSettingsPage";
import PrivacyPage from "./pages/farmer/PrivacyPage";
import HelpPage from "./pages/farmer/HelpPage";
import AccountManagePage from "./pages/farmer/AccountManagePage";
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

// ── Agricultural Worker account ──────────────────────────────────────────
import WorkerHome from "./pages/worker/WorkerHome";
import WorkerJobs from "./pages/worker/WorkerJobs";
import WorkerJobDetail from "./pages/worker/WorkerJobDetail";
import WorkerApplications from "./pages/worker/WorkerApplications";
import WorkerActiveWork from "./pages/worker/WorkerActiveWork";
import WorkerCalendar from "./pages/worker/WorkerCalendar";
import WorkerProfilePage from "./pages/worker/WorkerProfilePage";
import WorkerEarnings from "./pages/worker/WorkerEarnings";
import WorkerReviews from "./pages/worker/WorkerReviews";
import WorkerMessages from "./pages/worker/WorkerMessages";
import WorkerNotifications from "./pages/worker/WorkerNotifications";

// ── Employer (job posting) side of the worker module ──────────────────────
import EmployerHome from "./pages/employer/EmployerHome";
import EmployerPostJob from "./pages/employer/EmployerPostJob";
import EmployerJobs from "./pages/employer/EmployerJobs";
import EmployerApplicants from "./pages/employer/EmployerApplicants";
import EmployerMessages from "./pages/employer/EmployerMessages";
import EmployerNotifications from "./pages/employer/EmployerNotifications";

// ── Transporter (agricultural logistics) account ──────────────────────────
import TransporterHome from "./pages/transporter/TransporterHome";
import TransporterRequests from "./pages/transporter/TransporterRequests";
import TransporterRequestDetail from "./pages/transporter/TransporterRequestDetail";
import TransporterBookings from "./pages/transporter/TransporterBookings";
import TransporterTrips from "./pages/transporter/TransporterTrips";
import TransporterTripDetail from "./pages/transporter/TransporterTripDetail";
import TransporterTracking from "./pages/transporter/TransporterTracking";
import TransporterVehicles from "./pages/transporter/TransporterVehicles";
import TransporterDrivers from "./pages/transporter/TransporterDrivers";
import TransporterAvailability from "./pages/transporter/TransporterAvailability";
import TransporterEarnings from "./pages/transporter/TransporterEarnings";
import TransporterInvoices from "./pages/transporter/TransporterInvoices";
import TransporterReviews from "./pages/transporter/TransporterReviews";
import TransporterMessages from "./pages/transporter/TransporterMessages";
import TransporterProfilePage from "./pages/transporter/TransporterProfilePage";
import TransporterSettings from "./pages/transporter/TransporterSettings";
import CreatorChannel from "./pages/creator/CreatorChannel";

// ── Warehouse (agricultural storage & warehousing) account ────────────────
import WarehouseHome from "./pages/warehouse/WarehouseHome";
import WarehouseList from "./pages/warehouse/WarehouseList";
import WarehouseDetail from "./pages/warehouse/WarehouseDetail";
import WarehouseRequests from "./pages/warehouse/WarehouseRequests";
import WarehouseBookings from "./pages/warehouse/WarehouseBookings";
import WarehouseInventory from "./pages/warehouse/WarehouseInventory";
import WarehouseInward from "./pages/warehouse/WarehouseInward";
import WarehouseOutward from "./pages/warehouse/WarehouseOutward";
import WarehouseMonitoring from "./pages/warehouse/WarehouseMonitoring";
import WarehouseInspections from "./pages/warehouse/WarehouseInspections";
import WarehousePricing from "./pages/warehouse/WarehousePricing";
import WarehouseCustomers from "./pages/warehouse/WarehouseCustomers";
import WarehouseStaffPage from "./pages/warehouse/WarehouseStaff";
import WarehouseTransport from "./pages/warehouse/WarehouseTransport";
import WarehouseEarnings from "./pages/warehouse/WarehouseEarnings";
import WarehouseDocuments from "./pages/warehouse/WarehouseDocuments";
import WarehouseReports from "./pages/warehouse/WarehouseReports";
import WarehouseMessages from "./pages/warehouse/WarehouseMessages";
import WarehouseProfile from "./pages/warehouse/WarehouseProfile";
import WarehouseSettings from "./pages/warehouse/WarehouseSettings";
import CreatorHomePanel from "./components/creator/CreatorHomePanel";
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
import ShortsPlayer from "./pages/creator/ShortsPlayer";

// ── Equipment owner (agricultural machinery rental) account ───────────────
import EquipmentHome from "./pages/equipment/EquipmentHome";
import EquipmentList from "./pages/equipment/EquipmentList";
import EquipmentForm from "./pages/equipment/EquipmentForm";
import EquipmentRequests from "./pages/equipment/EquipmentRequests";
import EquipmentBookings from "./pages/equipment/EquipmentBookings";
import EquipmentCalendar from "./pages/equipment/EquipmentCalendar";
import EquipmentOperators from "./pages/equipment/EquipmentOperators";
import EquipmentMaintenance from "./pages/equipment/EquipmentMaintenance";
import EquipmentAvailability from "./pages/equipment/EquipmentAvailability";
import EquipmentLocation from "./pages/equipment/EquipmentLocation";
import EquipmentEarnings from "./pages/equipment/EquipmentEarnings";
import EquipmentAgreements from "./pages/equipment/EquipmentAgreements";
import EquipmentDocuments from "./pages/equipment/EquipmentDocuments";
import EquipmentReviews from "./pages/equipment/EquipmentReviews";
import EquipmentMessages from "./pages/equipment/EquipmentMessages";
import EquipmentProfile from "./pages/equipment/EquipmentProfile";
import EquipmentSettings from "./pages/equipment/EquipmentSettings";

// ── Central admin panel ──────────────────────────────────────────────────
// Lazy-loaded: a farmer never downloads the admin bundle, and the panel is
// only fetched when an admin actually opens /admin.
import AdminGuard from "./components/admin/AdminGuard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminRoles from "./pages/admin/AdminRoles";
import AdminKyc from "./pages/admin/AdminKyc";
import AdminContent from "./pages/admin/AdminContent";
import AdminVideoHub from "./pages/admin/AdminVideoHub";
import AdminCreators from "./pages/admin/AdminCreators";
import AdminMarketplace from "./pages/admin/AdminMarketplace";
import AdminCenFriend from "./pages/admin/AdminCenFriend";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminAgriData from "./pages/admin/AdminAgriData";
import AdminWeather from "./pages/admin/AdminWeather";
import AdminAiServices from "./pages/admin/AdminAiServices";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminSupport from "./pages/admin/AdminSupport";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminCms from "./pages/admin/AdminCms";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminSecurity from "./pages/admin/AdminSecurity";
import AdminHealth from "./pages/admin/AdminHealth";

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
      {/* Outside <AuthProvider>: the guest pages (landing, login, signup) read
          the chosen language before anyone has signed in. */}
      <LanguageProvider>
        {/* Language wraps auth: the guest pages and the shell share one switcher. */}
        <AuthProvider>
        {/* Must stay inside <BrowserRouter>: it reads useLocation(), and
            outside a router that throws and blanks the entire page. */}
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

          {/* Agricultural Worker account — find work, apply, work, get paid.
              One unified account; the role guard lives in WorkerLayout. */}
          <Route path="/worker" element={<ProtectedRoute><WorkerHome /></ProtectedRoute>} />
          <Route path="/worker/jobs" element={<ProtectedRoute><WorkerJobs /></ProtectedRoute>} />
          <Route path="/worker/jobs/:id" element={<ProtectedRoute><WorkerJobDetail /></ProtectedRoute>} />
          <Route path="/worker/applications" element={<ProtectedRoute><WorkerApplications /></ProtectedRoute>} />
          <Route path="/worker/active-work" element={<ProtectedRoute><WorkerActiveWork /></ProtectedRoute>} />
          <Route path="/worker/calendar" element={<ProtectedRoute><WorkerCalendar /></ProtectedRoute>} />
          <Route path="/worker/profile" element={<ProtectedRoute><WorkerProfilePage /></ProtectedRoute>} />
          <Route path="/worker/earnings" element={<ProtectedRoute><WorkerEarnings /></ProtectedRoute>} />
          <Route path="/worker/reviews" element={<ProtectedRoute><WorkerReviews /></ProtectedRoute>} />
          <Route path="/worker/messages" element={<ProtectedRoute><WorkerMessages /></ProtectedRoute>} />
          <Route path="/worker/notifications" element={<ProtectedRoute><WorkerNotifications /></ProtectedRoute>} />

          {/* Employer side — any account that owns land or a farm business can
              hire. Scoping comes from employer_id = auth.uid() in RLS, not from
              an account-type check, so no existing dashboard needs to change. */}
          <Route path="/employer" element={<ProtectedRoute><EmployerHome /></ProtectedRoute>} />
          <Route path="/employer/post" element={<ProtectedRoute><EmployerPostJob /></ProtectedRoute>} />
          <Route path="/employer/jobs" element={<ProtectedRoute><EmployerJobs /></ProtectedRoute>} />
          <Route path="/employer/applicants" element={<ProtectedRoute><EmployerApplicants /></ProtectedRoute>} />
          <Route path="/employer/messages" element={<ProtectedRoute><EmployerMessages /></ProtectedRoute>} />
          <Route path="/employer/notifications" element={<ProtectedRoute><EmployerNotifications /></ProtectedRoute>} />

          {/* Transporter account — agricultural logistics. Any account that owns
              a vehicle can use it; data is scoped by auth.uid() in RLS. */}
          <Route path="/transporter" element={<ProtectedRoute><TransporterHome /></ProtectedRoute>} />
          <Route path="/transporter/requests" element={<ProtectedRoute><TransporterRequests /></ProtectedRoute>} />
          <Route path="/transporter/requests/:id" element={<ProtectedRoute><TransporterRequestDetail /></ProtectedRoute>} />
          <Route path="/transporter/bookings" element={<ProtectedRoute><TransporterBookings /></ProtectedRoute>} />
          <Route path="/transporter/trips" element={<ProtectedRoute><TransporterTrips /></ProtectedRoute>} />
          <Route path="/transporter/trips/:id" element={<ProtectedRoute><TransporterTripDetail /></ProtectedRoute>} />
          <Route path="/transporter/tracking" element={<ProtectedRoute><TransporterTracking /></ProtectedRoute>} />
          <Route path="/transporter/vehicles" element={<ProtectedRoute><TransporterVehicles /></ProtectedRoute>} />
          <Route path="/transporter/drivers" element={<ProtectedRoute><TransporterDrivers /></ProtectedRoute>} />
          <Route path="/transporter/availability" element={<ProtectedRoute><TransporterAvailability /></ProtectedRoute>} />
          <Route path="/transporter/earnings" element={<ProtectedRoute><TransporterEarnings /></ProtectedRoute>} />
          <Route path="/transporter/invoices" element={<ProtectedRoute><TransporterInvoices /></ProtectedRoute>} />
          <Route path="/transporter/reviews" element={<ProtectedRoute><TransporterReviews /></ProtectedRoute>} />
          <Route path="/transporter/messages" element={<ProtectedRoute><TransporterMessages /></ProtectedRoute>} />
          <Route path="/transporter/profile" element={<ProtectedRoute><TransporterProfilePage /></ProtectedRoute>} />
          <Route path="/transporter/settings" element={<ProtectedRoute><TransporterSettings /></ProtectedRoute>} />

          {/* Warehouse account — agricultural storage and warehousing. What makes
              an account a warehouse owner is that it owns a `warehouses` row;
              everything is scoped to auth.uid() by RLS in warehouse.sql. */}
          <Route path="/warehouse" element={<ProtectedRoute><WarehouseHome /></ProtectedRoute>} />
          <Route path="/warehouse/warehouses" element={<ProtectedRoute><WarehouseList /></ProtectedRoute>} />
          <Route path="/warehouse/warehouses/:id" element={<ProtectedRoute><WarehouseDetail /></ProtectedRoute>} />
          <Route path="/warehouse/requests" element={<ProtectedRoute><WarehouseRequests /></ProtectedRoute>} />
          <Route path="/warehouse/bookings" element={<ProtectedRoute><WarehouseBookings /></ProtectedRoute>} />
          <Route path="/warehouse/inventory" element={<ProtectedRoute><WarehouseInventory /></ProtectedRoute>} />
          <Route path="/warehouse/inward" element={<ProtectedRoute><WarehouseInward /></ProtectedRoute>} />
          <Route path="/warehouse/outward" element={<ProtectedRoute><WarehouseOutward /></ProtectedRoute>} />
          <Route path="/warehouse/monitoring" element={<ProtectedRoute><WarehouseMonitoring /></ProtectedRoute>} />
          <Route path="/warehouse/inspections" element={<ProtectedRoute><WarehouseInspections /></ProtectedRoute>} />
          <Route path="/warehouse/pricing" element={<ProtectedRoute><WarehousePricing /></ProtectedRoute>} />
          <Route path="/warehouse/customers" element={<ProtectedRoute><WarehouseCustomers /></ProtectedRoute>} />
          <Route path="/warehouse/staff" element={<ProtectedRoute><WarehouseStaffPage /></ProtectedRoute>} />
          <Route path="/warehouse/transport" element={<ProtectedRoute><WarehouseTransport /></ProtectedRoute>} />
          <Route path="/warehouse/earnings" element={<ProtectedRoute><WarehouseEarnings /></ProtectedRoute>} />
          <Route path="/warehouse/documents" element={<ProtectedRoute><WarehouseDocuments /></ProtectedRoute>} />
          <Route path="/warehouse/reports" element={<ProtectedRoute><WarehouseReports /></ProtectedRoute>} />
          <Route path="/warehouse/messages" element={<ProtectedRoute><WarehouseMessages /></ProtectedRoute>} />
          <Route path="/warehouse/profile" element={<ProtectedRoute><WarehouseProfile /></ProtectedRoute>} />
          <Route path="/warehouse/settings" element={<ProtectedRoute><WarehouseSettings /></ProtectedRoute>} />

          {/* Equipment owner account — agricultural machinery rental. What makes
              an account an owner is that it owns an `equipment` row; every query
              is scoped to auth.uid() by RLS in equipment.sql. Overlap prevention
              lives in the database triggers, not in these screens.

              Mounted under /equipment-owner because /equipment and /transport
              below are the farmer-facing "find a machine / find a truck" pages.
              Two routes with the same path would silently shadow each other. */}
          <Route path="/equipment-owner" element={<ProtectedRoute><EquipmentHome /></ProtectedRoute>} />
          <Route path="/equipment-owner/equipment" element={<ProtectedRoute><EquipmentList /></ProtectedRoute>} />
          <Route path="/equipment-owner/equipment/new" element={<ProtectedRoute><EquipmentForm /></ProtectedRoute>} />
          <Route path="/equipment-owner/equipment/:id" element={<ProtectedRoute><EquipmentForm /></ProtectedRoute>} />
          <Route path="/equipment-owner/requests" element={<ProtectedRoute><EquipmentRequests /></ProtectedRoute>} />
          <Route path="/equipment-owner/bookings" element={<ProtectedRoute><EquipmentBookings /></ProtectedRoute>} />
          <Route path="/equipment-owner/calendar" element={<ProtectedRoute><EquipmentCalendar /></ProtectedRoute>} />
          <Route path="/equipment-owner/operators" element={<ProtectedRoute><EquipmentOperators /></ProtectedRoute>} />
          <Route path="/equipment-owner/maintenance" element={<ProtectedRoute><EquipmentMaintenance /></ProtectedRoute>} />
          <Route path="/equipment-owner/availability" element={<ProtectedRoute><EquipmentAvailability /></ProtectedRoute>} />
          <Route path="/equipment-owner/location" element={<ProtectedRoute><EquipmentLocation /></ProtectedRoute>} />
          <Route path="/equipment-owner/earnings" element={<ProtectedRoute><EquipmentEarnings /></ProtectedRoute>} />
          <Route path="/equipment-owner/agreements" element={<ProtectedRoute><EquipmentAgreements /></ProtectedRoute>} />
          <Route path="/equipment-owner/documents" element={<ProtectedRoute><EquipmentDocuments /></ProtectedRoute>} />
          <Route path="/equipment-owner/reviews" element={<ProtectedRoute><EquipmentReviews /></ProtectedRoute>} />
          <Route path="/equipment-owner/messages" element={<ProtectedRoute><EquipmentMessages /></ProtectedRoute>} />
          <Route path="/equipment-owner/profile" element={<ProtectedRoute><EquipmentProfile /></ProtectedRoute>} />
          <Route path="/equipment-owner/settings" element={<ProtectedRoute><EquipmentSettings /></ProtectedRoute>} />

          {/* Content Creator module. Watching and creating are ONE screen —
              `/video-hub` with `?mode=create` — because whoever can watch a
              video can also publish one. `/creator` is kept as a redirect into
              the Create mode of that page, so old links still land right. */}
          <Route path="/creator" element={<Navigate to="/video-hub?mode=create" replace />} />
          {/* Alias for the Create mode panel, kept for old internal links. */}
          <Route path="/creator/studio" element={<ProtectedRoute><CreatorHomePanel /></ProtectedRoute>} />
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

          {/* Kisan Video Hub — one page for watching and creating. */}
          <Route path="/video-hub" element={<ProtectedRoute><VideoHub /></ProtectedRoute>} />
          <Route path="/shorts/:id" element={<ProtectedRoute><ShortsPlayer /></ProtectedRoute>} />
          <Route path="/watch/:id" element={<ProtectedRoute><WatchVideo /></ProtectedRoute>} />
          <Route path="/channel/:id" element={<ProtectedRoute><CreatorChannel /></ProtectedRoute>} />

          {/* ── Farmer feature pages — every sidebar entry has a real route,
              all rendered inside the shared <FarmerShell> chrome. ── */}
          <Route path="/my-farm" element={<ProtectedRoute><MyFarm /></ProtectedRoute>} />
          <Route path="/crops" element={<ProtectedRoute><CropManagement /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><CropCalendar /></ProtectedRoute>} />
          <Route path="/disease-detection" element={<ProtectedRoute><DiseaseDetection /></ProtectedRoute>} />
          <Route path="/advisory" element={<ProtectedRoute><CropAdvisory /></ProtectedRoute>} />
          <Route path="/weather" element={<ProtectedRoute><WeatherAlerts /></ProtectedRoute>} />
          <Route path="/soil-health" element={<ProtectedRoute><SoilPage /></ProtectedRoute>} />
          <Route path="/irrigation" element={<ProtectedRoute><IrrigationPage /></ProtectedRoute>} />
          <Route path="/farm-activities" element={<ProtectedRoute><ActivitiesPage /></ProtectedRoute>} />

          {/* Market & business */}
          <Route path="/mandi" element={<ProtectedRoute><MandiPage /></ProtectedRoute>} />
          <Route path="/orders-sales" element={<ProtectedRoute><OrdersSalesPage /></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />

          {/* Farming services */}
          <Route path="/farm-labour" element={<ProtectedRoute><LabourPage /></ProtectedRoute>} />
          <Route path="/schemes" element={<ProtectedRoute><SchemesPage /></ProtectedRoute>} />
          <Route path="/crop-insurance" element={<ProtectedRoute><InsurancePage /></ProtectedRoute>} />

          {/* Community */}
          <Route path="/farming-groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><FarmerNotificationsPage /></ProtectedRoute>} />

          {/* My Account */}
          <Route path="/account" element={<Navigate to="/account/profile" replace />} />
          <Route path="/account/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/account/personal" element={<ProtectedRoute><PersonalPage /></ProtectedRoute>} />
          <Route path="/account/farming" element={<ProtectedRoute><FarmingInfoPage /></ProtectedRoute>} />
          <Route path="/account/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
          <Route path="/account/language" element={<ProtectedRoute><LanguagePage /></ProtectedRoute>} />
          <Route path="/account/notifications" element={<ProtectedRoute><NotificationSettingsPage /></ProtectedRoute>} />
          <Route path="/account/privacy" element={<ProtectedRoute><PrivacyPage /></ProtectedRoute>} />
          <Route path="/account/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
          <Route path="/account/manage" element={<ProtectedRoute><AccountManagePage /></ProtectedRoute>} />

          <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
          <Route path="/cenfriend" element={<ProtectedRoute><CenFriend /></ProtectedRoute>} />
          <Route path="/equipment" element={<ProtectedRoute><EquipmentRental /></ProtectedRoute>} />
          <Route path="/transport" element={<ProtectedRoute><TransportServices /></ProtectedRoute>} />
          <Route path="/storage" element={<ProtectedRoute><StorageWarehouse /></ProtectedRoute>} />

          {/* ── Central admin panel ──
              /admin is a separate shell (AdminLayout) inside the same app,
              authorised through the existing Supabase session plus an
              `admin_users` role the backend verifies. */}
          <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
          <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
          <Route path="/admin/roles" element={<AdminGuard><AdminRoles /></AdminGuard>} />
          <Route path="/admin/kyc" element={<AdminGuard><AdminKyc /></AdminGuard>} />
          <Route path="/admin/content" element={<AdminGuard><AdminContent /></AdminGuard>} />
          <Route path="/admin/video-hub" element={<AdminGuard><AdminVideoHub /></AdminGuard>} />
          <Route path="/admin/creators" element={<AdminGuard><AdminCreators /></AdminGuard>} />
          <Route path="/admin/marketplace" element={<AdminGuard><AdminMarketplace /></AdminGuard>} />
          <Route path="/admin/cenfriend" element={<AdminGuard><AdminCenFriend /></AdminGuard>} />
          <Route path="/admin/orders" element={<AdminGuard><AdminOrders /></AdminGuard>} />
          <Route path="/admin/agri-data" element={<AdminGuard><AdminAgriData /></AdminGuard>} />
          <Route path="/admin/weather" element={<AdminGuard><AdminWeather /></AdminGuard>} />
          <Route path="/admin/ai-services" element={<AdminGuard><AdminAiServices /></AdminGuard>} />
          <Route path="/admin/analytics" element={<AdminGuard><AdminAnalytics /></AdminGuard>} />
          <Route path="/admin/support" element={<AdminGuard><AdminSupport /></AdminGuard>} />
          <Route path="/admin/notifications" element={<AdminGuard><AdminNotifications /></AdminGuard>} />
          <Route path="/admin/cms" element={<AdminGuard><AdminCms /></AdminGuard>} />
          <Route path="/admin/settings" element={<AdminGuard><AdminSettings /></AdminGuard>} />
          <Route path="/admin/security" element={<AdminGuard><AdminSecurity /></AdminGuard>} />
          <Route path="/admin/health" element={<AdminGuard><AdminHealth /></AdminGuard>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
