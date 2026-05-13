import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import { supabase } from "../lib/supabase";
import { ACCENT, BG, BORDER, MUTED, SURFACE, TEXT, GREEN, RED } from "../constants/theme";

// ── Types ────────────────────────────────────────────────────
type Business = {
  id: string;
  name: string;
  type: string;
  plan: string;
  subscription_status: string;
  logo_url: string | null;
  slug: string;
};

type Location = { id: string; name: string; label: string | null; is_active: boolean };
type Order    = { id: string; status: string; total: number; created_at: string };

type Tab = "tables" | "menu" | "orders";

// ── Styles ───────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "24px 28px",
};

const badge = (color: string): React.CSSProperties => ({
  display: "inline-block",
  background: color + "22",
  color,
  border: `1px solid ${color}44`,
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
});

// ── Helpers ──────────────────────────────────────────────────
function planColor(plan: string) {
  if (plan === "enterprise") return TEXT;
  if (plan === "pro") return ACCENT;
  return MUTED;
}

function statusColor(status: string) {
  if (status === "active") return GREEN;
  if (status === "trialing") return ACCENT;
  return RED;
}

// ── Component ─────────────────────────────────────────────────
export default function DashboardPage() {
  const { session, signOut } = useAuth();

  const [business, setBusiness]     = useState<Business | null>(null);
  const [locations, setLocations]   = useState<Location[]>([]);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [menuCount, setMenuCount]   = useState(0);
  const [tab, setTab]               = useState<Tab>("tables");
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!session?.user.id) return;
    void load(session.user.id);
  }, [session]);

  async function load(userId: string) {
    setLoading(true);

    const [bizRes, locRes, ordRes, menuRes] = await Promise.all([
      supabase.from("businesses").select("*").eq("owner_id", userId).single(),
      supabase.from("locations").select("id, name, label, is_active").eq("business_id",
        // subquery workaround: fetch after we have bizId
        "00000000-0000-0000-0000-000000000000"
      ).limit(0), // placeholder — refetched below
      Promise.resolve({ data: [] as Order[], error: null }),
      Promise.resolve({ data: [] as { id: string }[], error: null }),
    ]);

    const biz = bizRes.data as Business | null;
    setBusiness(biz);

    if (biz) {
      const [locFull, ordFull, menuFull] = await Promise.all([
        supabase
          .from("locations")
          .select("id, name, label, is_active")
          .eq("business_id", biz.id)
          .order("name"),
        supabase
          .from("orders")
          .select("id, status, total, created_at")
          .eq("business_id", biz.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .in("category_id",
            (await supabase
              .from("menu_categories")
              .select("id")
              .eq("business_id", biz.id)
            ).data?.map((c) => c.id) ?? []
          ),
      ]);

      setLocations((locFull.data as Location[]) ?? []);
      setOrders((ordFull.data as Order[]) ?? []);
      setMenuCount(menuFull.count ?? 0);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontFamily: "sans-serif" }}>
        Loading…
      </div>
    );
  }

  if (!business) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontFamily: "sans-serif", flexDirection: "column", gap: 16 }}>
        <p>No business found for this account.</p>
        <button onClick={() => window.location.href = "/register"} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "12px 24px", fontWeight: 800, cursor: "pointer" }}>
          Set up your business →
        </button>
      </div>
    );
  }

  // Setup checklist
  const checklist = [
    { label: "Create account",        done: true },
    { label: "Add a table or location", done: locations.length > 0 },
    { label: "Add menu items",         done: menuCount > 0 },
    { label: "Receive first order",    done: orders.length > 0 },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;
  const allDone = checklistDone === checklist.length;

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif" }}>

      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 32px", borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>{business.name}</span>
          <span style={{ marginLeft: 12, ...badge(planColor(business.plan)) }}>{business.plan}</span>
          <span style={{ marginLeft: 8, ...badge(statusColor(business.subscription_status)) }}>{business.subscription_status}</span>
        </div>
        <button
          onClick={signOut}
          style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 18px", color: MUTED, cursor: "pointer", fontSize: 13 }}
        >
          Sign out
        </button>
      </nav>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 24px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Setup checklist */}
        {!allDone && (
          <div style={card}>
            <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 16 }}>
              Setup — {checklistDone}/{checklist.length} done
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {checklist.map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: item.done ? GREEN : BORDER, border: `2px solid ${item.done ? GREEN : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: BG, fontWeight: 800, flexShrink: 0 }}>
                    {item.done ? "✓" : ""}
                  </span>
                  <span style={{ color: item.done ? MUTED : TEXT, fontSize: 14, textDecoration: item.done ? "line-through" : "none" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div>
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 24 }}>
            {(["tables", "menu", "orders"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                  color: tab === t ? ACCENT : MUTED,
                  padding: "12px 24px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  letterSpacing: 0.5,
                  transition: "color 0.15s",
                }}
              >
                {t}
                {t === "tables" && locations.length > 0 && (
                  <span style={{ marginLeft: 8, background: BORDER, borderRadius: 12, padding: "2px 8px", fontSize: 11, color: MUTED }}>{locations.length}</span>
                )}
                {t === "orders" && orders.length > 0 && (
                  <span style={{ marginLeft: 8, background: BORDER, borderRadius: 12, padding: "2px 8px", fontSize: 11, color: MUTED }}>{orders.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tables tab */}
          {tab === "tables" && (
            <div>
              {locations.length === 0 ? (
                <Empty message="No tables yet." sub="Add your first table or location to generate a QR code." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                  {locations.map((loc) => (
                    <div key={loc.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{loc.name}</div>
                      {loc.label && <div style={{ color: MUTED, fontSize: 13 }}>{loc.label}</div>}
                      <span style={{ ...badge(loc.is_active ? GREEN : MUTED), alignSelf: "flex-start", marginTop: 4 }}>
                        {loc.is_active ? "active" : "inactive"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Menu tab */}
          {tab === "menu" && (
            <div>
              {menuCount === 0 ? (
                <Empty message="No menu items yet." sub="Add categories and items to build your digital menu." />
              ) : (
                <div style={{ ...card, color: MUTED, fontSize: 14 }}>
                  {menuCount} menu item{menuCount !== 1 ? "s" : ""} across your categories.
                </div>
              )}
            </div>
          )}

          {/* Orders tab */}
          {tab === "orders" && (
            <div>
              {orders.length === 0 ? (
                <Empty message="No orders yet." sub="Orders will appear here in real time once customers start scanning." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {orders.map((order) => (
                    <div key={order.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <span style={badge(
                          order.status === "done" ? GREEN :
                          order.status === "cancelled" ? RED :
                          order.status === "new" ? ACCENT : MUTED
                        )}>{order.status}</span>
                        <span style={{ color: MUTED, fontSize: 12, fontFamily: "monospace" }}>
                          {new Date(order.created_at).toLocaleString()}
                        </span>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>${Number(order.total).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ message, sub }: { message: string; sub: string }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <p style={{ color: TEXT, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{message}</p>
      <p style={{ color: MUTED, fontSize: 13 }}>{sub}</p>
    </div>
  );
}
