import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const ACCENT = "#E8C547";
const BG = "#080808";
const SURFACE = "#111";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#F0EDE8";
const MUTED = "#666";
const GREEN = "#4CAF50";
const RED = "#f44336";

const EXPENSE_CATEGORIES = [
  "Rent", "Utilities", "Payroll", "Supplies",
  "Marketing", "Equipment", "Insurance", "Maintenance", "Other",
];

const inputStyle = {
  width: "100%", background: "#141414",
  border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: "10px", color: TEXT, boxSizing: "border-box",
};

const selectStyle = {
  width: "100%", background: "#141414",
  border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: "10px", color: TEXT, boxSizing: "border-box", cursor: "pointer",
};

const btn = (extra = {}) => ({
  border: "none", borderRadius: 8, cursor: "pointer",
  fontWeight: 700, display: "flex", alignItems: "center",
  justifyContent: "center", ...extra,
});

const fmt = (n) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtSigned = (n) =>
  n < 0
    ? `-$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SQL_SETUP = `-- Run once in your Supabase SQL Editor
create table if not exists business_expenses (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade,
  amount      numeric not null,
  category    text not null default 'Other',
  description text,
  expense_date date not null,
  created_at  timestamptz default now()
);
alter table business_expenses enable row level security;
create policy "owner_access" on business_expenses
  using (business_id in (
    select id from businesses where owner_id = auth.uid()
  ));`;

// ─── Chart helpers ────────────────────────────────────────────────────────────

function buildChartData(orders, period) {
  if (!orders.length) return [];
  const now = new Date();
  const grouped = {};

  if (period === "month") {
    const year = now.getFullYear();
    const month = now.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      grouped[key] = 0;
    }
    orders.forEach(o => {
      const day = o.created_at.slice(0, 10);
      if (grouped[day] !== undefined) grouped[day] += parseFloat(o.total || 0);
    });
    return Object.entries(grouped).map(([k, v]) => ({ label: k.slice(8), value: v }));
  }

  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), q * 3, 1);
    const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0);
    let ws = new Date(qStart), wn = 1;
    while (ws <= qEnd) { grouped[`W${wn}`] = 0; ws.setDate(ws.getDate() + 7); wn++; }
    orders.forEach(o => {
      const diffDays = Math.floor((new Date(o.created_at) - qStart) / 86400000);
      const key = `W${Math.floor(diffDays / 7) + 1}`;
      if (grouped[key] !== undefined) grouped[key] += parseFloat(o.total || 0);
    });
    return Object.entries(grouped).map(([k, v]) => ({ label: k, value: v }));
  }

  if (period === "year") {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const year = now.getFullYear();
    months.forEach((_, i) => {
      grouped[`${year}-${String(i + 1).padStart(2, "0")}`] = 0;
    });
    orders.forEach(o => {
      const k = o.created_at.slice(0, 7);
      if (grouped[k] !== undefined) grouped[k] += parseFloat(o.total || 0);
    });
    const months_ = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return Object.entries(grouped).map(([k, v]) => ({ label: months_[parseInt(k.slice(5)) - 1], value: v }));
  }

  // all time — group by month
  orders.forEach(o => {
    const k = o.created_at.slice(0, 7);
    grouped[k] = (grouped[k] || 0) + parseFloat(o.total || 0);
  });
  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ label: k, value: v }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 22px" }}>
      <div style={{ color: MUTED, fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || TEXT, fontFamily: "monospace" }}>
        {value}
      </div>
      {sub && <div style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function RevenueBarChart({ orders, period }) {
  const [hovered, setHovered] = useState(null);
  const data = buildChartData(orders, period);
  const hasData = data.some(d => d.value > 0);

  const periodLabel = period === "month" ? "by Day" : period === "quarter" ? "by Week" : "by Month";

  if (!data.length || !hasData) {
    return (
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 4 }}>Money In — {periodLabel}</div>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 20, textAlign: "center", paddingBottom: 10 }}>
          No revenue data for this period.
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.value));
  const CHART_H = 110;
  const BAR_W = Math.max(Math.min(Math.floor(600 / data.length) - 3, 40), 4);

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 20 }}>
        Money In — {periodLabel}
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: CHART_H + 32, minWidth: data.length * (BAR_W + 3) }}>
          {data.map((d, i) => {
            const barH = max > 0 ? Math.max((d.value / max) * CHART_H, d.value > 0 ? 4 : 0) : 0;
            const isHov = hovered === i;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: BAR_W + 3, position: "relative" }}>
                {isHov && d.value > 0 && (
                  <div style={{
                    position: "absolute", bottom: CHART_H + 12, left: "50%", transform: "translateX(-50%)",
                    background: "#1c1c1c", border: `1px solid ${BORDER}`, borderRadius: 6,
                    padding: "4px 8px", fontSize: 11, color: TEXT, whiteSpace: "nowrap", zIndex: 10,
                  }}>
                    {fmt(d.value)}
                  </div>
                )}
                <div
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    width: BAR_W, height: barH,
                    background: isHov ? ACCENT : "rgba(232,197,71,0.38)",
                    borderRadius: "3px 3px 0 0",
                    transition: "background 0.12s",
                    cursor: "default",
                    flexShrink: 0,
                  }}
                />
                <div style={{ color: MUTED, fontSize: 9, marginTop: 5, textAlign: "center", lineHeight: 1 }}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExpenseCategoryChart({ expenseByCategory }) {
  const entries = Object.entries(expenseByCategory).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const palette = [ACCENT, "#E87847", "#47B8E8", "#8047E8", "#47E877", "#E84747", "#47E8C2", "#E8C247"];

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 20 }}>Money Out — by Category</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.map(([cat, amt], i) => {
          const pct = total > 0 ? (amt / total) * 100 : 0;
          return (
            <div key={cat}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13 }}>
                <span style={{ color: TEXT }}>{cat}</span>
                <span style={{ color: MUTED, fontFamily: "monospace" }}>
                  {fmt(amt)} <span style={{ fontSize: 11 }}>({pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: palette[i % palette.length],
                  borderRadius: 3, transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopSellingItems({ items }) {
  const maxQty = Math.max(...items.map(i => i.qty));
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 20 }}>Top Selling Items</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {items.map((item, i) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              background: i === 0 ? ACCENT : "rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900, color: i === 0 ? BG : MUTED,
            }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: TEXT, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name}
                </span>
                <span style={{ fontSize: 12, color: MUTED, fontFamily: "monospace", flexShrink: 0, marginLeft: 8 }}>
                  {item.qty}× · {fmt(item.revenue)}
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${maxQty > 0 ? (item.qty / maxQty) * 100 : 0}%`,
                  background: i === 0 ? ACCENT : "rgba(232,197,71,0.3)",
                  borderRadius: 2,
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatRow({ label, value, bold, indent, color, borderTop, doubleTop }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 0",
      paddingLeft: indent ? 20 : 0,
      borderTop: doubleTop ? `3px double ${BORDER}` : borderTop ? `1px solid ${BORDER}` : "none",
    }}>
      <span style={{ color: bold ? TEXT : MUTED, fontWeight: bold ? 700 : 400, fontSize: bold ? 14 : 13 }}>
        {label}
      </span>
      <span style={{
        color: color || (bold ? TEXT : MUTED),
        fontWeight: bold ? 700 : 500,
        fontSize: bold ? 14 : 13,
        fontFamily: "monospace",
        letterSpacing: "0.5px",
      }}>
        {value}
      </span>
    </div>
  );
}

