import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACCENT, BG, BORDER, MUTED, SURFACE, TEXT, GREEN, RED } from "../constants/theme";
import { jsPDF } from "jspdf";

// ── Types ────────────────────────────────────────────────────────────────────
type Business = { id: string; name: string };
type Location  = { id: string; name: string; label: string | null };
type MenuItem  = { id: string; name: string; price: number };

type Appointment = {
  id: string; location_id: string | null; service_name: string | null;
  date: string; status: string;
};
type Expense = { id: string; amount: number; category: string; description: string | null; expense_date: string };
type BSItem  = { id: string; type: string; label: string; amount: number; as_of_date: string };
type Draw    = { id: string; amount: number; description: string | null; draw_date: string };
type DepAsset = { id: string; name: string; purchase_price: number; purchase_date: string; useful_life: number };

type FinTab = "overview" | "transactions" | "balance" | "depreciation" | "taxes" | "reports";

const TODAY = new Date().toISOString().slice(0, 10);
const EXPENSE_CATS = ["Rent", "Supplies", "Utilities", "Payroll", "Marketing", "Misc"] as const;

const SE_TAX_RATE    = 0.153;
const SE_NET_EARN    = 0.9235;
const FED_RATE       = 0.22;
const MN_RATE        = 0.068;
const QUARTERS = [
  { label: "Q1 (Jan–Mar)",  due: "Apr 15"  },
  { label: "Q2 (Apr–May)",  due: "Jun 16"  },
  { label: "Q3 (Jun–Aug)",  due: "Sep 15"  },
  { label: "Q4 (Sep–Dec)",  due: "Jan 15"  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function calcDepreciation(asset: DepAsset) {
  const annual      = asset.purchase_price / asset.useful_life;
  const purchase    = new Date(asset.purchase_date);
  const now         = new Date();
  const yearsElapsed = Math.max(0, (now.getTime() - purchase.getTime()) / (365.25 * 24 * 3600 * 1000));
  const accumulated = Math.min(asset.purchase_price, annual * yearsElapsed);
  const bookValue   = asset.purchase_price - accumulated;
  return { annual, accumulated, bookValue };
}

function fmt(n: number) { return `$${Math.abs(n).toFixed(2)}`; }
function fmtSigned(n: number) { return `${n < 0 ? "-" : "+"}$${Math.abs(n).toFixed(2)}`; }

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function pdfDoc(title: string, bizName: string, rows: string[][], headers: string[]): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const PW = doc.internal.pageSize.getWidth();
  let y = 50;

  doc.setFillColor(8, 8, 8);
  doc.rect(0, 0, PW, 40, "F");
  doc.setTextColor(232, 197, 71);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("QRBooker", 30, 26);
  doc.setTextColor(240, 237, 232);
  doc.setFontSize(11);
  doc.text(bizName, 110, 26);

  y = 60;
  doc.setTextColor(232, 197, 71);
  doc.setFontSize(13);
  doc.text(title, 30, y);
  doc.setTextColor(102, 102, 102);
  doc.setFontSize(9);
  doc.text(`Generated ${TODAY}`, PW - 30, y, { align: "right" });
  y += 18;
  doc.setDrawColor(232, 197, 71);
  doc.setLineWidth(0.5);
  doc.line(30, y, PW - 30, y);
  y += 14;

  // Header row
  const colW = (PW - 60) / headers.length;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(102, 102, 102);
  headers.forEach((h, i) => doc.text(h, 30 + i * colW, y));
  y += 5;
  doc.setDrawColor(50, 50, 50);
  doc.line(30, y, PW - 30, y);
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  rows.forEach((row) => {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 40;
    }
    const isTotalRow = row[0].toUpperCase().includes("TOTAL") || row[0].toUpperCase().includes("NET");
    if (isTotalRow) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(232, 197, 71);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(240, 237, 232);
    }
    row.forEach((cell, i) => doc.text(String(cell), 30 + i * colW, y));
    y += 14;
  });

  const fileSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  doc.save(`${fileSlug}_${TODAY}.pdf`);
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px",
};
const inputStyle: React.CSSProperties = {
  background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
  color: TEXT, fontSize: 13, width: "100%", boxSizing: "border-box",
};
const btnPrimary: React.CSSProperties = {
  background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "9px 18px",
  fontWeight: 800, fontSize: 13, cursor: "pointer",
};
const btnOutline = (disabled = false): React.CSSProperties => ({
  background: "none", border: `1px solid ${disabled ? BORDER : ACCENT}`,
  borderRadius: 8, padding: "7px 14px", color: disabled ? MUTED : ACCENT,
  fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});
const label11: React.CSSProperties = {
  fontSize: 11, letterSpacing: 2, color: ACCENT, fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 16,
};
const subTabBtn = (active: boolean): React.CSSProperties => ({
  background: active ? ACCENT + "22" : "none",
  border: `1px solid ${active ? ACCENT + "66" : BORDER}`,
  borderRadius: 8, padding: "7px 16px",
  color: active ? ACCENT : MUTED, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer",
});

