import { useNavigate } from "react-router-dom";
import { ACCENT, BG, BORDER, TEXT, MUTED } from "../constants/theme";

function QRMark() {
  return (
    <svg width={32} height={32} viewBox="0 0 80 80" fill="none">
      <rect x="2" y="2" width="30" height="30" rx="3" stroke={ACCENT} strokeWidth="4" fill="none" />
      <rect x="10" y="10" width="14" height="14" fill={ACCENT} />
      <rect x="48" y="2" width="30" height="30" rx="3" stroke={ACCENT} strokeWidth="4" fill="none" />
      <rect x="56" y="10" width="14" height="14" fill={ACCENT} />
      <rect x="2" y="48" width="30" height="30" rx="3" stroke={ACCENT} strokeWidth="4" fill="none" />
      <rect x="10" y="56" width="14" height="14" fill={ACCENT} />
      <rect x="48" y="48" width="8" height="8" fill={ACCENT} />
      <rect x="60" y="48" width="8" height="8" fill={ACCENT} />
      <rect x="72" y="48" width="8" height="8" fill={ACCENT} />
      <rect x="48" y="60" width="8" height="8" fill={ACCENT} />
      <rect x="72" y="60" width="8" height="8" fill={ACCENT} />
      <rect x="48" y="72" width="8" height="8" fill={ACCENT} />
      <rect x="60" y="72" width="8" height="8" fill={ACCENT} />
      <rect x="72" y="72" width="8" height="8" fill={ACCENT} />
    </svg>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <QRMark />
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1 }}>QRServe</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => navigate("/staff-login")}
            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: MUTED, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Staff login
          </button>
          <button
            onClick={() => navigate("/login")}
            style={{ background: ACCENT, border: "none", borderRadius: 8, padding: "8px 18px", color: BG, cursor: "pointer", fontSize: 13, fontWeight: 800 }}
          >
            Owner login
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 24 }}>
          QR-powered hospitality
        </div>
        <h1 style={{ fontSize: "clamp(40px, 8vw, 76px)", fontWeight: 900, lineHeight: 1.0, letterSpacing: -2, maxWidth: 800, margin: "0 0 24px" }}>
          Your menu.<br />Your orders.<br />
          <span style={{ color: ACCENT }}>Zero friction.</span>
        </h1>
        <p style={{ fontSize: 18, color: MUTED, maxWidth: 520, lineHeight: 1.6, margin: "0 0 48px" }}>
          Give every table a QR code. Customers scan, order, and pay — no app needed. Built for restaurants, cafes, barbershops, salons, and hotels.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => navigate("/register")}
            style={{ background: ACCENT, border: "none", borderRadius: 10, padding: "16px 36px", color: BG, cursor: "pointer", fontSize: 16, fontWeight: 800, letterSpacing: 0.3 }}
          >
            Get started free →
          </button>
          <button
            onClick={() => navigate("/login")}
            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 36px", color: TEXT, cursor: "pointer", fontSize: 16, fontWeight: 600 }}
          >
            Sign in
          </button>
        </div>
      </div>

      {/* Feature strip */}
      <div style={{ borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "center", gap: 0, flexWrap: "wrap" }}>
        {[
          { label: "Instant QR codes", sub: "One per table or room" },
          { label: "Live orders", sub: "Real-time staff dashboard" },
          { label: "No app required", sub: "Customers scan & go" },
          { label: "Stripe payments", sub: "Live mode, no setup fees" },
        ].map((f) => (
          <div
            key={f.label}
            style={{ padding: "28px 40px", borderRight: `1px solid ${BORDER}`, textAlign: "center", minWidth: 180 }}
          >
            <div style={{ fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{f.sub}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${BORDER}`, padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 13, color: MUTED }}>© 2026 QRServe</span>
        <div style={{ display: "flex", gap: 24 }}>
          {[["Pricing", "/pricing"], ["Terms", "/terms"], ["Privacy", "/privacy"]].map(([label, path]) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", padding: 0 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
