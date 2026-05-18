import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";

const ACCENT  = "#E8C547";
const BG      = "#080808";
const BORDER  = "rgba(255,255,255,0.08)";
const TEXT    = "#F0EDE8";
const MUTED   = "#666666";
const SURFACE = "#111111";

// ── Demo dropdown ─────────────────────────────────────────────────────────────

interface DemoDropdownProps {
  onClose: () => void;
}

function DemoDropdown({ onClose }: DemoDropdownProps) {
  const navigate = useNavigate();

  function goCustomer() {
    onClose();
    navigate("/scan/demo-restaurant");
  }

  function goStaff() {
    onClose();
    navigate("/staff-login", {
      state: { demoSlug: "demo-restaurant", demoPin: "1234" },
    });
  }

  function goOwner() {
    onClose();
    navigate("/login", {
      state: { from: "/dashboard", demoEmail: "demo@qrserve.app", demoPassword: "Demo2026" },
    });
  }

  const items = [
    {
      key:     "customer" as const,
      icon:    "📱",
      label:   "Customer View",
      sub:     "Scan a table, browse the menu & order",
      action:  goCustomer,
      color:   "#4CAF50",
    },
    {
      key:     "staff" as const,
      icon:    "👨‍🍳",
      label:   "Staff Kitchen",
      sub:     "Kitchen display — manage live orders",
      action:  goStaff,
      color:   "#F97316",
    },
    {
      key:     "owner" as const,
      icon:    "📊",
      label:   "Owner Dashboard",
      sub:     "Full business management view",
      action:  goOwner,
      color:   ACCENT,
    },
  ];

  return (
    <div
      style={{
        position:    "absolute",
        top:         "calc(100% + 8px)",
        right:       0,
        zIndex:      100,
        background:  SURFACE,
        border:      `1px solid ${BORDER}`,
        borderRadius: 14,
        padding:     8,
        minWidth:    280,
        boxShadow:   "0 16px 48px rgba(0,0,0,0.6)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={item.key}
          onClick={item.action}
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            14,
            width:          "100%",
            background:     "transparent",
            border:         "none",
            borderRadius:   10,
            padding:        "12px 14px",
            cursor:         "pointer",
            textAlign:      "left",
            marginBottom:   i < items.length - 1 ? 2 : 0,
            transition:     "background 0.12s",
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
            <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>
              {item.label}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{item.sub}</div>
          </div>
          <span style={{ color: item.color, fontSize: 16, flexShrink: 0 }}>→</span>
        </button>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [demoOpen, setDemoOpen]   = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    QRCode.toDataURL("https://qrserve-v3.vercel.app", {
      width: 200,
      margin: 2,
      color: { dark: "#E8C547", light: "#080808" },
    }).then(setQrDataUrl);
  }, []);

  // Close dropdown on outside click
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
          <img src="/logo.png" alt="QR-Wegn" style={{ height: 32, width: "auto" }} />
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1, color: TEXT }}>QR-Wegn</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Earn With Us */}
          <button
            onClick={() => document.getElementById("promoter")?.scrollIntoView({ behavior: "smooth" })}
            style={{
              background:   "none",
              border:       `1px solid ${ACCENT}`,
              borderRadius: 8,
              padding:      "8px 14px",
              color:        ACCENT,
              cursor:       "pointer",
              fontSize:     13,
              fontWeight:   700,
              whiteSpace:   "nowrap",
            }}
          >
            Earn With Us
          </button>

          {/* Try Demo */}
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
          QR-powered hospitality
        </p>
        <h1 style={{ fontSize: "clamp(40px, 8vw, 72px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: -2, maxWidth: 800, margin: "0 0 24px", color: TEXT }}>
          Your menu. Your orders.{" "}
          <span style={{ color: ACCENT }}>Zero friction.</span>
        </h1>
        <p style={{ fontSize: 17, color: MUTED, maxWidth: 500, lineHeight: 1.7, margin: "0 0 48px" }}>
          Give every table a QR code. Customers scan, order, and pay — no app needed.
          Built for restaurants, cafes, barbershops, salons, and hotels.
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
            { label: "Instant QR codes", sub: "One per table or room" },
            { label: "Live orders",      sub: "Real-time staff dashboard" },
            { label: "No app required",  sub: "Customers scan & go" },
            { label: "Stripe payments",  sub: "Live mode, no setup fees" },
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
              { n: "01", head: "Register your restaurant", sub: "Create your account in 2 minutes. Your dashboard is ready immediately — no setup call needed." },
              { n: "02", head: "Add your tables and menu", sub: "Add one location per table, then build your menu with categories and items. Everything goes live instantly." },
              { n: "03", head: "Print your QR code",       sub: "Download a unique QR code for each table from your dashboard. Print, laminate, and place it on the table." },
              { n: "04", head: "Customers scan and order", sub: "Guests scan the code, browse your menu, and place orders — no app, no account, no friction." },
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
          Early access pricing for the first 50 restaurants.
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

      {/* Become a Promoter */}
      <section id="promoter" style={{ background: SURFACE, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: "80px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>
            Promoter Program
          </p>
          <h2 style={{ fontSize: "clamp(26px, 4.5vw, 44px)", fontWeight: 900, letterSpacing: -1, color: TEXT, marginBottom: 14, lineHeight: 1.15 }}>
            Become a QR-Wegn Promoter
          </h2>
          <p style={{ fontSize: 16, color: MUTED, marginBottom: 40, lineHeight: 1.7 }}>
            Earn cash for every restaurant you bring on board
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 44, textAlign: "left", maxWidth: 460, margin: "0 auto 44px" }}>
            {[
              "Sell any plan and earn the first month's value — $49, $99, or $199",
              "No limit on earnings — every sale counts",
              "Get paid 37 days after the restaurant's first successful payment",
            ].map((point) => (
              <div key={point} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <span style={{
                  flexShrink: 0, marginTop: 2,
                  width: 20, height: 20, borderRadius: "50%",
                  background: ACCENT + "22", border: `1.5px solid ${ACCENT}55`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: ACCENT, fontWeight: 900,
                }}>✓</span>
                <span style={{ fontSize: 15, color: TEXT, lineHeight: 1.6 }}>{point}</span>
              </div>
            ))}
          </div>
          <a
            href="https://tally.so/r/gDJWe4"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              background: ACCENT, color: BG,
              fontWeight: 800, fontSize: 15,
              padding: "15px 32px", borderRadius: 10,
              textDecoration: "none", letterSpacing: 0.3,
            }}
          >
            Submit a Sale Claim →
          </a>
        </div>
      </section>

      {/* QR Code */}
      <section style={{ background: BG, borderTop: `1px solid ${BORDER}`, padding: "60px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>
          Scan to try
        </p>
        <p style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 28 }}>
          Scan to try QR-Wegn
        </p>
        <div style={{ display: "inline-block", padding: 16, border: `1px solid ${BORDER}`, borderRadius: 16, background: "#080808" }}>
          {qrDataUrl
            ? <img src={qrDataUrl} alt="Scan to try QR-Wegn" width={200} height={200} style={{ display: "block", borderRadius: 8 }} />
            : <div style={{ width: 200, height: 200, background: "#111", borderRadius: 8 }} />
          }
        </div>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 16, fontFamily: "monospace" }}>
          qrserve-v3.vercel.app
        </p>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 13, color: MUTED }}>© 2026 QR-Wegn</span>
        <div style={{ display: "flex", gap: 24 }}>
          <button onClick={() => navigate("/pricing")} style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", padding: 0 }}>Pricing</button>
          <button onClick={() => navigate("/terms")}   style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", padding: 0 }}>Terms</button>
          <button onClick={() => navigate("/privacy")} style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", padding: 0 }}>Privacy</button>
        </div>
      </footer>

    </div>
  );
}
