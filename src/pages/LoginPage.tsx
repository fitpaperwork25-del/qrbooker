import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/useAuth";
import { ACCENT, BG, BORDER, TEXT, MUTED, RED } from "../constants/theme";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#141414",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "12px 14px",
  color: TEXT,
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "sans-serif",
};

const inputFocusStyle: React.CSSProperties = {
  border: `1px solid ${ACCENT}`,
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const state = location.state as { from?: string; demoEmail?: string; demoPassword?: string } | null;
  const from  = state?.from ?? "/dashboard";

  const [email,    setEmail]    = useState(state?.demoEmail    ?? "");
  const [password, setPassword] = useState(state?.demoPassword ?? "");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) { setError("Enter your email."); return; }
    if (!password) { setError("Enter your password."); return; }
    setLoading(true);
    setError("");
    const err = await signIn(email.trim(), password);
    if (err) {
      setError(err.message === "Invalid login credentials"
        ? "Incorrect email or password."
        : err.message);
      setLoading(false);
    } else {
      const dest = email.trim().toLowerCase() === "fitpaperwork25@gmail.com" ? "/admin" : from;
      navigate(dest, { replace: true });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  useEffect(() => {
    if (!state?.demoEmail || !state?.demoPassword) return;
    setLoading(true);
    signIn(state.demoEmail, state.demoPassword).then((err) => {
      if (err) {
        setError(err.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : err.message);
        setLoading(false);
      } else {
        navigate(from, { replace: true });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        background: BG,
        minHeight: "100vh",
        color: TEXT,
        fontFamily: "sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 32px",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <img src="/logo.png" alt="QR-Wegn" style={{ height: 32, width: "auto" }} />
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1 }}>QR-Wegn</span>
        </div>
        <button
          onClick={() => navigate("/staff-login")}
          style={{
            background: "none",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: "8px 16px",
            color: MUTED,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Staff login
        </button>
      </div>

      {/* Form */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ marginBottom: 36 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 3,
                color: ACCENT,
                marginBottom: 12,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Owner Login
            </div>
            <h1
              style={{
                fontSize: 38,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              Welcome back.
            </h1>
          </div>

          {error && (
            <div
              style={{
                background: "rgba(244,67,54,0.08)",
                border: `1px solid rgba(244,67,54,0.3)`,
                color: RED,
                padding: "11px 14px",
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              style={{
                ...inputStyle,
                ...(focusedField === "email" ? inputFocusStyle : {}),
              }}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              style={{
                ...inputStyle,
                ...(focusedField === "password" ? inputFocusStyle : {}),
              }}
              autoComplete="current-password"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "#b89a30" : ACCENT,
              color: BG,
              border: "none",
              borderRadius: 8,
              padding: "14px",
              fontWeight: 800,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: 0.5,
              transition: "background 0.15s",
            }}
          >
            {loading ? "Signing in..." : "Sign In →"}
          </button>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 20,
            }}
          >
            <button
              onClick={() => navigate("/register")}
              style={{
                background: "none",
                border: "none",
                color: MUTED,
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
              }}
            >
              No account? Register →
            </button>
            <button
              onClick={() => navigate("/forgot-password")}
              style={{
                background: "none",
                border: "none",
                color: MUTED,
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}