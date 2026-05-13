import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getStaffSession, clearStaffSession } from "../lib/useStaffAuth";
import { ACCENT, BG, BORDER, MUTED, SURFACE, TEXT } from "../constants/theme";

// ── Types ─────────────────────────────────────────────────────
type OrderRow = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  location_id: string;
  table_name: string;
};

type OrderItem = {
  order_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

// ── Constants ─────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  new:       "#E8C547",
  preparing: "#F97316",
  ready:     "#4CAF50",
};

const STAFF_STATUSES = ["new", "preparing", "ready"] as const;
const REFRESH_MS = 15_000;

// ── Component ──────────────────────────────────────────────────
export default function StaffDashboardPage() {
  const navigate   = useNavigate();
  const session    = getStaffSession();
  const bizId      = session?.bizId ?? null;
  const bizName    = session?.bizName ?? "Staff Dashboard";

  const [orders, setOrders]         = useState<OrderRow[]>([]);
  const [items, setItems]           = useState<OrderItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!bizId) { navigate("/staff-login", { replace: true }); return; }
    void fetchOrders();
    intervalRef.current = setInterval(() => { void fetchOrders(); }, REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [bizId]);

  async function fetchOrders() {
    if (!bizId) return;

    const { data: ordData } = await supabase
      .from("orders")
      .select("id, status, total, created_at, location_id, locations(name, label)")
      .eq("business_id", bizId)
      .in("status", ["new", "preparing"])
      .order("created_at", { ascending: true });

    const rows: OrderRow[] = (ordData ?? []).map((o: any) => ({
      id:          o.id,
      status:      o.status,
      total:       o.total,
      created_at:  o.created_at,
      location_id: o.location_id,
      table_name:  o.locations?.label || o.locations?.name || "Unknown table",
    }));
    setOrders(rows);

    if (rows.length > 0) {
      const { data: itemData } = await supabase
        .from("order_items")
        .select("order_id, quantity, unit_price, menu_items(name)")
        .in("order_id", rows.map((r) => r.id));

      setItems(
        (itemData ?? []).map((i: any) => ({
          order_id:   i.order_id,
          name:       i.menu_items?.name ?? "Item",
          quantity:   i.quantity,
          unit_price: i.unit_price,
        }))
      );
    } else {
      setItems([]);
    }

    setLastRefresh(new Date());
    setLoading(false);
  }

  async function updateStatus(orderId: string, newStatus: string) {
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId);

    if (!error) {
      if (newStatus === "ready") {
        // Remove from active list once marked ready
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setOrders((prev) =>
          prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o)
        );
      }
    }
  }

  function handleSignOut() {
    clearStaffSession();
    navigate("/staff-login", { replace: true });
  }

  function minutesAgo(dateStr: string) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff === 1) return "1 min ago";
    return `${diff} mins ago`;
  }

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontFamily: "sans-serif", fontSize: 16 }}>
        Loading orders…
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif" }}>

      {/* Header */}
      <header style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Kitchen View</div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{bizName}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>
            {orders.length} active · refreshes every 15s
          </div>
          <button
            onClick={handleSignOut}
            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 14px", color: MUTED, fontSize: 12, cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Orders */}
      <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 680, margin: "0 auto" }}>

        {orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 24px" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>All clear</div>
            <div style={{ color: MUTED, fontSize: 14 }}>No active orders right now.</div>
            <div style={{ color: MUTED, fontSize: 12, marginTop: 12, fontFamily: "monospace" }}>
              Last checked: {lastRefresh.toLocaleTimeString()}
            </div>
          </div>
        ) : (
          orders.map((order) => {
            const orderItems = items.filter((i) => i.order_id === order.id);
            const statusColor = STATUS_COLOR[order.status] ?? MUTED;

            return (
              <div
                key={order.id}
                style={{
                  background: SURFACE,
                  border: `2px solid ${statusColor}44`,
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                {/* Order header */}
                <div style={{ background: statusColor + "18", borderBottom: `1px solid ${statusColor}33`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>{order.table_name}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{minutesAgo(order.created_at)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        display: "inline-block",
                        background: statusColor + "33",
                        color: statusColor,
                        border: `1px solid ${statusColor}66`,
                        borderRadius: 8,
                        padding: "4px 12px",
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      {order.status}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>${Number(order.total).toFixed(2)}</div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: "14px 18px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {orderItems.length === 0 ? (
                    <div style={{ color: MUTED, fontSize: 13 }}>No items</div>
                  ) : (
                    orderItems.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                          <span style={{ fontWeight: 900, fontSize: 22, color: ACCENT, minWidth: 28 }}>{item.quantity}×</span>
                          <span style={{ fontWeight: 700, fontSize: 17 }}>{item.name}</span>
                        </div>
                        <span style={{ color: MUTED, fontSize: 14 }}>${(item.unit_price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Status buttons */}
                <div style={{ padding: "10px 18px 16px", display: "flex", gap: 10 }}>
                  {STAFF_STATUSES.map((s) => {
                    const active = order.status === s;
                    const color  = STATUS_COLOR[s];
                    return (
                      <button
                        key={s}
                        onClick={() => updateStatus(order.id, s)}
                        style={{
                          flex: 1,
                          padding: "12px 8px",
                          borderRadius: 10,
                          border: `2px solid ${active ? color : BORDER}`,
                          background: active ? color + "33" : "none",
                          color: active ? color : MUTED,
                          fontWeight: active ? 900 : 600,
                          fontSize: 13,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          transition: "all 0.15s",
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