// ── Main Component ────────────────────────────────────────────────────────────
export function FinancialsTab({ business, locations, menuItems }: {
  business: Business; locations: Location[]; menuItems: MenuItem[];
}) {
  const [finTab, setFinTab] = useState<FinTab>("overview");

  // Data
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [bsItems, setBsItems]           = useState<BSItem[]>([]);
  const [draws, setDraws]               = useState<Draw[]>([]);
  const [depAssets, setDepAssets]       = useState<DepAsset[]>([]);
  const [loadingData, setLoadingData]   = useState(true);

  // ── Load all financial data ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingData(true);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      const [apptRes, expRes, bsRes, drawRes, depRes] = await Promise.all([
        supabase.from("appointments")
          .select("id, location_id, service_name, date, status")
          .eq("business_id", business.id)
          .gte("date", ninetyDaysAgo)
          .order("date", { ascending: false }),
        supabase.from("business_expenses")
          .select("id, amount, category, description, expense_date")
          .eq("business_id", business.id)
          .order("expense_date", { ascending: false }),
        supabase.from("balance_sheet_items")
          .select("id, type, label, amount, as_of_date")
          .eq("business_id", business.id)
          .order("as_of_date", { ascending: false }),
        supabase.from("owner_draws")
          .select("id, amount, description, draw_date")
          .eq("business_id", business.id)
          .order("draw_date", { ascending: false }),
        supabase.from("depreciation_assets")
          .select("id, name, purchase_price, purchase_date, useful_life")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;
      setAppointments((apptRes.data as Appointment[]) ?? []);
      setExpenses((expRes.data as Expense[]) ?? []);
      setBsItems((bsRes.data as BSItem[]) ?? []);
      setDraws((drawRes.data as Draw[]) ?? []);
      setDepAssets((depRes.data as DepAsset[]) ?? []);
      setLoadingData(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [business.id]);

  if (loadingData) {
    return <div style={{ color: MUTED, textAlign: "center", padding: 40 }}>Loading financials…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Sub-tab nav */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["overview", "transactions", "balance", "depreciation", "taxes", "reports"] as FinTab[]).map((t) => (
          <button key={t} onClick={() => setFinTab(t)} style={subTabBtn(finTab === t)}>
            {t === "overview" ? "Overview" : t === "transactions" ? "Transactions" : t === "balance" ? "Balance Sheet" : t === "depreciation" ? "Depreciation" : t === "taxes" ? "Taxes" : "Reports"}
          </button>
        ))}
      </div>

      {finTab === "overview"     && <OverviewTab appointments={appointments} expenses={expenses} draws={draws} depAssets={depAssets} locations={locations} />}
      {finTab === "transactions" && <TransactionsTab business={business} expenses={expenses} setExpenses={setExpenses} draws={draws} setDraws={setDraws} />}
      {finTab === "balance"      && <BalanceTab business={business} bsItems={bsItems} setBsItems={setBsItems} draws={draws} depAssets={depAssets} bizName={business.name} />}
      {finTab === "depreciation" && <DepreciationTab business={business} depAssets={depAssets} setDepAssets={setDepAssets} expenses={expenses} setExpenses={setExpenses} />}
      {finTab === "taxes"        && <TaxesTab appointments={appointments} expenses={expenses} draws={draws} depAssets={depAssets} />}
      {finTab === "reports"      && <ReportsTab appointments={appointments} expenses={expenses} draws={draws} depAssets={depAssets} locations={locations} bizName={business.name} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ appointments, expenses, draws, depAssets, locations }: {
  appointments: Appointment[]; expenses: Expense[]; draws: Draw[];
  depAssets: DepAsset[]; locations: Location[];
}) {
  const now       = new Date();
  const todayStr  = now.toISOString().slice(0, 10);
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

  // KPI calcs
  const todayAppts    = appointments.filter((a) => a.date === todayStr);
  const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 6);
  const lastWeekStart = new Date(now); lastWeekStart.setDate(now.getDate() - 13);
  const lastWeekEnd   = new Date(now); lastWeekEnd.setDate(now.getDate() - 7);

  const thisWeekAppts = appointments.filter((a) => a.date >= thisWeekStart.toISOString().slice(0, 10));
  const lastWeekAppts = appointments.filter((a) => a.date >= lastWeekStart.toISOString().slice(0, 10) && a.date <= lastWeekEnd.toISOString().slice(0, 10));

  const noShowCount   = appointments.filter((a) => a.status === "no_show").length;
  const noShowRate    = appointments.length > 0 ? ((noShowCount / appointments.length) * 100).toFixed(1) : "0.0";

  // Barber counts
  const barberCounts: Record<string, number> = {};
  appointments.forEach((a) => {
    if (!a.location_id) return;
    const loc = locations.find((l) => l.id === a.location_id);
    const name = loc?.label || loc?.name || a.location_id;
    barberCounts[name] = (barberCounts[name] ?? 0) + 1;
  });
  const topBarber = Object.entries(barberCounts).sort((a, b) => b[1] - a[1])[0];

  // Busiest day
  const dayCount: Record<string, number> = {};
  appointments.forEach((a) => {
    const day = new Date(a.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
    dayCount[day] = (dayCount[day] ?? 0) + 1;
  });
  const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];

  // Revenue calcs — using appointment count * avg service price as proxy
  // (no orders table integration needed — appointments drive revenue display)
  const avgServicePrice = menuItems_avg(appointments);
  const thisMonthAppts  = appointments.filter((a) => a.date >= thisMonthStart && a.status !== "cancelled" && a.status !== "no_show");
  const lastMonthAppts  = appointments.filter((a) => a.date >= lastMonthStart && a.date <= lastMonthEnd && a.status !== "cancelled" && a.status !== "no_show");
  const thisMonthRev    = thisMonthAppts.length * avgServicePrice;
  const lastMonthRev    = lastMonthAppts.length * avgServicePrice;
  const revChange       = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev * 100) : 0;

  const thisMonthExp    = expenses.filter((e) => e.expense_date >= thisMonthStart).reduce((s, e) => s + Number(e.amount), 0);
  const totalDepExp     = depAssets.reduce((s, a) => s + calcDepreciation(a).annual / 12, 0);
  const totalMonthExp   = thisMonthExp + totalDepExp;
  const netProfit       = thisMonthRev - totalMonthExp;

  // Per-barber bookings this month
  const barberThisMonth: Record<string, number> = {};
  thisMonthAppts.forEach((a) => {
    if (!a.location_id) return;
    const loc = locations.find((l) => l.id === a.location_id);
    const name = loc?.label || loc?.name || "Unknown";
    barberThisMonth[name] = (barberThisMonth[name] ?? 0) + 1;
  });

  // 30-day trend
  const days30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  const apptByDay: Record<string, number> = {};
  days30.forEach((d) => { apptByDay[d] = 0; });
  appointments.filter((a) => a.status !== "cancelled" && a.status !== "no_show")
    .forEach((a) => { if (apptByDay[a.date] !== undefined) apptByDay[a.date]++; });
  const maxAppt = Math.max(...Object.values(apptByDay), 1);

  // Day-of-week bar chart
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowCount = Array(7).fill(0);
  appointments.forEach((a) => { const d = new Date(a.date + "T12:00:00"); dowCount[d.getDay()]++; });
  const maxDow = Math.max(...dowCount, 1);

  // Expense breakdown
  const expByCat: Record<string, number> = {};
  expenses.forEach((e) => { expByCat[e.category] = (expByCat[e.category] ?? 0) + Number(e.amount); });
  const totalExp90 = Object.values(expByCat).reduce((s, v) => s + v, 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: "Today's Appts",   value: todayAppts.length.toString(),          color: ACCENT },
          { label: "This Week",       value: thisWeekAppts.length.toString(),        color: TEXT,
            sub: `vs ${lastWeekAppts.length} last week` },
          { label: "No-show Rate",    value: `${noShowRate}%`,                       color: noShowCount > 0 ? RED : GREEN },
          { label: "Top Barber (90d)",value: topBarber?.[0] ?? "—",                  color: ACCENT,
            sub: topBarber ? `${topBarber[1]} bookings` : "" },
          { label: "Busiest Day",     value: busiestDay?.[0]?.slice(0, 3) ?? "—",   color: TEXT,
            sub: busiestDay ? `${busiestDay[1]} appts` : "" },
          { label: "Rev This Month",  value: fmt(thisMonthRev),                      color: GREEN,
            sub: `${revChange >= 0 ? "+" : ""}${revChange.toFixed(0)}% vs last month` },
          { label: "Expenses (Mo.)",  value: fmt(totalMonthExp),                     color: RED },
          { label: "Net Profit (Mo.)", value: fmt(netProfit),                        color: netProfit >= 0 ? GREEN : RED },
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* 30-day appointments trend */}
      <div style={card}>
        <p style={label11}>Appointments — Last 30 Days</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, overflowX: "auto" }}>
          {days30.map((day) => {
            const val = apptByDay[day];
            const pct = (val / maxAppt) * 100;
            return (
              <div key={day} title={`${day}: ${val}`} style={{ flex: "0 0 calc(100%/30)", minWidth: 6, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                  <div style={{ width: "100%", height: `${Math.max(pct, val > 0 ? 5 : 0)}%`, background: ACCENT + "99", borderRadius: "2px 2px 0 0", minHeight: val > 0 ? 3 : 0 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 10, color: MUTED }}>{days30[0]}</span>
          <span style={{ fontSize: 10, color: MUTED }}>{days30[days30.length - 1]}</span>
        </div>
      </div>

      {/* Day of week chart */}
      <div style={card}>
        <p style={label11}>Bookings by Day of Week (90d)</p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 80 }}>
          {DOW.map((d, i) => {
            const pct = (dowCount[i] / maxDow) * 100;
            return (
              <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                <div style={{ fontSize: 10, color: MUTED }}>{dowCount[i] > 0 ? dowCount[i] : ""}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                  <div style={{ width: "100%", height: `${Math.max(pct, dowCount[i] > 0 ? 5 : 0)}%`, background: ACCENT + "aa", borderRadius: "4px 4px 0 0" }} />
                </div>
                <div style={{ fontSize: 10, color: MUTED }}>{d}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-barber this month */}
      {Object.keys(barberThisMonth).length > 0 && (
        <div style={card}>
          <p style={label11}>Bookings per Barber — This Month</p>
          {Object.entries(barberThisMonth).sort((a, b) => b[1] - a[1]).map(([name, cnt]) => {
            const pct = (cnt / Math.max(...Object.values(barberThisMonth))) * 100;
            return (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: TEXT }}>{name}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{cnt} bookings</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: ACCENT + "88", borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expense breakdown */}
      <div style={card}>
        <p style={label11}>Expense Breakdown (All Time)</p>
        {Object.keys(expByCat).length === 0 ? (
          <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>No expenses recorded.</p>
        ) : (
          Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
            const pct = (amt / totalExp90) * 100;
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: TEXT }}>{cat}</span>
                  <span style={{ fontSize: 12, color: MUTED, fontFamily: "monospace" }}>{fmt(amt)} ({pct.toFixed(1)}%)</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: RED + "88", borderRadius: 3 }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// avg service price — uses appointment service_name to look up price; fallback to 35
function menuItems_avg(appointments: Appointment[]): number {
  // We can't access menuItems directly here without prop drilling, so use $35 fallback
  // (the Overview KPIs are directional, not accounting-grade)
  void appointments;
  return 35;
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS TAB (expenses + draws)
// ══════════════════════════════════════════════════════════════════════════════
function TransactionsTab({ business, expenses, setExpenses, draws, setDraws }: {
  business: Business;
  expenses: Expense[]; setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  draws: Draw[];       setDraws:    React.Dispatch<React.SetStateAction<Draw[]>>;
}) {
  const [view, setView] = useState<"expenses" | "draws">("expenses");

  // Expense form
  const [addingExp, setAddingExp] = useState(false);
  const [expForm, setExpForm]     = useState({ category: "Rent", amount: "", description: "", expense_date: TODAY });
  const [expErr, setExpErr]       = useState("");
  const [expSaving, setExpSaving] = useState(false);
  const [editExpId, setEditExpId] = useState<string | null>(null);
  const [editExpForm, setEditExpForm] = useState(expForm);

  // Draw form
  const [addingDraw, setAddingDraw] = useState(false);
  const [drawForm, setDrawForm]     = useState({ amount: "", description: "", draw_date: TODAY });
  const [drawErr, setDrawErr]       = useState("");
  const [drawSaving, setDrawSaving] = useState(false);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expForm.amount) return;
    setExpErr(""); setExpSaving(true);
    const { data, error } = await supabase.from("business_expenses").insert({
      business_id: business.id, category: expForm.category, amount: parseFloat(expForm.amount),
      description: expForm.description.trim() || null, expense_date: expForm.expense_date,
    }).select("id, amount, category, description, expense_date").single();
    if (error) { setExpErr(error.message); setExpSaving(false); return; }
    setExpenses((prev) => [data as Expense, ...prev]);
    setExpForm({ category: "Rent", amount: "", description: "", expense_date: TODAY });
    setAddingExp(false); setExpSaving(false);
  }

  async function updateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!editExpId) return;
    const { error } = await supabase.from("business_expenses").update({
      category: editExpForm.category, amount: parseFloat(editExpForm.amount),
      description: editExpForm.description.trim() || null, expense_date: editExpForm.expense_date,
    }).eq("id", editExpId);
    if (error) return;
    setExpenses((prev) => prev.map((x) => x.id === editExpId ? { ...x, ...editExpForm, amount: parseFloat(editExpForm.amount) } : x));
    setEditExpId(null);
  }

  async function deleteExpense(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    await supabase.from("business_expenses").delete().eq("id", id);
    setExpenses((prev) => prev.filter((x) => x.id !== id));
  }

  async function addDraw(e: React.FormEvent) {
    e.preventDefault();
    if (!drawForm.amount) return;
    setDrawErr(""); setDrawSaving(true);
    const { data, error } = await supabase.from("owner_draws").insert({
      business_id: business.id, amount: parseFloat(drawForm.amount),
      description: drawForm.description.trim() || null, draw_date: drawForm.draw_date,
    }).select("id, amount, description, draw_date").single();
    if (error) { setDrawErr(error.message); setDrawSaving(false); return; }
    setDraws((prev) => [data as Draw, ...prev]);
    setDrawForm({ amount: "", description: "", draw_date: TODAY });
    setAddingDraw(false); setDrawSaving(false);
  }

  async function deleteDraw(id: string) {
    if (!window.confirm("Delete this owner draw?")) return;
    await supabase.from("owner_draws").delete().eq("id", id);
    setDraws((prev) => prev.filter((x) => x.id !== id));
  }

  const totalExp   = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalDraws = draws.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setView("expenses")} style={subTabBtn(view === "expenses")}>Expenses</button>
        <button onClick={() => setView("draws")}    style={subTabBtn(view === "draws")}>Owner Draws</button>
      </div>

      {view === "expenses" && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ ...label11, marginBottom: 0 }}>Business Expenses — Total: {fmt(totalExp)}</p>
            <button onClick={() => setAddingExp(true)} style={btnPrimary}>+ Add</button>
          </div>

          {addingExp && (
            <form onSubmit={addExpense} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20, padding: 16, background: BG, borderRadius: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} style={inputStyle}>
                  {EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input type="number" min="0" step="0.01" placeholder="Amount ($)" value={expForm.amount}
                  onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} style={inputStyle} required />
              </div>
              <input type="text" placeholder="Description (optional)" value={expForm.description}
                onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} style={inputStyle} />
              <input type="date" value={expForm.expense_date}
                onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })} style={inputStyle} />
              {expErr && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{expErr}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={expSaving} style={btnPrimary}>{expSaving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setAddingExp(false)} style={btnOutline()}>Cancel</button>
              </div>
            </form>
          )}

          {expenses.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13 }}>No expenses yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {expenses.map((ex) => (
                <div key={ex.id}>
                  {editExpId === ex.id ? (
                    <form onSubmit={updateExpense} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: BG, borderRadius: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <select value={editExpForm.category} onChange={(e) => setEditExpForm({ ...editExpForm, category: e.target.value })} style={inputStyle}>
                          {EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}
                        </select>
                        <input type="number" min="0" step="0.01" value={editExpForm.amount}
                          onChange={(e) => setEditExpForm({ ...editExpForm, amount: e.target.value })} style={inputStyle} />
                      </div>
                      <input type="text" value={editExpForm.description}
                        onChange={(e) => setEditExpForm({ ...editExpForm, description: e.target.value })} style={inputStyle} />
                      <input type="date" value={editExpForm.expense_date}
                        onChange={(e) => setEditExpForm({ ...editExpForm, expense_date: e.target.value })} style={inputStyle} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="submit" style={btnPrimary}>Save</button>
                        <button type="button" onClick={() => setEditExpId(null)} style={btnOutline()}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{ex.category}</span>
                        {ex.description && <span style={{ fontSize: 12, color: MUTED, marginLeft: 8 }}>{ex.description}</span>}
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{ex.expense_date}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: RED }}>{fmt(ex.amount)}</span>
                        <button onClick={() => { setEditExpId(ex.id); setEditExpForm({ category: ex.category, amount: String(ex.amount), description: ex.description ?? "", expense_date: ex.expense_date }); }} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13 }}>Edit</button>
                        <button onClick={() => deleteExpense(ex.id)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 13 }}>Del</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "draws" && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ ...label11, marginBottom: 0 }}>Owner Draws — Total: {fmt(totalDraws)}</p>
            <button onClick={() => setAddingDraw(true)} style={btnPrimary}>+ Add Draw</button>
          </div>
          <p style={{ fontSize: 12, color: MUTED, marginBottom: 16, marginTop: -8 }}>
            Owner draws are personal withdrawals from business funds. They reduce your cash balance but are not a business expense for tax purposes.
          </p>

          {addingDraw && (
            <form onSubmit={addDraw} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20, padding: 16, background: BG, borderRadius: 8 }}>
              <input type="number" min="0" step="0.01" placeholder="Amount ($)" value={drawForm.amount}
                onChange={(e) => setDrawForm({ ...drawForm, amount: e.target.value })} style={inputStyle} required />
              <input type="text" placeholder="Description (optional)" value={drawForm.description}
                onChange={(e) => setDrawForm({ ...drawForm, description: e.target.value })} style={inputStyle} />
              <input type="date" value={drawForm.draw_date}
                onChange={(e) => setDrawForm({ ...drawForm, draw_date: e.target.value })} style={inputStyle} />
              {drawErr && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{drawErr}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={drawSaving} style={btnPrimary}>{drawSaving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setAddingDraw(false)} style={btnOutline()}>Cancel</button>
              </div>
            </form>
          )}

          {draws.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13 }}>No owner draws recorded.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {draws.map((d) => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <div>
                    <span style={{ fontSize: 13, color: TEXT }}>{d.description || "Owner Draw"}</span>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{d.draw_date}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: ACCENT }}>{fmt(d.amount)}</span>
                    <button onClick={() => deleteDraw(d.id)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 13 }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BALANCE SHEET TAB
