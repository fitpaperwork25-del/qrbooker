import { useEffect, useState } from "react";
import QRCode from "qrcode";
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

type Location  = { id: string; name: string; label: string | null; is_active: boolean };
type Order     = { id: string; status: string; total: number; created_at: string };
type OrderItem = { id: string; name: string; quantity: number; unit_price: number };
type Category  = { id: string; name: string; display_order: number };
type MenuItem  = { id: string; category_id: string; name: string; price: number; description: string | null; is_available: boolean };

const ORDER_STATUS_COLOR: Record<string, string> = {
  new:       "#E8C547",
  preparing: "#F97316",
  ready:     "#4CAF50",
  done:      "#888888",
  cancelled: "#f44336",
};
const ORDER_STATUSES = ["new", "preparing", "ready", "done"] as const;

type Tab = "tables" | "menu" | "orders";

const EMPTY_ITEM = { name: "", price: "", description: "", category_id: "" };

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems]   = useState<MenuItem[]>([]);
  const [tab, setTab]               = useState<Tab>("tables");
  const [loading, setLoading]       = useState(true);

  // Add table form
  const [addingTable, setAddingTable]   = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [tableError, setTableError]     = useState("");
  const [tableSaving, setTableSaving]   = useState(false);

  // Add category form
  const [addingCat, setAddingCat]   = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError]     = useState("");
  const [catSaving, setCatSaving]   = useState(false);

  // Add item form
  const [addingItem, setAddingItem]   = useState(false);
  const [itemForm, setItemForm]       = useState(EMPTY_ITEM);
  const [itemError, setItemError]     = useState("");
  const [itemSaving, setItemSaving]   = useState(false);

  // Orders expand + items cache
  const [expandedOrderId, setExpandedOrderId]     = useState<string | null>(null);
  const [orderItemsCache, setOrderItemsCache]     = useState<Record<string, OrderItem[]>>({});

  useEffect(() => {
    if (!session?.user.id) return;
    void load(session.user.id);
  }, [session]);

  async function load(userId: string) {
    setLoading(true);

    const bizRes = await supabase.from("businesses").select("*").eq("owner_id", userId).single();
    const biz = bizRes.data as Business | null;
    setBusiness(biz);

    if (biz) {
      const [locRes, ordRes, catRes] = await Promise.all([
        supabase.from("locations").select("id, name, label, is_active").eq("business_id", biz.id).order("name"),
        supabase.from("orders").select("id, status, total, created_at").eq("business_id", biz.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("menu_categories").select("id, name, display_order").eq("business_id", biz.id).order("display_order"),
      ]);

      const cats = (catRes.data as Category[]) ?? [];
      setLocations((locRes.data as Location[]) ?? []);
      setOrders((ordRes.data as Order[]) ?? []);
      setCategories(cats);

      if (cats.length > 0) {
        const itemRes = await supabase
          .from("menu_items")
          .select("id, category_id, name, price, description, is_available")
          .in("category_id", cats.map((c) => c.id))
          .order("display_order");
        setMenuItems((itemRes.data as MenuItem[]) ?? []);
      }
    }

    setLoading(false);
  }

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !newTableName.trim()) return;
    setTableError("");
    setTableSaving(true);

    const slug = newTableName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data, error } = await supabase
      .from("locations")
      .insert({ business_id: business.id, name: newTableName.trim(), slug, is_active: true })
      .select("id, name, label, is_active")
      .single();

    if (error) {
      setTableError(error.message);
      setTableSaving(false);
      return;
    }

    setLocations((prev) => [...prev, data as Location]);
    setNewTableName("");
    setAddingTable(false);
    setTableSaving(false);
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !newCatName.trim()) return;
    setCatError("");
    setCatSaving(true);
    const { data, error } = await supabase
      .from("menu_categories")
      .insert({ business_id: business.id, name: newCatName.trim(), display_order: categories.length, is_visible: true })
      .select("id, name, display_order")
      .single();
    if (error) { setCatError(error.message); setCatSaving(false); return; }
    setCategories((prev) => [...prev, data as Category]);
    setNewCatName("");
    setAddingCat(false);
    setCatSaving(false);
  }

  async function addMenuItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm.name.trim() || !itemForm.category_id) return;
    setItemError("");
    setItemSaving(true);
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        category_id:   itemForm.category_id,
        name:          itemForm.name.trim(),
        price:         parseFloat(itemForm.price) || 0,
        description:   itemForm.description.trim() || null,
        is_available:  true,
        display_order: menuItems.filter((i) => i.category_id === itemForm.category_id).length,
      })
      .select("id, category_id, name, price, description, is_available")
      .single();
    if (error) { setItemError(error.message); setItemSaving(false); return; }
    setMenuItems((prev) => [...prev, data as MenuItem]);
    setItemForm(EMPTY_ITEM);
    setAddingItem(false);
    setItemSaving(false);
  }

  async function toggleOrder(orderId: string) {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase
      .from("order_items")
      .select("id, quantity, unit_price, menu_items(name)")
      .eq("order_id", orderId);
    const items: OrderItem[] = (data ?? []).map((row: any) => ({
      id:         row.id,
      name:       row.menu_items?.name ?? "Unknown item",
      quantity:   row.quantity,
      unit_price: row.unit_price,
    }));
    setOrderItemsCache((prev) => ({ ...prev, [orderId]: items }));
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    if (!error) setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
  }

  async function downloadQR(loc: Location) {
    if (!business) return;
    const url = `${window.location.origin}/scan/${business.id}/${loc.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${loc.name.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
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
    { label: "Add menu items",         done: menuItems.length > 0 },
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
                {t === "menu" && menuItems.length > 0 && (
                  <span style={{ marginLeft: 8, background: BORDER, borderRadius: 12, padding: "2px 8px", fontSize: 11, color: MUTED }}>{menuItems.length}</span>
                )}
                {t === "orders" && orders.length > 0 && (
                  <span style={{ marginLeft: 8, background: BORDER, borderRadius: 12, padding: "2px 8px", fontSize: 11, color: MUTED }}>{orders.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tables tab */}
          {tab === "tables" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Add table button / inline form */}
              {addingTable ? (
                <form onSubmit={addTable} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New table</p>
                  <input
                    autoFocus
                    required
                    placeholder="e.g. Table 4"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }}
                  />
                  {tableError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{tableError}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="submit"
                      disabled={tableSaving}
                      style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: tableSaving ? "not-allowed" : "pointer" }}
                    >
                      {tableSaving ? "Saving…" : "Add table"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingTable(false); setNewTableName(""); setTableError(""); }}
                      style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <button
                    onClick={() => setAddingTable(true)}
                    style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "11px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                  >
                    + Add table
                  </button>
                </div>
              )}

              {/* Table list */}
              {locations.length === 0 ? (
                <Empty message="No tables yet." sub="Add your first table to generate a QR code." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                  {locations.map((loc) => (
                    <div key={loc.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{loc.name}</div>
                      {loc.label && <div style={{ color: MUTED, fontSize: 13 }}>{loc.label}</div>}
                      <span style={{ ...badge(loc.is_active ? GREEN : MUTED), alignSelf: "flex-start" }}>
                        {loc.is_active ? "active" : "inactive"}
                      </span>
                      <button
                        onClick={() => downloadQR(loc)}
                        style={{ marginTop: 4, background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 14px", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" }}
                      >
                        ↓ Download QR
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Menu tab */}
          {tab === "menu" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Toolbar */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => { setAddingCat(true); setAddingItem(false); }}
                  style={{ background: "none", border: `1px solid ${ACCENT}`, borderRadius: 8, padding: "10px 20px", color: ACCENT, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  + Add category
                </button>
                {categories.length > 0 && (
                  <button
                    onClick={() => { setAddingItem(true); setAddingCat(false); setItemForm({ ...EMPTY_ITEM, category_id: categories[0].id }); }}
                    style={{ background: ACCENT, border: "none", borderRadius: 8, padding: "10px 20px", color: BG, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                  >
                    + Add item
                  </button>
                )}
              </div>

              {/* Add category form */}
              {addingCat && (
                <form onSubmit={addCategory} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New category</p>
                  <input
                    autoFocus required
                    placeholder="e.g. Starters"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }}
                  />
                  {catError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{catError}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" disabled={catSaving} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: catSaving ? "not-allowed" : "pointer" }}>
                      {catSaving ? "Saving…" : "Add category"}
                    </button>
                    <button type="button" onClick={() => { setAddingCat(false); setNewCatName(""); setCatError(""); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Add item form */}
              {addingItem && (
                <form onSubmit={addMenuItem} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New menu item</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Name *</label>
                      <input
                        required autoFocus
                        placeholder="e.g. Caesar Salad"
                        value={itemForm.name}
                        onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Price *</label>
                      <input
                        required type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={itemForm.price}
                        onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Description</label>
                    <input
                      placeholder="Optional description"
                      value={itemForm.description}
                      onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                      style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Category *</label>
                    <select
                      required
                      value={itemForm.category_id}
                      onChange={(e) => setItemForm((f) => ({ ...f, category_id: e.target.value }))}
                      style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", cursor: "pointer" }}
                    >
                      <option value="">Select category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {itemError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{itemError}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" disabled={itemSaving} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: itemSaving ? "not-allowed" : "pointer" }}>
                      {itemSaving ? "Saving…" : "Add item"}
                    </button>
                    <button type="button" onClick={() => { setAddingItem(false); setItemForm(EMPTY_ITEM); setItemError(""); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Menu list grouped by category */}
              {categories.length === 0 ? (
                <Empty message="No categories yet." sub="Create a category first, then add items to it." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {categories.map((cat) => {
                    const items = menuItems.filter((i) => i.category_id === cat.id);
                    return (
                      <div key={cat.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                          <h3 style={{ fontWeight: 800, fontSize: 15, color: TEXT, margin: 0 }}>{cat.name}</h3>
                          <span style={{ color: MUTED, fontSize: 12 }}>{items.length} item{items.length !== 1 ? "s" : ""}</span>
                        </div>
                        {items.length === 0 ? (
                          <p style={{ color: MUTED, fontSize: 13, paddingLeft: 4 }}>No items yet.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {items.map((item) => (
                              <div key={item.id} style={{ ...card, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</span>
                                    {!item.is_available && <span style={{ ...badge(MUTED), fontSize: 10 }}>unavailable</span>}
                                  </div>
                                  {item.description && <span style={{ color: MUTED, fontSize: 12 }}>{item.description}</span>}
                                </div>
                                <span style={{ fontWeight: 800, fontSize: 15, color: ACCENT, whiteSpace: "nowrap" }}>
                                  ${Number(item.price).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  {orders.map((order) => {
                    const isExpanded = expandedOrderId === order.id;
                    const statusColor = ORDER_STATUS_COLOR[order.status] ?? MUTED;
                    const items = orderItemsCache[order.id];
                    return (
                      <div key={order.id} style={{ ...card, padding: "0" }}>
                        {/* Order header row — click to expand */}
                        <div
                          onClick={() => toggleOrder(order.id)}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", cursor: "pointer" }}
                        >
                          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                            <span style={badge(statusColor)}>{order.status}</span>
                            <span style={{ color: MUTED, fontSize: 12, fontFamily: "monospace" }}>
                              {new Date(order.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <span style={{ fontWeight: 800, fontSize: 15 }}>${Number(order.total).toFixed(2)}</span>
                            <span style={{ color: MUTED, fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {/* Expanded: items + status buttons */}
                        {isExpanded && (
                          <div style={{ borderTop: `1px solid ${BORDER}`, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

                            {/* Items list */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {!items ? (
                                <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Loading items…</p>
                              ) : items.length === 0 ? (
                                <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>No items found.</p>
                              ) : (
                                items.map((oi) => (
                                  <div key={oi.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                                    <span style={{ color: TEXT }}>
                                      <span style={{ color: MUTED, fontFamily: "monospace", marginRight: 10 }}>{oi.quantity}×</span>
                                      {oi.name}
                                    </span>
                                    <span style={{ color: MUTED }}>${(oi.unit_price * oi.quantity).toFixed(2)}</span>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Status buttons */}
                            {order.status !== "cancelled" && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {ORDER_STATUSES.map((s) => {
                                  const active = order.status === s;
                                  const color = ORDER_STATUS_COLOR[s];
                                  return (
                                    <button
                                      key={s}
                                      onClick={() => updateOrderStatus(order.id, s)}
                                      style={{
                                        background: active ? color + "33" : "none",
                                        border: `1px solid ${active ? color : BORDER}`,
                                        borderRadius: 8,
                                        padding: "7px 16px",
                                        color: active ? color : MUTED,
                                        fontWeight: active ? 800 : 600,
                                        fontSize: 12,
                                        cursor: "pointer",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.5,
                                      }}
                                    >
                                      {s}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
