import { Routes, Route, Navigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import StaffGuard from "./components/StaffGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import ScanPage from "./pages/ScanPage";
import ScanLandingPage from "./pages/ScanLandingPage";
import SuccessPage from "./pages/SuccessPage";
import StaffDashboardPage from "./pages/StaffDashboardPage";
import StaffLoginPage from "./pages/StaffLoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// Placeholders — replace with real pages as they are built
const Placeholder = ({ name }: { name: string }) => (
  <div style={{ background: "#080808", minHeight: "100vh", color: "#666", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", fontSize: 14 }}>
    {name} — coming soon
  </div>
);

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/staff-login" element={<StaffLoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/onboarding" element={<Placeholder name="OnboardingPage" />} />
      <Route path="/onboarding-complete" element={<Placeholder name="OnboardingComplete" />} />
      <Route path="/pricing" element={<Placeholder name="PricingPage" />} />
      <Route path="/success" element={<SuccessPage />} />
      <Route path="/help" element={<Placeholder name="HelpPage" />} />
      <Route path="/terms" element={<Placeholder name="TermsPage" />} />
      <Route path="/privacy" element={<Placeholder name="PrivacyPage" />} />
      <Route path="/scan/:bizSlug" element={<ScanLandingPage />} />
      <Route path="/scan/:bizId/:locationId" element={<ScanPage />} />
      <Route path="/book/:slug" element={<Placeholder name="BookingPage" />} />

      {/* Owner-protected */}
      <Route
        path="/dashboard"
        element={
          <AuthGuard>
            <ErrorBoundary>
              <DashboardPage />
            </ErrorBoundary>
          </AuthGuard>
        }
      />
      <Route
        path="/admin"
        element={
          <AuthGuard>
            <AdminPage />
          </AuthGuard>
        }
      />
      <Route
        path="/settings"
        element={
          <AuthGuard>
            <Placeholder name="SettingsPage" />
          </AuthGuard>
        }
      />
      <Route
        path="/qr"
        element={
          <AuthGuard>
            <Placeholder name="QRGeneratorPage" />
          </AuthGuard>
        }
      />
      <Route
        path="/menu"
        element={
          <AuthGuard>
            <Placeholder name="MenuPage" />
          </AuthGuard>
        }
      />

      {/* Staff-protected */}
      <Route
        path="/staff"
        element={
          <StaffGuard>
            <StaffDashboardPage />
          </StaffGuard>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}