function IncomeStatement({ revenue, totalExpenses, netIncome, expenseByCategory, periodLabel }) {
  const margin = revenue > 0 ? (netIncome / revenue) * 100 : null;
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 17, color: ACCENT }}>Income Statement (P&L)</div>
          <div style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>{periodLabel}</div>
        </div>
        {margin !== null && (
          <div style={{
            background: margin >= 0 ? "rgba(76,175,80,0.1)" : "rgba(244,67,54,0.1)",
            border: `1px solid ${margin >= 0 ? "rgba(76,175,80,0.3)" : "rgba(244,67,54,0.3)"}`,
            borderRadius: 8, padding: "6px 14px", textAlign: "center",
          }}>
            <div style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Margin</div>
            <div style={{ color: margin >= 0 ? GREEN : RED, fontWeight: 900, fontSize: 18, fontFamily: "monospace" }}>
              {margin.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      <StatRow label="Revenue (Money In)" value={fmt(revenue)} bold color={ACCENT} />
      <div style={{ height: 1, background: BORDER, margin: "4px 0" }} />

      <div style={{ marginTop: 12, marginBottom: 4 }}>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
          Operating Expenses (Money Out)
        </div>
        {Object.entries(expenseByCategory).length === 0 ? (
          <div style={{ color: MUTED, fontSize: 13, paddingLeft: 20, paddingBottom: 4 }}>No expenses recorded</div>
        ) : (
          Object.entries(expenseByCategory).sort(([, a], [, b]) => b - a).map(([cat, amt]) => (
            <StatRow key={cat} label={cat} value={`(${fmt(amt)})`} indent color={RED} />
          ))
        )}
      </div>

      <StatRow
        label="Total Expenses"
        value={totalExpenses > 0 ? `(${fmt(totalExpenses)})` : "$0.00"}
        bold color={totalExpenses > 0 ? RED : MUTED}
        borderTop
      />
      <div style={{ height: 1, background: BORDER, margin: "10px 0" }} />
      <StatRow label="What's Left (Net Income)" value={fmtSigned(netIncome)} bold color={netIncome >= 0 ? GREEN : RED} doubleTop />
    </div>
  );
}

function CashFlowStatement({ totalExpenses, netIncome, orders, periodLabel }) {
  const collected = orders.reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const operatingCF = collected - totalExpenses;

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 900, fontSize: 17, color: ACCENT }}>Cash Flow Statement</div>
        <div style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>{periodLabel}</div>
      </div>

      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
        Operating Activities
      </div>
      <StatRow label="Net Income (What's Left)" value={fmtSigned(netIncome)} indent color={netIncome >= 0 ? GREEN : RED} />
      <StatRow label="Revenue Collected (Money In)" value={fmt(collected)} indent />
      <StatRow label="Expenses Paid (Money Out)" value={totalExpenses > 0 ? `(${fmt(totalExpenses)})` : "$0.00"} indent color={totalExpenses > 0 ? RED : MUTED} />
      <StatRow label="Net Cash from Operations" value={fmtSigned(operatingCF)} bold color={operatingCF >= 0 ? GREEN : RED} borderTop />

      <div style={{ height: 1, background: BORDER, margin: "20px 0 8px" }} />
      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
        Investing Activities
      </div>
      <StatRow label="Net Cash from Investing" value="$0.00" bold />

      <div style={{ height: 1, background: BORDER, margin: "20px 0 8px" }} />
      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
        Financing Activities
      </div>
      <StatRow label="Net Cash from Financing" value="$0.00" bold />

      <div style={{ height: 1, background: BORDER, margin: "16px 0 6px" }} />
      <StatRow label="Net Change in Cash" value={fmtSigned(operatingCF)} bold color={operatingCF >= 0 ? GREEN : RED} doubleTop />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FinancialsTab({ bizId }) {
  const [period, setPeriod] = useState("month");
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [statement, setStatement] = useState("income");
  const [expenseForm, setExpenseForm] = useState({
    amount: "", category: "Rent", description: "",
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [expenseError, setExpenseError] = useState("");
  const [showSQL, setShowSQL] = useState(false);

  const getStartDate = () => {
    const now = new Date();
    if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    if (period === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
    }
    if (period === "year") return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return null;
  };

  const load = async () => {
    setLoading(true);
    const startDate = getStartDate();

    const { data: locs } = await supabase.from("locations").select("id").eq("business_id", bizId);
    const locationIds = (locs || []).map(l => l.id);
    const safeIds = locationIds.length > 0 ? locationIds : ["00000000-0000-0000-0000-000000000000"];

    // Period orders
    let oq = supabase.from("orders").select("id, total, status, created_at")
      .in("location_id", safeIds).eq("status", "done");
    if (startDate) oq = oq.gte("created_at", startDate);
    const { data: ordData } = await oq;
    const periodOrders = ordData || [];
    setOrders(periodOrders);

    // Top selling items for the period
    if (periodOrders.length > 0) {
      const orderIds = periodOrders.map(o => o.id);
      const { data: itemRows } = await supabase
        .from("order_items")
        .select("quantity, unit_price, menu_item_id, menu_items(name)")
        .in("order_id", orderIds);

      if (itemRows) {
        const map = {};
        itemRows.forEach(row => {
          const id = row.menu_item_id;
          const name = row.menu_items?.name || "Unknown";
          const qty = parseInt(row.quantity) || 0;
          const rev = qty * parseFloat(row.unit_price || 0);
          if (!map[id]) map[id] = { id, name, qty: 0, revenue: 0 };
          map[id].qty += qty;
          map[id].revenue += rev;
        });
        setTopItems(Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 8));
      } else {
        setTopItems([]);
      }
    } else {
      setTopItems([]);
    }

    // Expenses (all-time fetch, then filter client-side)
    const { data: allExp, error: expErr } = await supabase
      .from("business_expenses").select("*").eq("business_id", bizId)
      .order("expense_date", { ascending: false });

    if (expErr?.message?.includes("does not exist") || expErr?.code === "42P01") {
      setTableError(true);
      setExpenses([]);
    } else {
      setTableError(false);
      setExpenses(
        startDate
          ? (allExp || []).filter(e => e.expense_date >= startDate)
          : (allExp || [])
      );
    }

    setLoading(false);
  };

  useEffect(() => { if (bizId) load(); }, [bizId, period]);

  const addExpense = async () => {
    const amt = parseFloat(expenseForm.amount);
    if (!amt || amt <= 0) { setExpenseError("Enter a valid amount."); return; }
    setSaving(true);
    setExpenseError("");
    const { error } = await supabase.from("business_expenses").insert({
      business_id: bizId,
      amount: amt,
      category: expenseForm.category,
      description: expenseForm.description,
      expense_date: expenseForm.expense_date,
    });
    if (error) {
      setExpenseError(
        error.message?.includes("does not exist") || error.code === "42P01"
          ? "Table missing — run the SQL setup shown above."
          : error.message
      );
      setSaving(false);
      return;
    }
    setExpenseForm({ amount: "", category: "Rent", description: "", expense_date: new Date().toISOString().slice(0, 10) });
    setShowExpenseForm(false);
    setSaving(false);
    load();
  };

  const deleteExpense = async (id) => {
    await supabase.from("business_expenses").delete().eq("id", id);
    load();
  };

  // Derived financials
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const netIncome = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : null;
  const expenseByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount || 0);
    return acc;
  }, {});

  const PERIODS = [
    ["month", "This Month"],
    ["quarter", "This Quarter"],
    ["year", "This Year"],
    ["all", "All Time"],
  ];
  const STATEMENTS = [
    ["income", "Income Statement"],
    ["cashflow", "Cash Flow"],
  ];
  const periodLabel = PERIODS.find(p => p[0] === period)?.[1] || "";

  if (loading) return <div style={{ color: MUTED, padding: "20px 0" }}>Loading financials...</div>;

  return (
    <div>
      {/* Period + Add Expense controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 4 }}>
          {PERIODS.map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)} style={{
              background: period === key ? ACCENT : "transparent",
              color: period === key ? BG : MUTED,
              border: "none", borderRadius: 7,
              padding: "7px 14px", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
            }}>
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowExpenseForm(v => !v); setExpenseError(""); }}
          style={btn({
            background: showExpenseForm ? "#1a1a1a" : ACCENT,
            color: showExpenseForm ? TEXT : BG,
            padding: "10px 20px",
            border: showExpenseForm ? `1px solid ${BORDER}` : "none",
          })}
        >
          {showExpenseForm ? "Cancel" : "+ Add Expense"}
        </button>
      </div>

      {/* Missing table warning */}
      {tableError && (
        <div style={{
          background: "rgba(244,67,54,0.07)", border: "1px solid rgba(244,67,54,0.25)",
          borderRadius: 12, padding: 20, marginBottom: 24,
        }}>
          <div style={{ fontWeight: 700, color: RED, marginBottom: 6, fontSize: 14 }}>
            Expenses table not found
          </div>
          <div style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>
            Create the <code style={{ color: ACCENT }}>business_expenses</code> table once in your Supabase SQL Editor to enable expense tracking.
          </div>
          <button
            onClick={() => setShowSQL(v => !v)}
            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "6px 14px", color: TEXT, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            {showSQL ? "Hide SQL" : "Show Setup SQL"}
          </button>
          {showSQL && (
            <pre style={{
              marginTop: 14, background: "#0a0a0a", border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: 16, fontSize: 12, color: ACCENT,
              overflowX: "auto", lineHeight: 1.7, whiteSpace: "pre-wrap",
            }}>
              {SQL_SETUP}
            </pre>
          )}
        </div>
      )}

      {/* Expense entry form */}
      {showExpenseForm && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: ACCENT, marginBottom: 16 }}>New Expense</div>
          {expenseError && <div style={{ color: RED, fontSize: 12, marginBottom: 10 }}>{expenseError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <input
              style={inputStyle} type="number" placeholder="Amount *" min="0" step="0.01"
              value={expenseForm.amount}
              onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
            />
            <select
              style={selectStyle} value={expenseForm.category}
              onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <input
              style={inputStyle} placeholder="Description (optional)"
              value={expenseForm.description}
              onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
            />
            <input
              style={inputStyle} type="date"
              value={expenseForm.expense_date}
              onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
            />
          </div>
          <button
            onClick={addExpense} disabled={saving}
            style={btn({ background: ACCENT, color: BG, padding: "10px 24px", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" })}
          >
            {saving ? "Saving..." : "Save Expense"}
          </button>
        </div>
      )}

      {/* KPI cards — plain language */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KPICard
          label="Money In"
          value={fmt(totalRevenue)}
          sub={`${orders.length} order${orders.length !== 1 ? "s" : ""}`}
          color={ACCENT}
        />
        <KPICard
          label="Money Out"
          value={fmt(totalExpenses)}
          sub={`${expenses.length} entr${expenses.length !== 1 ? "ies" : "y"}`}
          color={RED}
        />
        <KPICard
          label="What's Left"
          value={fmtSigned(netIncome)}
          sub={margin !== null ? `${margin.toFixed(1)}% margin` : "No revenue yet"}
          color={netIncome >= 0 ? GREEN : RED}
        />
        <KPICard
          label="Profit Margin"
          value={margin !== null ? `${margin.toFixed(1)}%` : "—"}
          sub={margin !== null ? (margin >= 0 ? "Profitable" : "Loss period") : "No revenue yet"}
          color={margin !== null ? (margin >= 0 ? GREEN : RED) : MUTED}
        />
      </div>

      {/* Revenue bar chart */}
      <div style={{ marginBottom: 20 }}>
        <RevenueBarChart orders={orders} period={period} />
      </div>

      {/* Expense breakdown + Top items */}
      {(Object.keys(expenseByCategory).length > 0 || topItems.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
          {Object.keys(expenseByCategory).length > 0 && (
            <ExpenseCategoryChart expenseByCategory={expenseByCategory} />
          )}
          {topItems.length > 0 && (
            <TopSellingItems items={topItems} />
          )}
        </div>
      )}

      {/* Statement switcher */}
      <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, marginBottom: 22 }}>
        {STATEMENTS.map(([key, label]) => (
          <button key={key} onClick={() => setStatement(key)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "11px 18px",
            color: statement === key ? ACCENT : MUTED,
            borderBottom: statement === key ? `2px solid ${ACCENT}` : "2px solid transparent",
            fontWeight: 700, fontSize: 13,
          }}>
            {label}
          </button>
        ))}
      </div>

      {statement === "income" && (
        <IncomeStatement
          revenue={totalRevenue}
          totalExpenses={totalExpenses}
          netIncome={netIncome}
          expenseByCategory={expenseByCategory}
          periodLabel={periodLabel}
        />
      )}
      {statement === "cashflow" && (
        <CashFlowStatement
          totalExpenses={totalExpenses}
          netIncome={netIncome}
          orders={orders}
          periodLabel={periodLabel}
        />
      )}

      {/* Expense ledger */}
      {expenses.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: MUTED, marginBottom: 14, letterSpacing: 2, textTransform: "uppercase" }}>
            Expense Ledger — {periodLabel}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {expenses.map(e => (
              <div key={e.id} style={{
                background: SURFACE, border: `1px solid ${BORDER}`,
                borderRadius: 10, padding: "12px 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontWeight: 700, color: TEXT, fontSize: 13,
                      background: "rgba(232,197,71,0.08)", border: "1px solid rgba(232,197,71,0.15)",
                      borderRadius: 5, padding: "2px 8px",
                    }}>
                      {e.category}
                    </span>
                    {e.description && (
                      <span style={{ color: MUTED, fontSize: 13 }}>{e.description}</span>
                    )}
                  </div>
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 5 }}>{e.expense_date}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ color: RED, fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>
                    ({fmt(e.amount)})
                  </span>
                  <button
                    onClick={() => deleteExpense(e.id)}
                    style={btn({ background: "#1a1a1a", color: RED, width: 30, height: 30, fontSize: 14 })}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!tableError && expenses.length === 0 && (
        <div style={{ marginTop: 36, textAlign: "center", color: MUTED, fontSize: 13 }}>
          No expenses recorded for {periodLabel.toLowerCase()}. Click "+ Add Expense" to start tracking.
        </div>
      )}
    </div>
  );
}
