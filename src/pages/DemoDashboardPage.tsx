import { useState, useEffect } from "react";
import { ACCENT, BG, BORDER, MUTED, SURFACE, TEXT, GREEN } from "../constants/theme";

// ── Fixture data ─────────────────────────────────────────────────────────────

const CHAIRS = [
  { id: "c1", name: "Marcus", label: "Chair 1", apptCount: 5 },
  { id: "c2", name: "Jordan", label: "Chair 2", apptCount: 4 },
  { id: "c3", name: "Tanya",  label: "Chair 3", apptCount: 3 },
];

type Service = { id: string; category: string; name: string; price: number; duration: number; description: string };
const SERVICES: Service[] = [
  { id: "s1", category: "Cuts",               name: "Haircut",         price: 35,  duration: 30,  description: "Classic cut, wash & style"              },
  { id: "s2", category: "Cuts",               name: "Skin Fade",       price: 45,  duration: 45,  description: "Tight low, mid, or high fade"           },
  { id: "s3", category: "Cuts",               name: "Kids Cut",        price: 25,  duration: 20,  description: "Under 12 — quick & fun"                 },
  { id: "s4", category: "Beard & Grooming",   name: "Beard Trim",      price: 20,  duration: 20,  description: "Clean up & shape"                       },
  { id: "s5", category: "Beard & Grooming",   name: "Beard Shape-up",  price: 30,  duration: 30,  description: "Line-up, edge, and style"               },
  { id: "s6", category: "Beard & Grooming",   name: "Hot Towel Shave", price: 40,  duration: 45,  description: "Traditional straight-razor shave"       },
  { id: "s7", category: "Color & Treatments", name: "Color (Full)",    price: 85,  duration: 90,  description: "Full head single-process color"         },
  { id: "s8", category: "Color & Treatments", name: "Highlights",      price: 110, duration: 120, description: "Foil highlights, partial or full"       },
  { id: "s9", category: "Color & Treatments", name: "Toner",           price: 25,  duration: 30,  description: "Tone & gloss treatment"                 },
];

type Appointment = {
  id: string; time: string; client: string; service: string;
  chair: string; price: number; status: "done" | "in chair" | "booked";
};
const APPOINTMENTS: Appointment[] = [
  { id: "a1", time: "8:30 AM",  client: "Alex Johnson",    service: "Haircut",        chair: "Marcus", price: 35,  status: "done"     },
  { id: "a2", time: "9:00 AM",  client: "Maria Santos",    service: "Color (Full)",   chair: "Tanya",  price: 85,  status: "done"     },
  { id: "a3", time: "9:30 AM",  client: "Derek Williams",  service: "Skin Fade",      chair: "Jordan", price: 45,  status: "done"     },
  { id: "a4", time: "10:00 AM", client: "Priya Patel",     service: "Beard Trim",     chair: "Marcus", price: 20,  status: "in chair" },
  { id: "a5", time: "10:30 AM", client: "Carlos Reyes",    service: "Highlights",     chair: "Tanya",  price: 110, status: "in chair" },
  { id: "a6", time: "11:00 AM", client: "Jasmine Lee",     service: "Haircut",        chair: "Jordan", price: 35,  status: "booked"   },
  { id: "a7", time: "11:30 AM", client: "Tyler Brown",     service: "Skin Fade",      chair: "Marcus", price: 45,  status: "booked"   },
  { id: "a8", time: "12:00 PM", client: "Nina Okonkwo",    service: "Beard Shape-up", chair: "Jordan", price: 30,  status: "booked"   },
];

const WEEKLY = [
  { day: "Mon", amount: 380  },
  { day: "Tue", amount: 510  },
  { day: "Wed", amount: 290  },
  { day: "Thu", amount: 620  },
  { day: "Fri", amount: 810  },
  { day: "Sat", amount: 1120 },
  { day: "Sun", amount: 295  },
];

const EXPENSE_CATS = [
  { category: "Rent",      amount: 1400 },
  { category: "Supplies",  amount: 580  },
  { category: "Misc",      amount: 590  },
  { category: "Utilities", amount: 320  },
  { category: "Marketing", amount: 260  },
];

const REVENUE_30D  = 8240;
const EXPENSES_30D = 3150;
const NET_30D      = REVENUE_30D - EXPENSES_30D;
const REVENUE_TODAY = APPOINTMENTS
  .filter(a => a.status !== "booked")
  .reduce((s, a) => s + a.price, 0);
const AVG_TICKET = Math.round(
  REVENUE_TODAY / APPOINTMENTS.filter(a => a.status !== "booked").length,
);

