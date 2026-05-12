import { Routes, Route, Navigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import StaffGuard from "./components/StaffGuard";
import LoginPage from "./pages/LoginPage";
import StaffLoginPage from "./pages/StaffLoginPage";

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
      <Route path="/" element={<Placeholder name="LandingPage" />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/staff-login" element={<StaffLoginPage />} />
      <Route path="/register" element={<Placeholder name="RegisterPage" />} />
      <Route path="/onboarding" element={<Placeholder name="OnboardingPage" />} />
      <Route path="/onboarding-complete" element={<Placeholder name="OnboardingComplete" />} />
      <Route path="/pricing" element={<Placeholder name="PricingPage" />} />
      <Route path="/success" element={<Placeholder name="SuccessPage" />} />
      <Route path="/help" element={<Placeholder name="HelpPage" />} />
      <Route path="/terms" element={<Placeholder name="TermsPage" />} />
      <Route path="/privacy" element={<Placeholder name="PrivacyPage" />} />
      <Route path="/reset-password" element={<Placeholder name="ResetPasswordPage" />} />
      <Route path="/scan/:bizId/:locationId" element={<Placeholder name="ScanPage" />} />
      <Route path="/book/:slug" element={<Placeholder name="BookingPage" />} />

      {/* Owner-protected */}
      <Route
        path="/dashboard"
        element={
          <AuthGuard>
            <Placeholder name="DashboardPage" />
          </AuthGuard>
        }
      />
      <Route
        path="/admin"
        element={
          <AuthGuard>
            <Placeholder name="AdminPage" />
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
            <Placeholder name="StaffDashboardPage" />
          </StaffGuard>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