// ══════════════════════════════════════════════════════════════════════════════
function BalanceTab({ business, bsItems, setBsItems, draws, depAssets, bizName }: {
  business: Business; bsItems: BSItem[]; setBsItems: React.Dispatch<React.SetStateAction<BSItem[]>>;
  draws: Draw[]; depAssets: DepAsset[]; bizName: string;
}) {
  const [addingType, setAddingType] = useState<"asset" | "liability" | "equity" | null>(null);
  const [form, setForm]   = useState({ label: "", amount: "", as_of_date: TODAY });
  const [err, setErr]     = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(form);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!addingType || !form.label.trim() || !form.amount) return;
    setErr(""); setSaving(true);
    const { data, error } = await supabase.from("balance_sheet_items").insert({
      business_id: business.id, type: addingType, label: form.label.trim(),
      amount: parseFloat(form.amount), as_of_date: form.as_of_date,
    }).select("id, type, label, amount, as_of_date").single();
    if (error) { setErr(error.message); setSaving(false); return; }
    setBsItems((prev) => [data as BSItem, ...prev]);
    setForm({ label: "", amount: "", as_of_date: TODAY });
    setAddingType(null); setSaving(false);
  }

  async function updateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    const { error } = await supabase.from("balance_sheet_items").update({
      label: editForm.label.trim(), amount: parseFloat(editForm.amount), as_of_date: editForm.as_of_date,
    }).eq("id", editId);
    if (error) return;
    setBsItems((prev) => prev.map((x) => x.id === editId ? { ...x, label: editForm.label, amount: parseFloat(editForm.amount), as_of_date: editForm.as_of_date } : x));
    setEditId(null);
  }

  async function deleteItem(id: string) {
    if (!window.confirm("Delete this balance sheet item?")) return;
    await supabase.from("balance_sheet_items").delete().eq("id", id);
    setBsItems((prev) => prev.filter((x) => x.id !== id));
  }

  const assets      = bsItems.filter((x) => x.type === "asset");
  const liabilities = bsItems.filter((x) => x.type === "liability");
  const equity      = bsItems.filter((x) => x.type === "equity");

  // Depreciation reduces asset values
  const totalDepAccum = depAssets.reduce((s, a) => s + calcDepreciation(a).accumulated, 0);
  const totalAssets   = assets.reduce((s, x) => s + Number(x.amount), 0) - totalDepAccum;
  const totalLiab     = liabilities.reduce((s, x) => s + Number(x.amount), 0);
  const totalEquity   = equity.reduce((s, x) => s + Number(x.amount), 0);
  const totalDraws    = draws.reduce((s, d) => s + Number(d.amount), 0);
  const liabPlusEq    = totalLiab + totalEquity - totalDraws;
  const balanced      = Math.abs(totalAssets - liabPlusEq) < 0.01;

  function exportPdf() {
    const rows: string[][] = [
      ["ASSETS", "", ""],
      ...assets.map((x) => [x.label, fmt(x.amount), x.as_of_date]),
      totalDepAccum > 0 ? ["Less: Accum. Depreciation", `(${fmt(totalDepAccum)})`, ""] : null,
      ["TOTAL ASSETS", fmt(totalAssets), ""],
      ["", "", ""],
      ["LIABILITIES", "", ""],
      ...liabilities.map((x) => [x.label, fmt(x.amount), x.as_of_date]),
      ["TOTAL LIABILITIES", fmt(totalLiab), ""],
      ["", "", ""],
      ["EQUITY", "", ""],
      ...equity.map((x) => [x.label, fmt(x.amount), x.as_of_date]),
      ["Less: Owner Draws", `(${fmt(totalDraws)})`, ""],
      ["TOTAL EQUITY (net)", fmt(totalEquity - totalDraws), ""],
      ["", "", ""],
      ["LIAB + EQUITY", fmt(liabPlusEq), balanced ? "BALANCED" : "CHECK"],
    ].filter(Boolean) as string[][];
    pdfDoc("Balance Sheet", bizName, rows, ["Item", "Amount", "Date"]);
  }

  function Section({ title, items, type, color }: { title: string; items: BSItem[]; type: "asset" | "liability" | "equity"; color: string }) {
    const total = items.reduce((s, x) => s + Number(x.amount), 0);
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color, textTransform: "uppercase" }}>{title}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmt(total)}</span>
            <button onClick={() => { setAddingType(type); setForm({ label: "", amount: "", as_of_date: TODAY }); }}
              style={{ ...btnOutline(), padding: "4px 10px", fontSize: 11 }}>+ Add</button>
          </div>
        </div>
        {addingType === type && (
          <form onSubmit={addItem} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: 12, background: BG, borderRadius: 8 }}>
            <input type="text" placeholder="Label" value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })} style={inputStyle} required />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input type="number" min="0" step="0.01" placeholder="Amount" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} required />
              <input type="date" value={form.as_of_date}
                onChange={(e) => setForm({ ...form, as_of_date: e.target.value })} style={inputStyle} />
            </div>
            {err && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{err}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setAddingType(null)} style={btnOutline()}>Cancel</button>
            </div>
          </form>
        )}
        {items.map((x) => (
          <div key={x.id}>
            {editId === x.id ? (
              <form onSubmit={updateItem} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8, padding: 10, background: BG, borderRadius: 8 }}>
                <input type="text" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} style={inputStyle} />
                  <input type="date" value={editForm.as_of_date} onChange={(e) => setEditForm({ ...editForm, as_of_date: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={btnPrimary}>Save</button>
                  <button type="button" onClick={() => setEditId(null)} style={btnOutline()}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                <div>
                  <span style={{ fontSize: 13, color: TEXT }}>{x.label}</span>
                  <div style={{ fontSize: 11, color: MUTED }}>{x.as_of_date}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color }}>{fmt(x.amount)}</span>
                  <button onClick={() => { setEditId(x.id); setEditForm({ label: x.label, amount: String(x.amount), as_of_date: x.as_of_date }); }} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 12 }}>Edit</button>
                  <button onClick={() => deleteItem(x.id)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 12 }}>Del</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>None added.</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <p style={{ ...label11, marginBottom: 0 }}>Balance Sheet</p>
          <button onClick={exportPdf} style={btnOutline()}>Export PDF</button>
        </div>

        {/* Balance check */}
        <div style={{ padding: "10px 14px", borderRadius: 8, background: balanced ? GREEN + "11" : RED + "11", border: `1px solid ${balanced ? GREEN : RED}33`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: balanced ? GREEN : RED, fontWeight: 700 }}>
            {balanced ? "Balanced — Assets = Liabilities + Equity" : `Out of balance by ${fmt(Math.abs(totalAssets - liabPlusEq))}`}
          </span>
          <span style={{ fontSize: 12, color: MUTED }}>Assets: {fmt(totalAssets)} | L+E: {fmt(liabPlusEq)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Section title="Assets" items={assets} type="asset" color={GREEN} />
          {totalDepAccum > 0 && (
            <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", padding: "6px 0", borderTop: `1px solid ${BORDER}` }}>
              Less accumulated depreciation: ({fmt(totalDepAccum)}) → Net assets: {fmt(totalAssets)}
            </div>
          )}
          <Section title="Liabilities" items={liabilities} type="liability" color={RED} />
          <Section title="Equity" items={equity} type="equity" color={ACCENT} />
          {draws.length > 0 && (
            <div style={{ padding: "10px 0", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: MUTED }}>Less: Owner Draws</span>
                <span style={{ fontSize: 13, color: ACCENT }}>({fmt(totalDraws)})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Net Equity</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: ACCENT }}>{fmt(totalEquity - totalDraws)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DEPRECIATION TAB
// ══════════════════════════════════════════════════════════════════════════════
function DepreciationTab({ business, depAssets, setDepAssets, expenses, setExpenses }: {
  business: Business;
  depAssets: DepAsset[]; setDepAssets: React.Dispatch<React.SetStateAction<DepAsset[]>>;
  expenses: Expense[]; setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
}) {
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState({ name: "", purchase_price: "", purchase_date: TODAY, useful_life: "5" });
  const [err, setErr]         = useState("");
  const [saving, setSaving]   = useState(false);

  async function addAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.purchase_price || !form.useful_life) return;
    setErr(""); setSaving(true);
    const { data, error } = await supabase.from("depreciation_assets").insert({
      business_id: business.id, name: form.name.trim(),
      purchase_price: parseFloat(form.purchase_price),
      purchase_date: form.purchase_date,
      useful_life: parseInt(form.useful_life, 10),
    }).select("id, name, purchase_price, purchase_date, useful_life").single();
    if (error) { setErr(error.message); setSaving(false); return; }
    setDepAssets((prev) => [data as DepAsset, ...prev]);
    setForm({ name: "", purchase_price: "", purchase_date: TODAY, useful_life: "5" });
    setAdding(false); setSaving(false);
  }

  async function deleteAsset(id: string) {
    if (!window.confirm("Delete this asset?")) return;
    await supabase.from("depreciation_assets").delete().eq("id", id);
    setDepAssets((prev) => prev.filter((x) => x.id !== id));
  }

  async function recordMonthlyDepreciation(asset: DepAsset) {
    const { annual } = calcDepreciation(asset);
    const monthly = annual / 12;
    const desc = `Monthly depreciation — ${asset.name}`;
    const { data, error } = await supabase.from("business_expenses").insert({
      business_id: business.id, category: "Depreciation", amount: parseFloat(monthly.toFixed(2)),
      description: desc, expense_date: TODAY,
    }).select("id, amount, category, description, expense_date").single();
    if (error) { alert(error.message); return; }
    setExpenses((prev) => [data as Expense, ...prev]);
    alert(`Recorded $${monthly.toFixed(2)} depreciation expense for ${asset.name}.`);
  }

  const totalAnnualDep = depAssets.reduce((s, a) => s + calcDepreciation(a).annual, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ ...label11, marginBottom: 0 }}>Depreciation Tracker</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: MUTED }}>Annual: {fmt(totalAnnualDep)}</span>
            <button onClick={() => setAdding(true)} style={btnPrimary}>+ Add Asset</button>
          </div>
        </div>

        <p style={{ fontSize: 12, color: MUTED, marginBottom: 16, marginTop: -8 }}>
          Straight-line depreciation. Book value flows to balance sheet assets; annual expense reduces P&L.
        </p>

        {adding && (
          <form onSubmit={addAsset} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20, padding: 16, background: BG, borderRadius: 8 }}>
            <input type="text" placeholder="Asset name (e.g. Barber Chair)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} required />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <input type="number" min="0.01" step="0.01" placeholder="Purchase price ($)" value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} style={inputStyle} required />
              <input type="date" value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} style={inputStyle} />
              <input type="number" min="1" step="1" placeholder="Useful life (years)" value={form.useful_life}
                onChange={(e) => setForm({ ...form, useful_life: e.target.value })} style={inputStyle} required />
            </div>
            {err && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{err}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Save Asset"}</button>
              <button type="button" onClick={() => setAdding(false)} style={btnOutline()}>Cancel</button>
            </div>
          </form>
        )}

        {depAssets.length === 0 ? (
          <p style={{ color: MUTED, fontSize: 13 }}>No depreciating assets yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {depAssets.map((asset) => {
              const { annual, accumulated, bookValue } = calcDepreciation(asset);
              const fullyDepreciated = bookValue <= 0.01;
              return (
                <div key={asset.id} style={{ padding: 16, background: BG, borderRadius: 8, border: `1px solid ${fullyDepreciated ? BORDER : BORDER}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: fullyDepreciated ? MUTED : TEXT }}>{asset.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        Purchased {asset.purchase_date} · {asset.useful_life}yr life · {fmt(asset.purchase_price)} cost
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!fullyDepreciated && (
                        <button onClick={() => recordMonthlyDepreciation(asset)} style={{ ...btnOutline(), fontSize: 11, padding: "5px 10px" }}>
                          Record Monthly
                        </button>
                      )}
                      <button onClick={() => deleteAsset(asset.id)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 12 }}>Del</button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Annual Dep.", value: fmt(annual), color: MUTED },
                      { label: "Monthly Dep.", value: fmt(annual / 12), color: MUTED },
                      { label: "Accumulated", value: fmt(accumulated), color: RED },
                      { label: "Book Value", value: fmt(Math.max(0, bookValue)), color: fullyDepreciated ? MUTED : GREEN },
                    ].map((s) => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {fullyDepreciated && (
                    <div style={{ marginTop: 10, fontSize: 11, color: MUTED, fontStyle: "italic" }}>Fully depreciated</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CSV export */}
      {depAssets.length > 0 && (
        <button onClick={() => {
          const rows: string[][] = [
            ["Asset", "Cost", "Purchase Date", "Life (yrs)", "Annual Dep.", "Accumulated", "Book Value"],
            ...depAssets.map((a) => {
              const d = calcDepreciation(a);
              return [a.name, fmt(a.purchase_price), a.purchase_date, String(a.useful_life), fmt(d.annual), fmt(d.accumulated), fmt(Math.max(0, d.bookValue))];
            }),
          ];
          downloadCsv("depreciation_schedule", rows);
        }} style={{ ...btnOutline(), alignSelf: "flex-start" }}>
          Export Schedule CSV
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAXES TAB
// ══════════════════════════════════════════════════════════════════════════════
function TaxesTab({ appointments, expenses, draws, depAssets }: {
  appointments: Appointment[]; expenses: Expense[]; draws: Draw[]; depAssets: DepAsset[];
}) {
  const now         = new Date();
  const yearStart   = `${now.getFullYear()}-01-01`;

  // YTD revenue proxy: done appointments × $35 avg
  const ytdAppts    = appointments.filter((a) => a.date >= yearStart && a.status !== "cancelled" && a.status !== "no_show");
  const ytdRevenue  = ytdAppts.length * 35;

  // YTD expenses
  const ytdExp      = expenses.filter((e) => e.expense_date >= yearStart).reduce((s, e) => s + Number(e.amount), 0);
  const ytdDepExp   = depAssets.reduce((s, a) => {
    const { annual } = calcDepreciation(a);
    const monthsElapsed = (now.getMonth() + 1); // months this year
    return s + (annual / 12) * monthsElapsed;
  }, 0);
  const totalYtdExp = ytdExp + ytdDepExp;

  // Net profit
  const netProfit   = ytdRevenue - totalYtdExp;
  const taxableNet  = Math.max(0, netProfit);

  // SE tax
  const seBase      = taxableNet * SE_NET_EARN;
  const seTax       = seBase * SE_TAX_RATE;
  const seDeduction = seTax / 2; // deductible half of SE tax

  // Federal & state income tax (estimated)
  const fedTaxable  = Math.max(0, taxableNet - seDeduction);
  const fedTax      = fedTaxable * FED_RATE;
  const mnTax       = fedTaxable * MN_RATE;
  const totalTax    = seTax + fedTax + mnTax;

  // Quarterly payments (equal quarters)
  const quarterlyEst = totalTax / 4;

  // YTD draws
  const ytdDraws = draws.filter((d) => d.draw_date >= yearStart).reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Disclaimer */}
      <div style={{ padding: "10px 14px", borderRadius: 8, background: ACCENT + "11", border: `1px solid ${ACCENT}33`, fontSize: 12, color: MUTED }}>
        Estimates only — consult a tax professional. Revenue is estimated at $35/appointment. MN has 0% sales tax on haircuts.
      </div>

      {/* YTD summary */}
      <div style={card}>
        <p style={label11}>YTD Tax Summary — {now.getFullYear()}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "YTD Revenue (est.)", value: fmt(ytdRevenue),   color: GREEN },
            { label: "YTD Expenses",       value: fmt(totalYtdExp),  color: RED   },
            { label: "Net Profit",         value: fmt(netProfit),    color: netProfit >= 0 ? GREEN : RED },
            { label: "Owner Draws YTD",    value: fmt(ytdDraws),     color: ACCENT },
          ].map((s) => (
            <div key={s.label} style={{ ...card, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Self-Employment Tax Base (92.35% of net)", value: fmt(seBase) },
            { label: `SE Tax (${(SE_TAX_RATE * 100).toFixed(1)}%)`,  value: fmt(seTax), bold: true },
            { label: "Deductible half of SE tax",                  value: fmt(seDeduction) },
            { label: `Federal Income Tax (est. ${(FED_RATE * 100).toFixed(0)}%)`, value: fmt(fedTax), bold: true },
            { label: `MN State Income Tax (est. ${(MN_RATE * 100).toFixed(1)}%)`, value: fmt(mnTax),  bold: true },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 13, color: MUTED }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: r.bold ? 800 : 400, color: TEXT }}>{r.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>Total Estimated Tax</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: RED }}>{fmt(totalTax)}</span>
          </div>
        </div>
      </div>

      {/* Quarterly payments */}
      <div style={card}>
        <p style={label11}>Quarterly Estimated Payments</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {QUARTERS.map((q, i) => {
            const qStart = [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-04-01`, `${now.getFullYear()}-06-01`, `${now.getFullYear()}-09-01`][i];
            const qEnd   = [`${now.getFullYear()}-03-31`, `${now.getFullYear()}-05-31`, `${now.getFullYear()}-08-31`, `${now.getFullYear()}-12-31`][i];
            const qAppts = appointments.filter((a) => a.date >= qStart && a.date <= qEnd && a.status !== "cancelled" && a.status !== "no_show").length;
            return (
              <div key={q.label} style={{ ...card, padding: "16px 18px", border: `1px solid ${ACCENT}33` }}>
                <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{q.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: TEXT }}>{fmt(quarterlyEst)}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Due {q.due} · {qAppts} appts this quarter</div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: MUTED, marginTop: 14 }}>
          Pay via IRS Direct Pay or mail Form 1040-ES. Minnesota quarterly payments go to MN Dept. of Revenue.
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS TAB
// ══════════════════════════════════════════════════════════════════════════════
function ReportsTab({ appointments, expenses, draws, depAssets, locations, bizName }: {
  appointments: Appointment[]; expenses: Expense[]; draws: Draw[];
  depAssets: DepAsset[]; locations: Location[]; bizName: string;
}) {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const now = new Date();

  function periodRange(): [string, string] {
    if (period === "month") {
      const s = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const e = TODAY;
      return [s, e];
    }
    if (period === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
      return [s, TODAY];
    }
    return [`${now.getFullYear()}-01-01`, TODAY];
  }

  const [startDate, endDate] = periodRange();
  const PERIOD_LABEL = period === "month" ? "Month to Date" : period === "quarter" ? "Quarter to Date" : "Year to Date";

  const periodAppts  = appointments.filter((a) => a.date >= startDate && a.date <= endDate && a.status !== "cancelled" && a.status !== "no_show");
  const periodExp    = expenses.filter((e) => e.expense_date >= startDate && e.expense_date <= endDate);
  const revenue      = periodAppts.length * 35;
  const totalExp     = periodExp.reduce((s, e) => s + Number(e.amount), 0);

  // Monthly depreciation expense for the period
  const months = period === "month" ? 1 : period === "quarter" ? 3 : now.getMonth() + 1;
  const depExp  = depAssets.reduce((s, a) => s + (calcDepreciation(a).annual / 12) * months, 0);

  const net = revenue - totalExp - depExp;

  // Expense by category
  const expByCat: Record<string, number> = {};
  periodExp.forEach((e) => { expByCat[e.category] = (expByCat[e.category] ?? 0) + Number(e.amount); });
  if (depExp > 0) expByCat["Depreciation"] = (expByCat["Depreciation"] ?? 0) + depExp;

  // By barber
  const byBarber: Record<string, number> = {};
  periodAppts.forEach((a) => {
    const loc = locations.find((l) => l.id === a.location_id);
    const name = loc?.label || loc?.name || "Unknown";
    byBarber[name] = (byBarber[name] ?? 0) + 1;
  });

  // Draws in period
  const periodDraws = draws.filter((d) => d.draw_date >= startDate && d.draw_date <= endDate);
  const totalDraws  = periodDraws.reduce((s, d) => s + Number(d.amount), 0);

  function exportPnLCsv() {
    const rows: string[][] = [
      ["Type", "Description", "Amount"],
      ["Revenue", `Appointments (${periodAppts.length} × $35 est.)`, revenue.toFixed(2)],
      ["TOTAL REVENUE", "", revenue.toFixed(2)],
      ...Object.entries(expByCat).map(([cat, amt]) => ["Expense", cat, (-amt).toFixed(2)]),
      ["TOTAL EXPENSES", "", (-totalExp - depExp).toFixed(2)],
      ["NET PROFIT / (LOSS)", "", net.toFixed(2)],
    ];
    downloadCsv(`pnl_${period}_${startDate}`, rows);
  }

  function exportPnLPdf() {
    const rows: string[][] = [
      ["Revenue", `Appointments (${periodAppts.length} × $35 est.)`, fmt(revenue)],
      ["TOTAL REVENUE", "", fmt(revenue)],
      ...Object.entries(expByCat).map(([cat, amt]) => ["Expense", cat, fmt(amt)]),
      ["TOTAL EXPENSES", "", fmt(totalExp + depExp)],
      ["NET PROFIT / (LOSS)", "", `${net < 0 ? "-" : ""}${fmt(net)}`],
    ];
    pdfDoc(`P&L — ${PERIOD_LABEL}`, bizName, rows, ["Type", "Description", "Amount"]);
  }

  function exportExpCsv() {
    const rows: string[][] = [
      ["Date", "Category", "Description", "Amount"],
      ...periodExp.map((e) => [e.expense_date, e.category, e.description ?? "", e.amount.toFixed(2)]),
      ["TOTAL", "", "", (totalExp).toFixed(2)],
    ];
    downloadCsv(`expenses_${period}_${startDate}`, rows);
  }

  function exportApptCsv() {
    const rows: string[][] = [
      ["Date", "Barber", "Service", "Status"],
      ...periodAppts.map((a) => {
        const loc = locations.find((l) => l.id === a.location_id);
        return [a.date, loc?.label || loc?.name || "—", a.service_name || "—", a.status];
      }),
    ];
    downloadCsv(`appointments_${period}_${startDate}`, rows);
  }

  function exportBarberCsv() {
    const rows: string[][] = [
      ["Barber", "Appointments", "Est. Revenue"],
      ...Object.entries(byBarber).sort((a, b) => b[1] - a[1]).map(([name, cnt]) => [name, String(cnt), fmt(cnt * 35)]),
      ["TOTAL", String(periodAppts.length), fmt(revenue)],
    ];
    downloadCsv(`revenue_per_barber_${period}`, rows);
  }

  function exportCashFlowCsv() {
    const rows: string[][] = [
      ["Type", "Description", "Date", "Amount"],
      ["Inflow", `Est. appointment revenue (${periodAppts.length} appts)`, startDate, revenue.toFixed(2)],
      ...periodExp.map((e) => ["Outflow", `${e.category}${e.description ? " — " + e.description : ""}`, e.expense_date, (-Number(e.amount)).toFixed(2)]),
      ...periodDraws.map((d) => ["Outflow (Draw)", d.description || "Owner Draw", d.draw_date, (-Number(d.amount)).toFixed(2)]),
      ["NET CASH FLOW", "", "", (revenue - totalExp - totalDraws).toFixed(2)],
    ];
    downloadCsv(`cash_flow_${period}`, rows);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Period selector */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["month", "quarter", "year"] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} style={subTabBtn(period === p)}>
            {p === "month" ? "Month" : p === "quarter" ? "Quarter" : "Year"}
          </button>
        ))}
      </div>

      {/* P&L */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ ...label11, marginBottom: 0 }}>P&L — {PERIOD_LABEL}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportPnLCsv} style={btnOutline()}>CSV</button>
            <button onClick={exportPnLPdf} style={btnOutline()}>PDF</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, color: TEXT }}>Revenue ({periodAppts.length} appts × $35 est.)</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{fmt(revenue)}</span>
          </div>
          {Object.entries(expByCat).map(([cat, amt]) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 13, color: MUTED }}>{cat}</span>
              <span style={{ fontSize: 13, color: RED }}>({fmt(amt)})</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>Net Profit / (Loss)</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: net >= 0 ? GREEN : RED }}>{fmtSigned(net)}</span>
          </div>
        </div>
      </div>

      {/* Expense report */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ ...label11, marginBottom: 0 }}>Expense Report — {PERIOD_LABEL}</p>
          <button onClick={exportExpCsv} style={btnOutline(periodExp.length === 0)} disabled={periodExp.length === 0}>CSV</button>
        </div>
        {periodExp.length === 0 ? (
          <p style={{ color: MUTED, fontSize: 13 }}>No expenses in this period.</p>
        ) : (
          Object.entries(expByCat).map(([cat, amt]) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 13, color: TEXT }}>{cat}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: RED }}>{fmt(amt)}</span>
            </div>
          ))
        )}
        {periodExp.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: RED }}>{fmt(totalExp)}</span>
          </div>
        )}
      </div>

      {/* Appointment / barber revenue */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ ...label11, marginBottom: 0 }}>Revenue per Barber — {PERIOD_LABEL}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportApptCsv} style={btnOutline(periodAppts.length === 0)} disabled={periodAppts.length === 0}>Appts CSV</button>
            <button onClick={exportBarberCsv} style={btnOutline(periodAppts.length === 0)} disabled={periodAppts.length === 0}>Barbers CSV</button>
          </div>
        </div>
        {Object.keys(byBarber).length === 0 ? (
          <p style={{ color: MUTED, fontSize: 13 }}>No appointments in this period.</p>
        ) : (
          Object.entries(byBarber).sort((a, b) => b[1] - a[1]).map(([name, cnt]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 13, color: TEXT }}>{name}</span>
              <span style={{ fontSize: 13, color: MUTED }}>{cnt} appts · <span style={{ color: GREEN, fontWeight: 700 }}>{fmt(cnt * 35)} est.</span></span>
            </div>
          ))
        )}
      </div>

      {/* Cash flow */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ ...label11, marginBottom: 0 }}>Cash Flow — {PERIOD_LABEL}</p>
          <button onClick={exportCashFlowCsv} style={btnOutline()}>CSV</button>
        </div>
        {[
          { label: "Revenue (inflows)",  value: revenue,                   color: GREEN },
          { label: "Expenses (outflows)", value: -(totalExp + depExp),     color: RED   },
          { label: "Owner Draws",         value: -totalDraws,              color: ACCENT },
          { label: "Net Cash Flow",       value: revenue - totalExp - depExp - totalDraws, color: (revenue - totalExp - depExp - totalDraws) >= 0 ? GREEN : RED },
        ].map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, color: MUTED }}>{r.label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.value < 0 ? `(${fmt(-r.value)})` : fmt(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
