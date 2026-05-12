import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ACCENT, BG, SURFACE, BORDER, TEXT, MUTED } from "../constants/theme";

export default function SessionExpired() {
  const navigate = useNavigate();

  const handleSignIn = () => {
    supabase.auth.signOut().finally(() => navigate("/login"));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 48,
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
        <div style={{ fontWeight: 900, fontSize: 22, color: TEXT, marginBottom: 10 }}>
          Session Expired
        </div>
        <div
          style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}
        >
          Your session has expired. Sign in again to continue managing your
          business.
        </div>
        <button
          onClick={handleSignIn}
          style={{
            width: "100%",
            background: ACCENT,
            color: BG,
            border: "none",
            borderRadius: 8,
            padding: "14px",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Sign In Again
        </button>
      </div>
    </div>
  );
}