const SLOTS = [
  { time: "9:00 AM",  available: false },
  { time: "9:30 AM",  available: false },
  { time: "10:00 AM", available: true  },
  { time: "10:30 AM", available: false },
  { time: "11:00 AM", available: true  },
  { time: "11:30 AM", available: false },
  { time: "12:00 PM", available: true  },
  { time: "12:30 PM", available: true  },
  { time: "1:00 PM",  available: true  },
  { time: "1:30 PM",  available: true  },
];

// ── Style helpers ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px",
};

function badge(color: string): React.CSSProperties {
  return {
    display: "inline-block", background: color + "22", color,
    border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 10px",
    fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const,
  };
}

function statusColor(s: string) {
  if (s === "in chair") return GREEN;
  if (s === "booked")   return ACCENT;
  return MUTED;
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { day: string; amount: number }[] }) {
  const W = 560;
  const H = 120;
  const PAD = 20;
  const max = Math.max(...data.map(d => d.amount));
  const barW = Math.floor((W - PAD * 2 - (data.length - 1) * 10) / data.length);

  return (
    <svg viewBox={`0 0 ${W} ${H + 36}`} style={{ width: "100%", overflow: "visible" }}>
      {data.map((d, i) => {
        const barH = Math.round((d.amount / max) * H);
        const x    = PAD + i * (barW + 10);
        const y    = H - barH;
        const isLast = i === data.length - 1;
        return (
          <g key={d.day}>
            <rect x={x} y={y} width={barW} height={barH}
              fill={isLast ? ACCENT : ACCENT + "55"} rx={3} />
            <text x={x + barW / 2} y={y - 5} textAnchor="middle"
              fill={isLast ? TEXT : MUTED} fontSize={9} fontWeight={isLast ? 700 : 400}>
              {d.amount >= 1000 ? `$${(d.amount / 1000).toFixed(1)}k` : `$${d.amount}`}
            </text>
            <text x={x + barW / 2} y={H + 16} textAnchor="middle"
              fill={isLast ? ACCENT : MUTED} fontSize={11} fontWeight={isLast ? 700 : 400}>
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Tab sub-components ────────────────────────────────────────────────────────

function CustomerTab({ selectedSlot, onSelectSlot }: {
  selectedSlot: string | null;
  onSelectSlot: (t: string | null) => void;
}) {
  const cats = [...new Set(SERVICES.map(s => s.category))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <p style={{ color: MUTED, fontSize: 13, margin: 0, textAlign: "center" }}>
        This is what your customers see when they scan your QR code.
      </p>

      {/* Phone frame */}
      <div style={{
        width: "100%", maxWidth: 390,
        background: "#080808", border: `1.5px solid ${BORDER}`,
        borderRadius: 24, overflow: "hidden",
        boxShadow: `0 0 0 6px #111, 0 0 0 8px ${BORDER}`,
      }}>
        {/* Hero strip */}
        <div style={{ height: 70, background: `linear-gradient(135deg, #111 0%, #1a1200 100%)` }} />

        <div style={{ padding: "0 20px 32px" }}>
          {/* Business header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 16, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: ACCENT + "22", border: `2px solid ${ACCENT}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
              ✂
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>Demo Cuts</div>
              <div style={{ fontSize: 11, color: MUTED, letterSpacing: 0.5 }}>Scan · Book · Show up</div>
            </div>
          </div>

          {/* Services & Pricing */}
          <div style={{ paddingTop: 20 }}>
            <p style={{ margin: "0 0 14px", fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              Services & Pricing
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {cats.map(cat => (
                <div key={cat}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{cat}</p>
                  {SERVICES.filter(s => s.category === cat).map(svc => (
                    <div key={svc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: `1px solid ${BORDER}`, gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{svc.name}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{svc.description} · {svc.duration} min</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, flexShrink: 0 }}>${svc.price}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ margin: "20px 0 0", height: 1, background: `linear-gradient(to right, ${ACCENT}44, transparent)` }} />

          {/* Time slots */}
          <div style={{ paddingTop: 20 }}>
            <p style={{ margin: "0 0 14px", fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              Pick a Time
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SLOTS.map(slot => (
                <button
                  key={slot.time}
                  disabled={!slot.available}
                  onClick={() => onSelectSlot(selectedSlot === slot.time ? null : slot.time)}
                  style={{
                    padding: "10px 8px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: slot.available ? "pointer" : "not-allowed",
                    border: `1px solid ${
                      !slot.available   ? BORDER :
                      selectedSlot === slot.time ? ACCENT :
                      BORDER
                    }`,
                    background: !slot.available   ? BG :
                                selectedSlot === slot.time ? ACCENT + "22" : SURFACE,
                    color: !slot.available ? MUTED :
                           selectedSlot === slot.time ? ACCENT : TEXT,
                    textDecoration: !slot.available ? "line-through" : "none",
                  }}>
                  {slot.time}
                </button>
              ))}
            </div>
          </div>

          {/* Book button — disabled in demo */}
          <button
            disabled
            title="This is a demo — sign up to accept real bookings"
            style={{
              marginTop: 20, width: "100%", background: selectedSlot ? ACCENT + "99" : ACCENT + "44",
              color: "#000", border: "none", borderRadius: 12, padding: "15px",
              fontWeight: 900, fontSize: 15, cursor: "not-allowed", letterSpacing: 0.5,
            }}>
            {selectedSlot ? `Book ${selectedSlot}` : "Select a time to book"}
          </button>
          <p style={{ textAlign: "center", color: MUTED, fontSize: 11, margin: "12px 0 0", letterSpacing: 0.5 }}>
            Demo only — <a href="/register" style={{ color: ACCENT, fontWeight: 700 }}>sign up</a> to accept real bookings
          </p>
        </div>
      </div>
    </div>
  );
}

function AppointmentsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>
        Today's Schedule — {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 100px 90px 90px", gap: 8, padding: "6px 12px" }}>
        {["Time", "Client", "Service", "With", "Status"].map(h => (
          <span key={h} style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{h}</span>
        ))}
      </div>

      {APPOINTMENTS.map(a => (
        <div key={a.id} style={{
          ...card, padding: "14px 16px",
          display: "grid", gridTemplateColumns: "80px 1fr 100px 90px 90px",
          gap: 8, alignItems: "center",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: MUTED, fontFamily: "monospace" }}>{a.time}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{a.client}</div>
          </div>
          <span style={{ fontSize: 13, color: MUTED }}>{a.service}</span>
          <span style={{ fontSize: 13, color: MUTED }}>{a.chair}</span>
          <span style={{ ...badge(statusColor(a.status)) }}>{a.status}</span>
        </div>
      ))}

      {/* Summary row */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, paddingTop: 8, paddingRight: 4 }}>
        <span style={{ fontSize: 13, color: MUTED }}>
          {APPOINTMENTS.filter(a => a.status === "done").length} done ·{" "}
          {APPOINTMENTS.filter(a => a.status === "in chair").length} in chair ·{" "}
          {APPOINTMENTS.filter(a => a.status === "booked").length} upcoming
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>
          ${REVENUE_TODAY} collected
        </span>
      </div>
    </div>
  );
}

function ChairsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>
        Staff & Chairs
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {CHAIRS.map(chair => (
          <div key={chair.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: TEXT }}>{chair.name}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{chair.label}</div>
              </div>
              <span style={badge(GREEN)}>active</span>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Today</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: ACCENT }}>{chair.apptCount}</div>
                <div style={{ fontSize: 11, color: MUTED }}>appointments</div>
              </div>
            </div>
            {/* QR placeholder */}
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: MUTED, fontSize: 12, fontWeight: 700, cursor: "not-allowed", opacity: 0.5 }}>
                ↓ Download QR
              </button>
              <button disabled style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: MUTED, fontSize: 12, fontWeight: 700, cursor: "not-allowed", opacity: 0.5 }}>
                ↓ Download Card
              </button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: "4px 0 0" }}>
        QR code generation is available in the real dashboard after signup.
      </p>
    </div>
  );
}

function FinancialsDemoTab() {
  const totalExpenses = EXPENSE_CATS.reduce((s, e) => s + e.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>
        Financials — Last 30 Days
      </p>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Revenue",  value: `$${REVENUE_30D.toLocaleString()}`,  color: ACCENT },
          { label: "Expenses", value: `$${EXPENSES_30D.toLocaleString()}`, color: "#f97316" },
          { label: "Net",      value: `$${NET_30D.toLocaleString()}`,      color: GREEN  },
        ].map(k => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* 7-day revenue chart */}
      <div style={card}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 16px" }}>
          7-Day Revenue
        </p>
        <BarChart data={WEEKLY} />
      </div>

      {/* Expense breakdown */}
      <div style={card}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 16px" }}>
          Expense Breakdown
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {EXPENSE_CATS.map(e => {
            const pct = Math.round((e.amount / totalExpenses) * 100);
            return (
              <div key={e.category}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, color: TEXT }}>{e.category}</span>
                  <span style={{ fontSize: 13, color: MUTED, fontFamily: "monospace" }}>
                    ${e.amount.toLocaleString()} <span style={{ color: MUTED, fontSize: 11 }}>({pct}%)</span>
                  </span>
                </div>
                <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                  <div style={{ height: 4, width: `${pct}%`, background: ACCENT + "88", borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 14, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Total</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, fontFamily: "monospace" }}>${totalExpenses.toLocaleString()}</span>
        </div>
      </div>

      <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
        The full dashboard includes transactions, balance sheet, depreciation tracking, tax estimates, and CSV / PDF exports.
      </p>
    </div>
  );
}

function ServicesTab() {
  const cats = [...new Set(SERVICES.map(s => s.category))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>
        Service Catalog
      </p>
      {cats.map(cat => (
        <div key={cat}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <h3 style={{ fontWeight: 800, fontSize: 15, color: TEXT, margin: 0 }}>{cat}</h3>
            <span style={{ color: MUTED, fontSize: 12 }}>
              {SERVICES.filter(s => s.category === cat).length} services
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SERVICES.filter(s => s.category === cat).map(svc => (
              <div key={svc.id} style={{ ...card, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{svc.name}</span>
                  <span style={{ color: MUTED, fontSize: 12 }}>{svc.description} · {svc.duration} min</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 16, color: ACCENT, flexShrink: 0 }}>${svc.price}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type DemoTab = "customer" | "appointments" | "chairs" | "financials" | "services";

const TABS: { key: DemoTab; label: string }[] = [
  { key: "customer",     label: "Customer View"  },
  { key: "appointments", label: "Appointments"   },
  { key: "chairs",       label: "Staff & Chairs" },
  { key: "financials",   label: "Financials"     },
  { key: "services",     label: "Services"       },
];

export default function DemoDashboardPage() {
  const [tab, setTab]               = useState<DemoTab>("appointments");
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 640);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif" }}>

      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px 16px" : "18px 32px", borderBottom: `1px solid ${BORDER}`, gap: 12 }}>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontWeight: 900, fontSize: isMobile ? 15 : 18, letterSpacing: -0.5, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Demo Cuts
          </span>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <span style={badge(ACCENT)}>pro</span>
            <span style={badge(GREEN)}>active</span>
          </div>
        </div>
        <a
          href="/register"
          style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 900, fontSize: 13, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" as const, flexShrink: 0 }}>
          Start Free Trial →
        </a>
      </nav>

      {/* Demo banner */}
      <div style={{ background: ACCENT + "15", borderBottom: `1px solid ${ACCENT}33`, padding: "10px 24px", textAlign: "center" }}>
        <span style={{ color: ACCENT, fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
          DEMO — sample data only. No real bookings or payments.
        </span>
        {"  "}
        <a href="/register" style={{ color: ACCENT, fontWeight: 900, fontSize: 13, textDecoration: "underline" }}>
          Start your free trial →
        </a>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "20px 16px" : "36px 24px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Metric cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          {[
            { label: "Revenue Today",      value: `$${REVENUE_TODAY}`, color: ACCENT },
            { label: "Appointments Today", value: String(APPOINTMENTS.length), color: TEXT },
            { label: "Avg Ticket",         value: `$${AVG_TICKET}`,   color: TEXT  },
            { label: "Active Chairs",      value: "3",                 color: GREEN },
          ].map(m => (
            <div key={m.label} style={card}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>{m.label}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* CTA banner */}
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" as const, border: `1px solid ${ACCENT}44` }}>
          <div>
            <p style={{ fontWeight: 900, fontSize: 17, color: TEXT, margin: "0 0 4px" }}>Ready to fill your chairs?</p>
            <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Your own booking page, QR codes, and dashboard — up in minutes.</p>
          </div>
          <a href="/register" style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "13px 28px", fontWeight: 900, fontSize: 14, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" as const }}>
            Start Free Trial →
          </a>
        </div>

        {/* Tab bar */}
        <div>
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 24, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                style={{
                  background: "none", border: "none",
                  borderBottom: tab === key ? `2px solid ${ACCENT}` : "2px solid transparent",
                  color: tab === key ? ACCENT : MUTED,
                  padding: isMobile ? "10px 12px" : "12px 22px",
                  fontWeight: 700, fontSize: isMobile ? 12 : 13,
                  cursor: "pointer", whiteSpace: "nowrap" as const,
                  transition: "color 0.15s", flexShrink: 0,
                }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "customer"     && <CustomerTab     selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} />}
          {tab === "appointments" && <AppointmentsTab />}
          {tab === "chairs"       && <ChairsTab />}
          {tab === "financials"   && <FinancialsDemoTab />}
          {tab === "services"     && <ServicesTab />}
        </div>
      </div>
    </div>
  );
}
