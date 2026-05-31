import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const ACCENT  = "#E8C547";
const BG      = "#080808";
const BORDER  = "rgba(255,255,255,0.08)";
const TEXT    = "#F0EDE8";
const MUTED   = "#666666";
const SURFACE = "#111111";

interface DemoDropdownProps {
  onClose: () => void;
}

function DemoDropdown({ onClose }: DemoDropdownProps) {
  const navigate = useNavigate();

  function goCustomer() {
    onClose();
    navigate("/scan/demo-barbershop");
  }

  function goStaff() {
    onClose();
    navigate("/staff-login", {
      state: { demoSlug: "demo-barbershop", demoPin: "1234" },
    });
  }

  function goOwner() {
    onClose();
    navigate("/demo");
  }

  const items = [
    {
      key:    "customer" as const,
      icon:   "📱",
      label:  "Customer View",
      sub:    "Scan & book an appointment",
      action: goCustomer,
      color:  "#4CAF50",
    },
    {
      key:    "staff" as const,
      icon:   "✂️",
      label:  "Staff View",
      sub:    "Manage today's appointments",
      action: goStaff,
      color:  "#F97316",
    },
    {
      key:    "owner" as const,
      icon:   "📊",
      label:  "Owner Dashboard",
      sub:    "Full business management view",
      action: goOwner,
      color:  ACCENT,
    },
  ];

  return (
    <div
      style={{
        position:     "absolute",
        top:          "calc(100% + 8px)",
        right:        0,
        zIndex:       100,
        background:   SURFACE,
        border:       `1px solid ${BORDER}`,
        borderRadius: 14,
        padding:      8,
        minWidth:     280,
        boxShadow:    "0 16px 48px rgba(0,0,0,0.6)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={item.key}
          onClick={item.action}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          14,
            width:        "100%",
            background:   "transparent",
            border:       "none",
            borderRadius: 10,
            padding:      "12px 14px",
            cursor:       "pointer",
            textAlign:    "left",
            marginBottom: i < items.length - 1 ? 2 : 0,
            transition:   "background 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = item.color + "14";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{item.label}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{item.sub}</div>
          </div>
          <span style={{ color: item.color, fontSize: 16, flexShrink: 0 }}>→</span>
        </button>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail]         = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [demoOpen, setDemoOpen]   = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.location.hash.includes("access_token")) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        const dest = session.user.email === "fitpaperwork25@gmail.com" ? "/admin" : "/dashboard";
        navigate(dest, { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    QRCode.toDataURL("https://qrbooker.com", {
      width:  200,
      margin: 2,
      color:  { dark: "#000000", light: "#ffffff" },
    }).then(setQrDataUrl);
  }, []);

  useEffect(() => {
    if (!demoOpen) return;
    function handleClick(e: MouseEvent) {
      if (demoRef.current && !demoRef.current.contains(e.target as Node)) {
        setDemoOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [demoOpen]);

  function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    window.location.href = `https://tally.so/r/EkvVa4?email=${encodeURIComponent(email)}`;
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.png" alt="QRBooker" style={{ height: 32, width: "auto" }} />
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1, color: TEXT }}>QRBooker</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div ref={demoRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDemoOpen((o) => !o)}
              style={{
                background:   demoOpen ? ACCENT + "22" : "none",
                border:       `1px solid ${ACCENT}44`,
                borderRadius: 8,
                padding:      "8px 14px",
                color:        ACCENT,
                cursor:       "pointer",
                fontSize:     13,
                fontWeight:   700,
                display:      "flex",
                alignItems:   "center",
                gap:          6,
              }}
            >
              Try Demo
              <span style={{ fontSize: 10, opacity: 0.8 }}>{demoOpen ? "▲" : "▼"}</span>
            </button>
            {demoOpen && <DemoDropdown onClose={() => setDemoOpen(false)} />}
          </div>
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
            Login
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 24 }}>
          QR-Powered Booking
        </p>
        <h1 style={{ fontSize: "clamp(40px, 8vw, 72px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: -2, maxWidth: 800, margin: "0 0 24px", color: TEXT }}>
          Your chair. Your clients.{" "}
          <span style={{ color: ACCENT }}>Zero no-shows.</span>
        </h1>
        <p style={{ fontSize: 17, color: MUTED, maxWidth: 500, lineHeight: 1.7, margin: "0 0 48px" }}>
          Give every barber a QR code. Clients scan, book, and show up — no phone tag, no app needed.
          Built for barbershops and salons.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => navigate("/register")}
            style={{ background: ACCENT, border: "none", borderRadius: 10, padding: "16px 36px", color: BG, cursor: "pointer", fontSize: 16, fontWeight: 800 }}
          >
            Get started free →
          </button>
          <button
            onClick={() => setDemoOpen((o) => !o)}
            style={{ background: "none", border: `1px solid ${ACCENT}66`, borderRadius: 10, padding: "16px 36px", color: ACCENT, cursor: "pointer", fontSize: 16, fontWeight: 700 }}
          >
            Try Demo
          </button>
        </div>
      </main>

      {/* Feature strip */}
      <div style={{ borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
        {(
          [
            { label: "Instant QR codes",    sub: "One per barber or chair" },
            { label: "Live appointments",   sub: "Real-time staff calendar" },
            { label: "No app required",     sub: "Clients scan & book" },
            { label: "Stripe payments",     sub: "Collect deposits upfront" },
          ] as const
        ).map((f) => (
          <div key={f.label} style={{ padding: "28px 40px", borderRight: `1px solid ${BORDER}`, textAlign: "center", minWidth: 180 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{f.sub}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <section style={{ background: BG, borderTop: `1px solid ${BORDER}`, padding: "88px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", textAlign: "center", margin: "0 0 14px" }}>
            How it works
          </p>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 900, color: TEXT, textAlign: "center", margin: "0 0 60px", letterSpacing: -0.5 }}>
            Up and running in under an hour.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 40 }}>
            {([
              { n: "01", head: "Register your shop",       sub: "Create your account in 2 minutes. Your dashboard is ready immediately — no setup call needed." },
              { n: "02", head: "Add your staff & services", sub: "Add your barbers, set their services and availability. Everything goes live instantly." },
              { n: "03", head: "Print your QR codes",      sub: "Download a unique QR code for each barber or chair. Print and display it at your shop." },
              { n: "04", head: "Clients scan and book",    sub: "Clients scan the code, pick a service and time slot, and book — no app, no account, no friction." },
            ]).map((step) => (
              <div key={step.n}>
                <div style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 46, height: 46, borderRadius: "50%",
                  background: ACCENT + "18", border: `1.5px solid ${ACCENT}55`,
                  marginBottom: 20,
                }}>
                  <span style={{ fontWeight: 900, fontSize: 13, color: ACCENT, fontFamily: "monospace" }}>{step.n}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: TEXT, marginBottom: 10, lineHeight: 1.35 }}>{step.head}</div>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.75, margin: 0 }}>{step.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section style={{ background: BG, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: "80px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>
          Early access
        </p>
        <h2 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, letterSpacing: -1, color: TEXT, marginBottom: 14 }}>
          Be the first in.
        </h2>
        <p style={{ fontSize: 16, color: MUTED, marginBottom: 40, lineHeight: 1.7 }}>
          Early access pricing for the first 50 barbershops.
        </p>
        {submitted ? (
          <div style={{ display: "inline-block", border: `1px solid ${ACCENT}`, borderRadius: 10, padding: "16px 32px", color: ACCENT, fontWeight: 700, fontSize: 15 }}>
            You're on the list.
          </div>
        ) : (
          <form onSubmit={handleWaitlist} style={{ display: "flex", gap: 0, maxWidth: 460, margin: "0 auto" }}>
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                flex: 1, background: "#111", border: `1px solid ${BORDER}`,
                borderRight: "none", borderRadius: "10px 0 0 10px",
                padding: "14px 18px", color: TEXT, fontSize: 14, outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                background: ACCENT, border: "none", borderRadius: "0 10px 10px 0",
                padding: "14px 24px", color: BG, fontWeight: 800, fontSize: 14,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Notify me
            </button>
          </form>
        )}
      </section>

      {/* Pricing */}
      <section style={{ background: BG, borderTop: `1px solid ${BORDER}`, padding: "80px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20, textAlign: "center" }}>
            Pricing
          </p>
          <h2 style={{ fontSize: "clamp(26px, 4.5vw, 44px)", fontWeight: 900, letterSpacing: -1, color: TEXT, marginBottom: 14, textAlign: "center", lineHeight: 1.15 }}>
            Simple, transparent pricing
          </h2>
          <p style={{ fontSize: 16, color: MUTED, marginBottom: 52, textAlign: "center", lineHeight: 1.7 }}>
            No setup fees. No contracts. Cancel any time.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              {
                name:        "Starter",
                price:       "$49",
                recommended: false,
                features:    ["1 location", "Up to 3 staff", "Appointment booking", "Services catalog"],
              },
              {
                name:        "Pro",
                price:       "$99",
                recommended: true,
                features:    ["Up to 5 locations", "Unlimited staff", "Staff schedules", "Priority support"],
              },
              {
                name:        "Enterprise",
                price:       "$199",
                recommended: false,
                features:    ["Unlimited locations", "White label", "Custom domain", "Dedicated support"],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                style={{
                  background:    SURFACE,
                  border:        plan.recommended ? `2px solid ${ACCENT}55` : `1px solid ${BORDER}`,
                  borderRadius:  14,
                  padding:       "32px 28px",
                  display:       "flex",
                  flexDirection: "column",
                  gap:           0,
                  position:      "relative",
                }}
              >
                {plan.recommended && (
                  <div style={{
                    position:      "absolute",
                    top:           -13,
                    left:          24,
                    background:    ACCENT,
                    color:         BG,
                    fontSize:      10,
                    fontWeight:    800,
                    letterSpacing: 2,
                    padding:       "3px 12px",
                    borderRadius:  4,
                    textTransform: "uppercase",
                  }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontSize: 12, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                  {plan.name}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 28 }}>
                  <span style={{ fontSize: 42, fontWeight: 900, color: plan.recommended ? ACCENT : TEXT, letterSpacing: -1 }}>{plan.price}</span>
                  <span style={{ fontSize: 14, color: MUTED, fontWeight: 500 }}>/mo</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
                  {plan.features.map((f) => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        flexShrink:    0,
                        width:         18, height: 18, borderRadius: "50%",
                        background:    ACCENT + "20",
                        border:        `1px solid ${ACCENT}44`,
                        display:       "flex", alignItems: "center", justifyContent: "center",
                        fontSize:      10, color: ACCENT, fontWeight: 900,
                      }}>✓</span>
                      <span style={{ fontSize: 14, color: MUTED }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigate("/register")}
                  style={{
                    marginTop:    "auto",
                    background:   plan.recommended ? ACCENT : "none",
                    color:        plan.recommended ? BG : ACCENT,
                    border:       `1.5px solid ${ACCENT}`,
                    borderRadius: 9,
                    padding:      "13px",
                    fontWeight:   800,
                    fontSize:     14,
                    cursor:       "pointer",
                    width:        "100%",
                  }}
                >
                  Get started →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* QR Code */}
      <section style={{ background: BG, borderTop: `1px solid ${BORDER}`, padding: "60px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>
          Scan to try
        </p>
        <p style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 28 }}>
          Scan to try QRBooker
        </p>
        <div style={{ display: "inline-block", padding: 16, border: `1px solid ${BORDER}`, borderRadius: 16, background: "#080808" }}>
          {qrDataUrl
            ? <img src={qrDataUrl} alt="Scan to try QRBooker" width={200} height={200} style={{ display: "block", borderRadius: 8 }} />
            : <div style={{ width: 200, height: 200, background: "#111", borderRadius: 8 }} />
          }
        </div>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 16, fontFamily: "monospace" }}>
          qrbooker.com
        </p>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 13, color: MUTED }}>© 2026 QRBooker</span>
        <div style={{ display: "flex", gap: 24 }}>
          <button onClick={() => navigate("/pricing")} style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", padding: 0 }}>Pricing</button>
          <button onClick={() => navigate("/terms")}   style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", padding: 0 }}>Terms</button>
          <button onClick={() => navigate("/privacy")} style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", padding: 0 }}>Privacy</button>
        </div>
      </footer>

    </div>
  );
}