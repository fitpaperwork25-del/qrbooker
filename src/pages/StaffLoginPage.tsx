import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { staffLogin } from "../lib/useStaffAuth";
import { ACCENT, BG, SURFACE, BORDER, TEXT, MUTED, RED } from "../constants/theme";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#141414",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "12px 14px",
  color: TEXT,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "sans-serif",
};

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!slug.trim()) { setError("Enter your restaurant ID."); return; }
    if (pin.length !== 4) { setError("Enter a 4-digit PIN."); return; }
    setLoading(true);
    setError("");
    const { error: err } = await staffLogin(slug, pin);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate("/staff");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div
      style={{
        background: BG,
        minHeight: "100vh",
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
          padding: "36px 40px",
          maxWidth: 400,
          width: "100%",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              color: ACCENT,
              marginBottom: 8,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Staff Access
          </div>
          <div style={{ fontWeight: 900, fontSize: 22, color: TEXT }}>
            Staff Login
          </div>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>
            Enter your restaurant ID and staff PIN.
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(244,67,54,0.08)",
              border: `1px solid rgba(244,67,54,0.3)`,
              color: RED,
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 18,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ color: MUTED, fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
            Restaurant ID
          </div>
          <input
            type="text"
            placeholder="e.g. snelling-cafe"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={handleKeyDown}
            style={inputStyle}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ color: MUTED, fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
            4-Digit PIN
          </div>
          <input
            type="password"
            inputMode="numeric"
            placeholder="••••"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={handleKeyDown}
            style={{
              ...inputStyle,
              fontSize: 24,
              letterSpacing: 10,
              textAlign: "center",
            }}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            background: loading ? "#b89a30" : ACCENT,
            color: BG,
            border: "none",
            borderRadius: 8,
            padding: "13px",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 15,
          }}
        >
          {loading ? "Checking..." : "Enter Staff Dashboard →"}
        </button>

        <button
          onClick={() => navigate("/login")}
          style={{
            marginTop: 16,
            background: "none",
            border: "none",
            color: MUTED,
            cursor: "pointer",
            fontSize: 13,
            width: "100%",
            textAlign: "center",
            padding: 0,
          }}
        >
          Owner login →
        </button>
      </div>
    </div>
  );
}
