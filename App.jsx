import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ReportComplaint from "./components/ReportComplaint";
import Complaints from "./pages/Complaints";
import MapPage from "./pages/Map";
import ComplaintDetails from "./pages/ComplaintDetails";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import UserLayout from "./pages/user/UserLayout";
import UserDashboard from "./pages/user/UserDashboard";
import UserComplaintStatus from "./pages/user/UserComplaintStatus";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminComplaints from "./pages/admin/AdminComplaints";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminWards from "./pages/admin/AdminWards";
import AdminRepresentatives from "./pages/admin/AdminRepresentatives";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminReports from "./pages/admin/AdminReports";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminSettings from "./pages/admin/AdminSettings";

/* Routes that render inside the resident dashboard shell. The public header
   and footer step aside so the sidebar/topbar layout matches the admin console. */
const USER_SHELL_PATHS = [
  "/dashboard",
  "/report",
  "/my-complaints",
  "/complaint-status",
  "/notifications",
  "/profile",
  "/settings",
];

export default function App() {
  const { pathname } = useLocation();
  const { user, isAdmin } = useAuth();

  // The site header only exists after a successful sign-in, so the sign-in
  // screens stay clean. Both dashboards (admin and resident) have their own
  // sidebar and top bar, so the public header and footer stay hidden there.
  const currentPath = pathname.replace(/\/+$/, "") || "/";
  const isAdminConsole = currentPath.startsWith("/admin") && currentPath !== "/admin/login";
  const isComplaintDetail = currentPath.startsWith("/complaint/");
  const isUserConsole =
    USER_SHELL_PATHS.includes(currentPath) || (isComplaintDetail && !isAdmin);
  const showSiteChrome = Boolean(user) && !isAdminConsole && !isUserConsole;

  return (
    <div className="app-shell">
      {showSiteChrome && <Navbar />}
      <main>
        <Routes>
          {/* The public landing page is the first screen. A signed-in visitor
              is forwarded from here to the right dashboard. */}
          <Route path="/" element={<Landing />} />

          {/* Authenticated pages. Every direct visit without a session is sent
              back to the sign-in screen with a return path. */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints"
            element={
              <ProtectedRoute>
                <Complaints />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaint/:id"
            element={
              <ProtectedRoute>
                {/* Residents keep the dashboard sidebar but the shell hides its
                    top bar on this page. Administrators keep the standalone
                    details view used by their console. */}
                {isAdmin ? <ComplaintDetails /> : <UserLayout />}
              </ProtectedRoute>
            }
          >
            <Route index element={<ComplaintDetails />} />
          </Route>
          <Route
            path="/map"
            element={
              <ProtectedRoute>
                <MapPage />
              </ProtectedRoute>
            }
          />

          {/* Sign-in and account creation stay public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Resident workspace. All entries share the dashboard shell and are
              closed to administrator accounts, who keep their own console. */}
          <Route
            element={
              <ProtectedRoute resident>
                <UserLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<UserDashboard />} />
            <Route path="/report" element={<ReportComplaint />} />
            <Route path="/my-complaints" element={<Complaints scope="mine" />} />
            <Route path="/complaint-status" element={<UserComplaintStatus />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            {/* Account settings share the profile screen (details + password). */}
            <Route path="/settings" element={<Profile />} />
          </Route>

          {/* Administrator authentication */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Administrator-only console */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute admin>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="complaints" element={<AdminComplaints />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="wards" element={<AdminWards />} />
            <Route path="representatives" element={<AdminRepresentatives />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showSiteChrome && <Footer />}
    </div>
  );
}
