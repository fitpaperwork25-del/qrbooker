import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { useAuth } from "../lib/useAuth";
import { supabase } from "../lib/supabase";
import { ACCENT, BG, BORDER, MUTED, SURFACE, TEXT, GREEN, RED } from "../constants/theme";
import { AppointmentCalendar } from "../components/AppointmentCalendar";

type Business = {
  id: string; name: string; type: string; plan: string;
  subscription_status: string; logo_url: string | null; slug: string;
  hero_image_url: string | null; staff_pin: string | null;
};
type Location  = { id: string; name: string; label: string | null; is_active: boolean };
type Order     = { id: string; status: string; total: number; created_at: string; cancel_reason: string | null };
type OpenTab   = { id: string; table_name: string; total: number; opened_at: string };
type OrderItem = { id: string; name: string; quantity: number; unit_price: number };
type Category  = { id: string; name: string; display_order: number };
type MenuItem  = { id: string; category_id: string; name: string; price: number; description: string | null; is_available: boolean; image_url: string | null };
type Expense          = { id: string; amount: number; category: string; description: string | null; expense_date: string };
type BalanceSheetItem = { id: string; type: string; label: string; amount: number; as_of_date: string };
type ManualRevenue = { id: string; amount: number; category: string; description: string | null; revenue_date: string };
type CsvRow    = { category: string; name: string; price: string; description: string; error?: string };

const TODAY = new Date().toISOString().slice(0, 10);
const EMPTY_EXPENSE = { category: "Rent", amount: "", description: "", expense_date: TODAY };
const EMPTY_REVENUE = { category: "Dine-in", amount: "", description: "", date: TODAY };
const REVENUE_CATEGORIES  = ["Dine-in", "Takeout", "Catering", "Other"] as const;
const EXPENSE_CATEGORIES  = ["Rent", "Supplies", "Utilities", "Payroll", "Misc"] as const;
const EMPTY_BS_ITEM = { type: "asset" as string, label: "", amount: "", as_of_date: TODAY };

const ORDER_STATUS_COLOR: Record<string, string> = {
  new: "#E8C547", preparing: "#F97316", ready: "#4CAF50", done: "#888888", cancelled: "#f44336",
};
const ORDER_STATUSES = ["new", "preparing", "ready", "done"] as const;
const CANCEL_REASONS = ["Wrong order", "Customer refused", "Item unavailable", "Other"] as const;

type Tab = "appointments" | "services" | "chairs" | "financials" | "branding";
const EMPTY_ITEM = { name: "", price: "", description: "", category_id: "" };

const card: React.CSSProperties = {
  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "24px 28px",
};

const badge = (color: string): React.CSSProperties => ({
  display: "inline-block", background: color + "22", color,
  border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 10px",
  fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
});

const PLAN_ORDER = ["trialing", "starter", "pro", "enterprise"];
const PLAN_LABELS: Record<string, { label: string; price: string; features: string[]; recommended?: boolean }> = {
  starter:    { label: "Starter",    price: "$49/mo",  features: ["1 location", "QR booking", "Service management", "Appointment dashboard"] },
  pro:        { label: "Pro",        price: "$99/mo",  features: ["Up to 5 locations", "Booking system", "Staff management", "Priority support"], recommended: true },
  enterprise: { label: "Enterprise", price: "$199/mo", features: ["Unlimited locations", "White label", "Custom domain", "Dedicated support"] },
};

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

export default function DashboardPage() {
  const { session, signOut } = useAuth();

  const [business, setBusiness]     = useState<Business | null>(null);
  const [locations, setLocations]   = useState<Location[]>([]);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems]   = useState<MenuItem[]>([]);
  const [tab, setTab]               = useState<Tab>("appointments");
  const [loading, setLoading]       = useState(true);
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 640);

  const [addingTable, setAddingTable]   = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [tableError, setTableError]     = useState("");
  const [tableSaving, setTableSaving]   = useState(false);

  const [pinInput,  setPinInput]  = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError,  setPinError]  = useState("");
  const [pinSaved,  setPinSaved]  = useState(false);

  const [addingCat, setAddingCat]   = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError]     = useState("");
  const [catSaving, setCatSaving]   = useState(false);

  const [addingItem, setAddingItem]   = useState(false);
  const [itemForm, setItemForm]       = useState(EMPTY_ITEM);
  const [itemError, setItemError]     = useState("");
  const [itemSaving, setItemSaving]   = useState(false);

  const [editingItemId,  setEditingItemId]  = useState<string | null>(null);
  const [editItemForm,   setEditItemForm]   = useState({ name: "", price: "", description: "" });
  const [itemEditError,  setItemEditError]  = useState("");
  const [itemEditSaving, setItemEditSaving] = useState(false);

  const [editingLocationId,  setEditingLocationId]  = useState<string | null>(null);
  const [editLocationForm,   setEditLocationForm]   = useState({ name: "", is_active: true });
  const [locationEditError,  setLocationEditError]  = useState("");
  const [locationEditSaving, setLocationEditSaving] = useState(false);

  const [expandedOrders, setExpandedOrders]   = useState<Set<string>>(new Set());
  const [orderItemsCache, setOrderItemsCache] = useState<Record<string, OrderItem[]>>({});
  const [openTabs, setOpenTabs]               = useState<OpenTab[]>([]);

  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason]           = useState("");
  const [cancelError, setCancelError]             = useState("");

  const [doneOrders, setDoneOrders]           = useState<Order[]>([]);
  const [cancelledOrders, setCancelledOrders] = useState<Order[]>([]);
  const [cancelPeriod, setCancelPeriod]       = useState<"day" | "week" | "month">("month");
  const [expenses, setExpenses]               = useState<Expense[]>([]);
  const [manualRevenue, setManualRevenue]     = useState<ManualRevenue[]>([]);
  const [addingExpense, setAddingExpense]     = useState(false);
  const [expenseForm, setExpenseForm]         = useState(EMPTY_EXPENSE);
  const [expenseError, setExpenseError]       = useState("");
  const [expenseSaving, setExpenseSaving]     = useState(false);
  const [addingRevenue, setAddingRevenue]       = useState(false);
  const [revenueForm, setRevenueForm]           = useState(EMPTY_REVENUE);
  const [revenueError, setRevenueError]         = useState("");
  const [revenueSaving, setRevenueSaving]       = useState(false);
  const [noRevenueTable, setNoRevenueTable]     = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const [editingRevenueId, setEditingRevenueId] = useState<string | null>(null);
  const [editRevenueForm, setEditRevenueForm]   = useState(EMPTY_REVENUE);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpenseForm, setEditExpenseForm]   = useState(EMPTY_EXPENSE);

  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetItem[]>([]);
  const [addingBSItem, setAddingBSItem] = useState(false);
  const [bsForm, setBsForm]             = useState(EMPTY_BS_ITEM);
  const [bsError, setBsError]           = useState("");
  const [bsSaving, setBsSaving]         = useState(false);
  const [editingBSId, setEditingBSId]   = useState<string | null>(null);
  const [editBSForm, setEditBSForm]     = useState(EMPTY_BS_ITEM);

  // ── CSV Import ───────────────────────────────────────────
  const csvInputRef                           = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows]                 = useState<CsvRow[]>([]);
  const [csvImporting, setCsvImporting]       = useState(false);
  const [csvError, setCsvError]               = useState("");
  const [csvSuccess, setCsvSuccess]           = useState("");

  const [itemImageFile, setItemImageFile]               = useState<File | null>(null);
  const [itemImageUploading, setItemImageUploading]     = useState(false);
  const [editItemImageFile, setEditItemImageFile]       = useState<File | null>(null);
  const itemImageInputRef                               = useRef<HTMLInputElement>(null);
  const editItemImageInputRef                           = useRef<HTMLInputElement>(null);

  const logoInputRef                                    = useRef<HTMLInputElement>(null);
  const heroInputRef                                    = useRef<HTMLInputElement>(null);
  const [brandingLogoUploading, setBrandingLogoUploading] = useState(false);
  const [brandingHeroUploading, setBrandingHeroUploading] = useState(false);
  const [brandingError, setBrandingError]               = useState("");

  useEffect(() => {
    if (!session?.user.id) return;
    void load(session.user.id);
  }, [session]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (!business?.id) return;
    const fetchOrders = async (isPolling = false) => {
      const [ordRes, tabsRes] = await Promise.all([
        supabase.from("orders").select("id, status, total, created_at, cancel_reason").eq("business_id", business.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("tabs").select("id, total, opened_at, locations(name, label)").eq("business_id", business.id).eq("status", "open").order("opened_at", { ascending: true }),
      ]);
      if (ordRes.data) {
        if (isPolling) {
          setOrders((prev) => {
            const newOrders = (ordRes.data as Order[]).filter((o) => !prev.some((p) => p.id === o.id));
            if (newOrders.length > 0 && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(`${newOrders.length} new order(s) received!`);
            }
            return ordRes.data as Order[];
          });
        } else { setOrders(ordRes.data as Order[]); }
      }
      if (tabsRes.data) {
        setOpenTabs((tabsRes.data as any[]).map((t) => ({
          id: t.id, table_name: t.locations?.label || t.locations?.name || "Unknown table", total: t.total, opened_at: t.opened_at,
        })));
      }
    };
    fetchOrders();
    const timer = setInterval(() => fetchOrders(true), 15000);
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    return () => clearInterval(timer);
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) return;
    const fetchFinancials = async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [doneRes, expRes, revRes, cancelRes, bsRes] = await Promise.all([
        supabase.from("orders").select("id, status, total, created_at, cancel_reason").eq("business_id", business.id).neq("status", "cancelled").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
        supabase.from("business_expenses").select("id, amount, category, description, expense_date").eq("business_id", business.id).order("expense_date", { ascending: false }),
        supabase.from("manual_revenue").select("id, amount, category, description, revenue_date").eq("business_id", business.id).order("date", { ascending: false }),
        supabase.from("orders").select("id, status, total, created_at, cancel_reason").eq("business_id", business.id).eq("status", "cancelled").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
        supabase.from("balance_sheet_items").select("id, type, label, amount, as_of_date").eq("business_id", business.id).order("as_of_date", { ascending: false }),
      ]);
      setDoneOrders((doneRes.data as Order[]) ?? []);
      setExpenses((expRes.data as Expense[]) ?? []);
      if (revRes.error?.code === "42P01") { setNoRevenueTable(true); } else { setManualRevenue((revRes.data as ManualRevenue[]) ?? []); }
      setCancelledOrders((cancelRes.data as Order[]) ?? []);
      setBalanceSheet((bsRes.data as BalanceSheetItem[]) ?? []);
    };
    const timer = setInterval(fetchFinancials, 15000);
    return () => clearInterval(timer);
  }, [business?.id]);

  async function load(userId: string) {
    setLoading(true);
    const bizRes = await supabase.from("businesses").select("*").eq("owner_id", userId).maybeSingle();
    let biz = bizRes.data as Business | null;

    // User arrived via magic-link after a registration attempt that couldn't
    // complete inline (e.g. account existed with no password). Create the
    // business now using the data saved before the magic link was sent.
    if (!biz) {
      const pending = localStorage.getItem("qw_pending_registration");
      if (pending) {
        try {
          const { businessName, type } = JSON.parse(pending) as { businessName: string; type: string };
          const slug = businessName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || `business-${Date.now()}`;
          const { data: created } = await supabase.from("businesses").insert({
            owner_id: userId, name: businessName, slug, type,
            plan: "starter", subscription_status: "trialing",
          }).select("*").single();
          biz = created as Business | null;
        } catch { /* ignore — fall through to no-business UI */ }
        localStorage.removeItem("qw_pending_registration");
      }
    }

    setBusiness(biz);
    if (biz) {
      const [locRes, ordRes, catRes, tabsRes] = await Promise.all([
        supabase.from("locations").select("id, name, label, is_active").eq("business_id", biz.id).order("name"),
        supabase.from("orders").select("id, status, total, created_at, cancel_reason").eq("business_id", biz.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("menu_categories").select("id, name, display_order").eq("business_id", biz.id).order("display_order"),
        supabase.from("tabs").select("id, total, opened_at, locations(name, label)").eq("business_id", biz.id).eq("status", "open").order("opened_at", { ascending: true }),
      ]);
      const cats = (catRes.data as Category[]) ?? [];
      setLocations((locRes.data as Location[]) ?? []);
      setOrders((ordRes.data as Order[]) ?? []);
      setCategories(cats);
      setOpenTabs(((tabsRes.data ?? []) as any[]).map((t) => ({
        id: t.id, table_name: t.locations?.label || t.locations?.name || "Unknown table", total: t.total, opened_at: t.opened_at,
      })));
      if (cats.length > 0) {
        const itemRes = await supabase.from("menu_items").select("id, category_id, name, price, description, is_available, image_url").in("category_id", cats.map((c) => c.id)).order("display_order");
        setMenuItems((itemRes.data as MenuItem[]) ?? []);
      }
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [doneRes, expRes, revRes, cancelRes, bsRes] = await Promise.all([
        supabase.from("orders").select("id, status, total, created_at, cancel_reason").eq("business_id", biz.id).neq("status", "cancelled").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
        supabase.from("business_expenses").select("id, amount, category, description, expense_date").eq("business_id", biz.id).order("expense_date", { ascending: false }),
        supabase.from("manual_revenue").select("id, amount, category, description, revenue_date").eq("business_id", biz.id).order("date", { ascending: false }),
        supabase.from("orders").select("id, status, total, created_at, cancel_reason").eq("business_id", biz.id).eq("status", "cancelled").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
        supabase.from("balance_sheet_items").select("id, type, label, amount, as_of_date").eq("business_id", biz.id).order("as_of_date", { ascending: false }),
      ]);
      setDoneOrders((doneRes.data as Order[]) ?? []);
      setExpenses((expRes.data as Expense[]) ?? []);
      if (revRes.error?.code === "42P01") { setNoRevenueTable(true); } else { setManualRevenue((revRes.data as ManualRevenue[]) ?? []); }
      setCancelledOrders((cancelRes.data as Order[]) ?? []);
      setBalanceSheet((bsRes.data as BalanceSheetItem[]) ?? []);
    }
    setLoading(false);
  }

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !newTableName.trim()) return;
    setTableError(""); setTableSaving(true);
    const slug = newTableName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data, error } = await supabase.from("locations").insert({ business_id: business.id, name: newTableName.trim(), slug, is_active: true }).select("id, name, label, is_active").single();
    if (error) { setTableError(error.message); setTableSaving(false); return; }
    setLocations((prev) => [...prev, data as Location]);
    setNewTableName(""); setAddingTable(false); setTableSaving(false);
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    if (!business || pinInput.length !== 4) return;
    setPinSaving(true); setPinError("");
    const { error } = await supabase.from("businesses").update({ staff_pin: pinInput }).eq("id", business.id);
    if (error) { setPinError(error.message); }
    else { setPinSaved(true); setPinInput(""); setBusiness(prev => prev ? { ...prev, staff_pin: pinInput } : prev); setTimeout(() => setPinSaved(false), 3000); }
    setPinSaving(false);
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !newCatName.trim()) return;
    setCatError(""); setCatSaving(true);
    const { data, error } = await supabase.from("menu_categories").insert({ business_id: business.id, name: newCatName.trim(), display_order: categories.length, is_visible: true }).select("id, name, display_order").single();
    if (error) { setCatError(error.message); setCatSaving(false); return; }
    setCategories((prev) => [...prev, data as Category]);
    setNewCatName(""); setAddingCat(false); setCatSaving(false);
  }

  async function addMenuItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm.name.trim() || !itemForm.category_id) return;
    setItemError(""); setItemSaving(true);
    const { data, error } = await supabase.from("menu_items").insert({ category_id: itemForm.category_id, name: itemForm.name.trim(), price: parseFloat(itemForm.price) || 0, description: itemForm.description.trim() || null, is_available: true, display_order: menuItems.filter((i) => i.category_id === itemForm.category_id).length }).select("id, category_id, name, price, description, is_available, image_url").single();
    if (error) { setItemError(error.message); setItemSaving(false); return; }
    let newItem = data as MenuItem;
    if (itemImageFile) {
      setItemImageUploading(true);
      const url = await uploadMenuItemImage(newItem.id, itemImageFile);
      if (url) {
        await supabase.from("menu_items").update({ image_url: url }).eq("id", newItem.id);
        newItem = { ...newItem, image_url: url };
      }
      setItemImageUploading(false);
      setItemImageFile(null);
    }
    setMenuItems((prev) => [...prev, newItem]);
    setItemForm(EMPTY_ITEM); setAddingItem(false); setItemSaving(false);
  }

  async function updateMenuItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItemId) return;
    setItemEditError(""); setItemEditSaving(true);
    let imageUrl: string | undefined;
    if (editItemImageFile) {
      const url = await uploadMenuItemImage(editingItemId, editItemImageFile);
      if (url) imageUrl = url;
      setEditItemImageFile(null);
    }
    const updatePayload: Record<string, unknown> = { name: editItemForm.name.trim(), price: parseFloat(editItemForm.price) || 0, description: editItemForm.description.trim() || null };
    if (imageUrl !== undefined) updatePayload.image_url = imageUrl;
    const { error } = await supabase.from("menu_items").update(updatePayload).eq("id", editingItemId);
    if (error) { setItemEditError(error.message); setItemEditSaving(false); return; }
    setMenuItems((prev) => prev.map((i) => i.id === editingItemId ? { ...i, name: editItemForm.name.trim(), price: parseFloat(editItemForm.price) || 0, description: editItemForm.description.trim() || null, ...(imageUrl !== undefined ? { image_url: imageUrl } : {}) } : i));
    setEditingItemId(null); setItemEditSaving(false);
  }

  async function deleteMenuItem(itemId: string) {
    if (!window.confirm("Delete this item?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", itemId);
    if (!error) setMenuItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function updateLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLocationId) return;
    setLocationEditError(""); setLocationEditSaving(true);
    const { error } = await supabase.from("locations")
      .update({ name: editLocationForm.name.trim(), is_active: editLocationForm.is_active })
      .eq("id", editingLocationId);
    if (error) { setLocationEditError(error.message); setLocationEditSaving(false); return; }
    setLocations(prev => prev.map(l =>
      l.id === editingLocationId ? { ...l, name: editLocationForm.name.trim(), is_active: editLocationForm.is_active } : l
    ));
    setEditingLocationId(null); setLocationEditSaving(false);
  }

  async function deleteLocation(locId: string, locName: string) {
    if (!window.confirm(`Delete "${locName}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("locations").delete().eq("id", locId);
    if (!error) setLocations(prev => prev.filter(l => l.id !== locId));
  }

  async function deleteCategory(catId: string, itemCount: number) {
    const catName = categories.find((c) => c.id === catId)?.name ?? "this category";
    const msg = itemCount > 0 ? `Delete "${catName}" and its ${itemCount} item${itemCount !== 1 ? "s" : ""}? This cannot be undone.` : `Delete "${catName}"?`;
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from("menu_categories").delete().eq("id", catId);
    if (!error) { setCategories((prev) => prev.filter((c) => c.id !== catId)); setMenuItems((prev) => prev.filter((i) => i.category_id !== catId)); }
  }

  async function toggleOrder(orderId: string) {
    setExpandedOrders((prev) => { const next = new Set(prev); if (next.has(orderId)) { next.delete(orderId); return next; } next.add(orderId); return next; });
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase.from("order_items").select("id, quantity, unit_price, menu_items(name)").eq("order_id", orderId);
    const items: OrderItem[] = (data ?? []).map((row: any) => ({ id: row.id, name: row.menu_items?.name ?? "Unknown item", quantity: row.quantity, unit_price: row.unit_price }));
    setOrderItemsCache((prev) => ({ ...prev, [orderId]: items }));
  }

  async function closeTab(tabId: string) {
    const { error } = await supabase.from("tabs").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", tabId);
    if (!error) setOpenTabs((prev) => prev.filter((t) => t.id !== tabId));
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    if (!error) setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
  }

  async function cancelOrder(orderId: string, reason: string) {
    setCancelError("");
    const { error } = await supabase.from("orders").update({ status: "cancelled", cancel_reason: reason }).eq("id", orderId);
    if (error) { console.error("cancelOrder failed:", error); setCancelError(error.message); return; }
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: "cancelled", cancel_reason: reason } : o));
    setCancellingOrderId(null); setCancelReason("");
  }

  async function startCheckout(plan: string) {
    if (!business || !session?.user.email) return;
    setUpgrading(plan);
    try {
      const res = await fetch("/api/create-checkout-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, businessId: business.id, email: session.user.email }) });
      const { url, error } = await res.json();
      if (error) { alert(error); setUpgrading(null); return; }
      window.location.href = url;
    } catch { alert("Failed to start checkout. Try again."); setUpgrading(null); }
  }

  async function updateRevenue(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRevenueId) return;
    const { error } = await supabase.from("manual_revenue").update({ amount: parseFloat(editRevenueForm.amount), category: editRevenueForm.category, description: editRevenueForm.description.trim() || null, revenue_date: editRevenueForm.date }).eq("id", editingRevenueId);
    if (error) return;
    setManualRevenue((prev) => prev.map((r) => r.id === editingRevenueId ? { ...r, amount: parseFloat(editRevenueForm.amount), category: editRevenueForm.category, description: editRevenueForm.description || null, revenue_date: editRevenueForm.date } : r));
    setEditingRevenueId(null);
  }

  async function deleteRevenue(id: string) {
    if (!window.confirm("Delete this revenue entry?")) return;
    const { error } = await supabase.from("manual_revenue").delete().eq("id", id);
    if (!error) setManualRevenue((prev) => prev.filter((r) => r.id !== id));
  }

  async function updateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpenseId) return;
    const { error } = await supabase.from("business_expenses").update({ amount: parseFloat(editExpenseForm.amount), category: editExpenseForm.category.trim(), description: editExpenseForm.description.trim() || null, expense_date: editExpenseForm.expense_date }).eq("id", editingExpenseId);
    if (error) return;
    setExpenses((prev) => prev.map((exp) => exp.id === editingExpenseId ? { ...exp, amount: parseFloat(editExpenseForm.amount), category: editExpenseForm.category, description: editExpenseForm.description || null, expense_date: editExpenseForm.expense_date } : exp));
    setEditingExpenseId(null);
  }

  async function deleteExpense(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    const { error } = await supabase.from("business_expenses").delete().eq("id", id);
    if (!error) setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  function downloadCsv(filename: string, rows: string[][]) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPnL() {
    const orderRev = doneOrders.reduce((s, o) => s + Number(o.total), 0);
    const manRev   = manualRevenue.reduce((s, r) => s + Number(r.amount), 0);
    const totRev   = orderRev + manRev;
    const totExp   = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const net      = totRev - totExp;
    const rows: string[][] = [
      ["Type", "Category", "Description", "Amount"],
      ["Revenue", "Appointments", "Completed orders", orderRev.toFixed(2)],
      ["Revenue", "Manual", "Manual entries", manRev.toFixed(2)],
      ["Revenue", "TOTAL", "Total Revenue", totRev.toFixed(2)],
      ...expenses.map((e) => ["Expense", e.category, e.description ?? "", (-Number(e.amount)).toFixed(2)]),
      ["Expense", "TOTAL", "Total Expenses", (-totExp).toFixed(2)],
      ["Net", "NET PROFIT / (LOSS)", "", net.toFixed(2)],
    ];
    downloadCsv(`pnl_${TODAY}.csv`, rows);
  }

  function exportCashFlow() {
    const orderRev = doneOrders.reduce((s, o) => s + Number(o.total), 0);
    const manRev   = manualRevenue.reduce((s, r) => s + Number(r.amount), 0);
    const totRev   = orderRev + manRev;
    const totExp   = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const rows: string[][] = [
      ["Direction", "Description", "Date", "Amount"],
      ["Inflow", "Appointment revenue (subtotal)", "", orderRev.toFixed(2)],
      ...doneOrders.map((o) => ["Inflow", `Appointment ${o.id.slice(0, 8)}`, o.created_at.slice(0, 10), Number(o.total).toFixed(2)]),
      ["Inflow", "Manual revenue (subtotal)", "", manRev.toFixed(2)],
      ...manualRevenue.map((r) => ["Inflow", `${r.category}${r.description ? " — " + r.description : ""}`, r.revenue_date, Number(r.amount).toFixed(2)]),
      ["Outflow", "Total expenses", "", (-totExp).toFixed(2)],
      ...expenses.map((e) => ["Outflow", `${e.category}${e.description ? " — " + e.description : ""}`, e.expense_date, (-Number(e.amount)).toFixed(2)]),
      ["Net", "Net cash flow", "", (totRev - totExp).toFixed(2)],
    ];
    downloadCsv(`cashflow_${TODAY}.csv`, rows);
  }

  function exportExpenseBreakdown() {
    const totExp = expenses.reduce((s, e) => s + Number(e.amount), 0) || 1;
    const byCategory: Record<string, number> = {};
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount); });
    const rows: string[][] = [
      ["Category", "Total", "Percentage"],
      ...Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => [cat, amt.toFixed(2), `${((amt / totExp) * 100).toFixed(1)}%`]),
      ["TOTAL", totExp.toFixed(2), "100%"],
    ];
    downloadCsv(`expense_breakdown_${TODAY}.csv`, rows);
  }

  async function addBSItem(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !bsForm.label.trim() || !bsForm.amount) return;
    setBsError(""); setBsSaving(true);
    const { data, error } = await supabase.from("balance_sheet_items").insert({
      business_id: business.id, type: bsForm.type, label: bsForm.label.trim(),
      amount: parseFloat(bsForm.amount), as_of_date: bsForm.as_of_date,
    }).select("id, type, label, amount, as_of_date").single();
    if (error) { setBsError(error.message); setBsSaving(false); return; }
    setBalanceSheet((prev) => [data as BalanceSheetItem, ...prev]);
    setBsForm(EMPTY_BS_ITEM); setAddingBSItem(false); setBsSaving(false);
  }

  async function updateBSItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBSId) return;
    const { error } = await supabase.from("balance_sheet_items").update({
      type: editBSForm.type, label: editBSForm.label.trim(),
      amount: parseFloat(editBSForm.amount), as_of_date: editBSForm.as_of_date,
    }).eq("id", editingBSId);
    if (error) return;
    setBalanceSheet((prev) => prev.map((b) => b.id === editingBSId ? { ...b, type: editBSForm.type, label: editBSForm.label, amount: parseFloat(editBSForm.amount), as_of_date: editBSForm.as_of_date } : b));
    setEditingBSId(null);
  }

  async function deleteBSItem(id: string) {
    if (!window.confirm("Delete this balance sheet item?")) return;
    const { error } = await supabase.from("balance_sheet_items").delete().eq("id", id);
    if (!error) setBalanceSheet((prev) => prev.filter((b) => b.id !== id));
  }

  async function addManualRevenue(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !revenueForm.amount) return;
    setRevenueError(""); setRevenueSaving(true);
    const { data, error } = await supabase.from("manual_revenue").insert({ business_id: business.id, amount: parseFloat(revenueForm.amount), category: revenueForm.category, description: revenueForm.description.trim() || null, revenue_date: revenueForm.date }).select("id, amount, category, description, revenue_date").single();
    if (error) { setRevenueError(error.message); setRevenueSaving(false); return; }
    setManualRevenue((prev) => [data as ManualRevenue, ...prev]);
    setRevenueForm(EMPTY_REVENUE); setAddingRevenue(false); setRevenueSaving(false);
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !expenseForm.category.trim() || !expenseForm.amount) return;
    setExpenseError(""); setExpenseSaving(true);
    const { data, error } = await supabase.from("business_expenses").insert({ business_id: business.id, category: expenseForm.category.trim(), amount: parseFloat(expenseForm.amount), description: expenseForm.description.trim() || null, expense_date: expenseForm.expense_date }).select("id, amount, category, description, expense_date").single();
    if (error) { setExpenseError(error.message); setExpenseSaving(false); return; }
    setExpenses((prev) => [data as Expense, ...prev]);
    setExpenseForm(EMPTY_EXPENSE); setAddingExpense(false); setExpenseSaving(false);
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

  // ── Download Card (branded 6×4 PNG, 1800×1200) ──────────
  async function downloadCard(loc: Location) {
    if (!business) return;
    const scanUrl = `${window.location.origin}/scan/${business.id}/${loc.id}`;

    // Generate QR as data URL (white bg, black marks)
    const qrDataUrl = await QRCode.toDataURL(scanUrl, {
      width: 560,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const W = 1800, H = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Background
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, W, H);

    // Outer border
    ctx.strokeStyle = "#E8C54740";
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    // ── Wordmark: "QR" white + "Serve" gold ─────────────
    ctx.font = "900 80px 'Arial Black', Arial, sans-serif";
    const qrW = ctx.measureText("QR").width;
    const serveW = ctx.measureText("Wegn").width;
    const wordX = (W - qrW - serveW) / 2;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#F0EDE8";
    ctx.fillText("QR", wordX, 148);
    ctx.fillStyle = "#E8C547";
    ctx.fillText("Wegn", wordX + qrW, 148);

    // Tagline
    ctx.font = "500 28px Arial, sans-serif";
    ctx.fillStyle = "#C8C4BC";
    ctx.textAlign = "center";
    ctx.fillText("SCAN · BOOK · SHOW UP", W / 2, 194);

    // Gold underline
    const lineHalf = 260;
    ctx.strokeStyle = "#E8C547";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - lineHalf, 206);
    ctx.lineTo(W / 2 + lineHalf, 206);
    ctx.stroke();

    // Business name
    ctx.font = "700 46px Arial, sans-serif";
    ctx.fillStyle = "#F0EDE8";
    ctx.textAlign = "center";
    ctx.fillText(business.name, W / 2, 282);

    // ── QR code ──────────────────────────────────────────
    const qrImg = new Image();
    await new Promise<void>((resolve) => { qrImg.onload = () => resolve(); qrImg.src = qrDataUrl; });

    const qrSize = 580;
    const qrX = (W - qrSize) / 2;
    const qrY = 318;

    // White rounded bg
    const pad = 20;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const rx = qrX - pad, ry = qrY - pad, rw = qrSize + pad * 2, rh = qrSize + pad * 2, r = 18;
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry); ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
    ctx.lineTo(rx + rw, ry + rh - r); ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
    ctx.lineTo(rx + r, ry + rh); ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
    ctx.lineTo(rx, ry + r); ctx.arcTo(rx, ry, rx + r, ry, r);
    ctx.closePath();
    ctx.fill();

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    // ── Chair name ───────────────────────────────────────
    ctx.font = "900 56px 'Arial Black', Arial, sans-serif";
    ctx.fillStyle = "#E8C547";
    ctx.textAlign = "center";
    ctx.fillText(loc.name, W / 2, 1040);

    // Scan instruction
    ctx.font = "400 30px Arial, sans-serif";
    ctx.fillStyle = "#C8C4BC";
    ctx.fillText("Point your camera at the code to book", W / 2, 1092);

    // URL (small, muted)
    ctx.font = "400 20px monospace";
    ctx.fillStyle = "#444444";
    ctx.fillText(scanUrl, W / 2, 1148);

    // Download
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `card-${loc.name.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  }

  // ── CSV Import Functions ─────────────────────────────────
  function downloadCsvTemplate() {
    const template = "category,name,price,description\nSalads,Caesar Salad,12.50,Romaine lettuce with Caesar dressing\nMains,Grilled Chicken,15.99,Served with fries and salad\n";
    const blob = new Blob([template], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "menu_template.csv";
    a.click();
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvError(""); setCsvSuccess("");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setCsvError("File is empty or missing data rows."); return; }

      const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
      const catIdx  = header.indexOf("category");
      const nameIdx = header.indexOf("name");
      const priceIdx = header.indexOf("price");
      const descIdx  = header.indexOf("description");

      if (catIdx === -1 || nameIdx === -1 || priceIdx === -1) {
        setCsvError("CSV must have columns: category, name, price (description optional).");
        return;
      }

      const rows: CsvRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const row: CsvRow = {
          category:    cols[catIdx]  ?? "",
          name:        cols[nameIdx] ?? "",
          price:       cols[priceIdx] ?? "0",
          description: descIdx >= 0 ? (cols[descIdx] ?? "") : "",
        };
        if (!row.category || !row.name) { row.error = "Missing category or name"; }
        if (isNaN(parseFloat(row.price))) { row.error = "Invalid price"; }
        rows.push(row);
      }
      setCsvRows(rows);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function importCsvItems() {
    if (!business || csvRows.length === 0) return;
    const validRows = csvRows.filter((r) => !r.error);
    if (validRows.length === 0) { setCsvError("No valid rows to import."); return; }

    setCsvImporting(true); setCsvError("");

    const catNames = [...new Set(validRows.map((r) => r.category))];
    const catMap: Record<string, string> = {};

    for (const catName of catNames) {
      const existing = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      if (existing) {
        catMap[catName] = existing.id;
      } else {
        const { data, error } = await supabase.from("menu_categories")
          .insert({ business_id: business.id, name: catName, display_order: categories.length + Object.keys(catMap).length, is_visible: true })
          .select("id, name, display_order").single();
        if (error) { setCsvError(`Failed to create category "${catName}": ${error.message}`); setCsvImporting(false); return; }
        catMap[catName] = (data as Category).id;
        setCategories((prev) => [...prev, data as Category]);
      }
    }

    const itemInserts = validRows.map((row, idx) => ({
      category_id:   catMap[row.category],
      name:          row.name,
      price:         parseFloat(row.price) || 0,
      description:   row.description || null,
      is_available:  true,
      display_order: idx,
    }));

    const { data, error } = await supabase.from("menu_items").insert(itemInserts).select("id, category_id, name, price, description, is_available");
    if (error) { setCsvError(`Import failed: ${error.message}`); setCsvImporting(false); return; }

    setMenuItems((prev) => [...prev, ...(data as MenuItem[])]);
    setCsvSuccess(`✓ Imported ${validRows.length} items successfully.`);
    setCsvRows([]);
    setCsvImporting(false);
  }

  async function uploadMenuItemImage(itemId: string, file: File): Promise<string | null> {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${itemId}.${ext}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadBrandingImage(type: "logo" | "hero", file: File): Promise<string | null> {
    if (!business) return null;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${business.id}/${type}.${ext}`;
    const { error } = await supabase.storage.from("business-assets").upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("business-assets").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !business) return;
    setBrandingLogoUploading(true); setBrandingError("");
    const url = await uploadBrandingImage("logo", file);
    if (!url) { setBrandingError("Logo upload failed. Try again."); setBrandingLogoUploading(false); return; }
    const { error } = await supabase.from("businesses").update({ logo_url: url }).eq("id", business.id);
    if (error) { setBrandingError(error.message); setBrandingLogoUploading(false); return; }
    setBusiness((b) => b ? { ...b, logo_url: url } : b);
    setBrandingLogoUploading(false);
    e.target.value = "";
  }

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !business) return;
    setBrandingHeroUploading(true); setBrandingError("");
    const url = await uploadBrandingImage("hero", file);
    if (!url) { setBrandingError("Hero image upload failed. Try again."); setBrandingHeroUploading(false); return; }
    const { error } = await supabase.from("businesses").update({ hero_image_url: url }).eq("id", business.id);
    if (error) { setBrandingError(error.message); setBrandingHeroUploading(false); return; }
    setBusiness((b) => b ? { ...b, hero_image_url: url } : b);
    setBrandingHeroUploading(false);
    e.target.value = "";
  }

  if (loading) {
    return <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontFamily: "sans-serif" }}>Loading…</div>;
  }

  if (!business) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontFamily: "sans-serif", flexDirection: "column", gap: 16 }}>
        <p>No business found for this account.</p>
        <button onClick={() => window.location.href = "/register"} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "12px 24px", fontWeight: 800, cursor: "pointer" }}>Set up your business →</button>
      </div>
    );
  }

  const checklist = [
    { label: "Create account",          done: true },
    { label: "Add a chair or staff member", done: locations.length > 0 },
    { label: "Add services",          done: menuItems.length > 0 },
    { label: "Receive first appointment",     done: orders.length > 0 },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;
  const allDone = checklistDone === checklist.length;
  const currentPlanIndex = PLAN_ORDER.indexOf(business.subscription_status === "trialing" ? "trialing" : business.plan);
  const upgradePlans = Object.entries(PLAN_LABELS).filter(([p]) => PLAN_ORDER.indexOf(p) > currentPlanIndex);

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif" }}>

      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px 16px" : "18px 32px", borderBottom: `1px solid ${BORDER}`, gap: 12 }}>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontWeight: 900, fontSize: isMobile ? 15 : 18, letterSpacing: -0.5, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{business.name}</span>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ ...badge(planColor(business.plan)) }}>{business.plan}</span>
            <span style={{ ...badge(statusColor(business.subscription_status)) }}>{business.subscription_status}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => window.open("/staff-login", "_blank")}
            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: MUTED, cursor: "pointer", fontSize: 13 }}>
            Staff login
          </button>
          <button onClick={signOut}
            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: MUTED, cursor: "pointer", fontSize: 13 }}>
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "20px 16px" : "36px 24px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Setup checklist */}
        {!allDone && (
          <div style={card}>
            <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 16 }}>Setup — {checklistDone}/{checklist.length} done</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {checklist.map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: item.done ? GREEN : BORDER, border: `2px solid ${item.done ? GREEN : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: BG, fontWeight: 800, flexShrink: 0 }}>
                    {item.done ? "✓" : ""}
                  </span>
                  <span style={{ color: item.done ? MUTED : TEXT, fontSize: 14, textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upgrade banner */}
        {upgradePlans.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {upgradePlans.map(([planKey, info]) => (
              <div key={planKey} style={{ ...card, border: info.recommended ? `2px solid ${ACCENT}44` : `1px solid ${BORDER}`, position: "relative" }}>
                {info.recommended && <div style={{ position: "absolute", top: -12, left: 20, background: ACCENT, color: BG, fontSize: 10, fontWeight: 800, letterSpacing: 2, padding: "3px 10px", borderRadius: 4 }}>RECOMMENDED</div>}
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{info.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, marginBottom: 12 }}>{info.price}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                  {info.features.map((f) => <div key={f} style={{ fontSize: 13, color: MUTED, display: "flex", gap: 8 }}><span style={{ color: GREEN }}>✓</span>{f}</div>)}
                </div>
                <button onClick={() => startCheckout(planKey)} disabled={upgrading === planKey}
                  style={{ width: "100%", background: info.recommended ? ACCENT : "none", color: info.recommended ? BG : ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: "12px", fontWeight: 800, fontSize: 14, cursor: upgrading === planKey ? "not-allowed" : "pointer" }}>
                  {upgrading === planKey ? "Redirecting…" : `Upgrade to ${info.label} →`}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div>
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 24, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            {(["appointments", "services", "chairs", "financials", "branding"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ background: "none", border: "none", borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent", color: tab === t ? ACCENT : MUTED, padding: isMobile ? "10px 14px" : "12px 24px", fontWeight: 700, fontSize: isMobile ? 13 : 14, cursor: "pointer", textTransform: "capitalize", letterSpacing: 0.5, transition: "color 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {t}
                {t === "chairs" && locations.length > 0 && <span style={{ marginLeft: 8, background: BORDER, borderRadius: 12, padding: "2px 8px", fontSize: 11, color: MUTED }}>{locations.length}</span>}
                {t === "services" && menuItems.length > 0 && <span style={{ marginLeft: 8, background: BORDER, borderRadius: 12, padding: "2px 8px", fontSize: 11, color: MUTED }}>{menuItems.length}</span>}
                {t === "appointments" && orders.length > 0 && <span style={{ marginLeft: 8, background: BORDER, borderRadius: 12, padding: "2px 8px", fontSize: 11, color: MUTED }}>{orders.length}</span>}
              </button>
            ))}
          </div>

          {/* Tables tab */}
          {tab === "chairs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {addingTable ? (
                <form onSubmit={addTable} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New chair / staff member</p>
                  <input autoFocus required placeholder="e.g. Chair 1 or Teclai" value={newTableName} onChange={(e) => setNewTableName(e.target.value)}
                    style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                  {tableError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{tableError}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" disabled={tableSaving} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: tableSaving ? "not-allowed" : "pointer" }}>{tableSaving ? "Saving…" : "Add chair"}</button>
                    <button type="button" onClick={() => { setAddingTable(false); setNewTableName(""); setTableError(""); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div><button onClick={() => setAddingTable(true)} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "11px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>+ Add chair</button></div>
              )}
              {locations.length === 0 ? (
                <Empty message="No chairs yet." sub="Add your first chair or staff member to generate a QR booking code." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                  {locations.map((loc) =>
                    editingLocationId === loc.id ? (
                      <form key={loc.id} onSubmit={updateLocation} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>Edit chair</p>
                        <input
                          required autoFocus placeholder="Chair name"
                          value={editLocationForm.name}
                          onChange={e => setEditLocationForm(f => ({ ...f, name: e.target.value }))}
                          style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14, outline: "none" }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" as const }}>
                          <input
                            type="checkbox"
                            checked={editLocationForm.is_active}
                            onChange={e => setEditLocationForm(f => ({ ...f, is_active: e.target.checked }))}
                            style={{ width: 16, height: 16, accentColor: ACCENT, cursor: "pointer" }}
                          />
                          <span style={{ fontSize: 14, color: TEXT }}>Active</span>
                        </label>
                        {locationEditError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{locationEditError}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="submit" disabled={locationEditSaving}
                            style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: locationEditSaving ? "not-allowed" : "pointer" }}>
                            {locationEditSaving ? "Saving…" : "Save"}
                          </button>
                          <button type="button" onClick={() => { setEditingLocationId(null); setLocationEditError(""); }}
                            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 14px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div key={loc.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.name}</div>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button
                              onClick={() => { setEditingLocationId(loc.id); setEditLocationForm({ name: loc.name, is_active: loc.is_active }); setLocationEditError(""); }}
                              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 9px", color: MUTED, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              Edit
                            </button>
                            <button
                              onClick={() => deleteLocation(loc.id, loc.name)}
                              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 9px", color: MUTED, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              Delete
                            </button>
                          </div>
                        </div>
                        {loc.label && <div style={{ color: MUTED, fontSize: 13 }}>{loc.label}</div>}
                        <span style={{ ...badge(loc.is_active ? GREEN : MUTED), alignSelf: "flex-start" }}>{loc.is_active ? "active" : "inactive"}</span>
                        <button onClick={() => downloadQR(loc)} style={{ marginTop: 4, background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 14px", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" as const }}>↓ Download QR</button>
                        <button onClick={() => downloadCard(loc)} style={{ background: "none", border: `1px solid ${ACCENT}55`, borderRadius: 8, padding: "9px 14px", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" as const }}>↓ Download Card</button>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Staff PIN */}
              <div style={{ ...card }}>
                <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>Staff PIN</p>
                <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px", lineHeight: 1.5 }}>
                  Your staff use this PIN to log in at <span style={{ color: TEXT, fontFamily: "monospace" }}>/staff-login</span>.
                  {business?.staff_pin && <span> Current PIN: <span style={{ color: TEXT, letterSpacing: 4, fontFamily: "monospace" }}>{"•".repeat(business.staff_pin.length)}</span></span>}
                </p>
                <form onSubmit={savePin} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0000"
                    value={pinInput}
                    onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); setPinSaved(false); }}
                    style={{
                      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                      padding: "10px 14px", color: TEXT, fontSize: 20, letterSpacing: 8,
                      textAlign: "center", width: 120, fontFamily: "monospace", outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="submit"
                      disabled={pinSaving || pinInput.length !== 4}
                      style={{
                        background: pinSaved ? GREEN : ACCENT, color: BG, border: "none",
                        borderRadius: 8, padding: "10px 22px", fontWeight: 800, fontSize: 13,
                        cursor: (pinSaving || pinInput.length !== 4) ? "not-allowed" : "pointer",
                        opacity: pinInput.length !== 4 ? 0.5 : 1,
                      }}
                    >
                      {pinSaving ? "Saving…" : pinSaved ? "Saved ✓" : "Update PIN"}
                    </button>
                    {pinError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{pinError}</p>}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Menu tab */}
          {tab === "services" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Toolbar */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => { setAddingCat(true); setAddingItem(false); }} style={{ background: "none", border: `1px solid ${ACCENT}`, borderRadius: 8, padding: "10px 20px", color: ACCENT, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add category</button>
                {categories.length > 0 && <button onClick={() => { setAddingItem(true); setAddingCat(false); setItemForm({ ...EMPTY_ITEM, category_id: categories[0].id }); }} style={{ background: ACCENT, border: "none", borderRadius: 8, padding: "10px 20px", color: BG, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Add service</button>}
                {/* CSV Import */}
                <input ref={csvInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsvFile} />
                <button onClick={() => csvInputRef.current?.click()} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>↑ Import CSV</button>
                <button onClick={downloadCsvTemplate} style={{ background: "none", border: "none", color: MUTED, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: "10px 0" }}>Download template</button>
              </div>

              {/* CSV success/error */}
              {csvSuccess && <p style={{ color: GREEN, fontSize: 13, margin: 0, fontWeight: 700 }}>{csvSuccess}</p>}
              {csvError && <p style={{ color: RED, fontSize: 13, margin: 0 }}>{csvError}</p>}

              {/* CSV Preview */}
              {csvRows.length > 0 && (
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>
                      CSV Preview — {csvRows.filter((r) => !r.error).length} valid / {csvRows.length} total
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={importCsvItems} disabled={csvImporting || csvRows.filter((r) => !r.error).length === 0}
                        style={{ background: GREEN, color: BG, border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 800, fontSize: 13, cursor: csvImporting ? "not-allowed" : "pointer" }}>
                        {csvImporting ? "Importing…" : `Import ${csvRows.filter((r) => !r.error).length} items`}
                      </button>
                      <button onClick={() => { setCsvRows([]); setCsvError(""); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr 1fr 3fr 1fr", gap: 8, padding: "6px 10px" }}>
                      {["Category", "Name", "Price", "Description", ""].map((h) => (
                        <span key={h} style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{h}</span>
                      ))}
                    </div>
                    {csvRows.map((row, idx) => (
                      <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 3fr 1fr 3fr 1fr", gap: 8, padding: "8px 10px", background: row.error ? RED + "11" : BG, borderRadius: 6, border: `1px solid ${row.error ? RED + "44" : BORDER}` }}>
                        <span style={{ fontSize: 13, color: TEXT }}>{row.category}</span>
                        <span style={{ fontSize: 13, color: TEXT }}>{row.name}</span>
                        <span style={{ fontSize: 13, color: ACCENT }}>${parseFloat(row.price || "0").toFixed(2)}</span>
                        <span style={{ fontSize: 12, color: MUTED }}>{row.description}</span>
                        <span style={{ fontSize: 11, color: row.error ? RED : GREEN }}>{row.error ? "✗" : "✓"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {addingCat && (
                <form onSubmit={addCategory} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New category</p>
                  <input autoFocus required placeholder="e.g. Starters" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                    style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                  {catError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{catError}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" disabled={catSaving} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: catSaving ? "not-allowed" : "pointer" }}>{catSaving ? "Saving…" : "Add category"}</button>
                    <button type="button" onClick={() => { setAddingCat(false); setNewCatName(""); setCatError(""); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  </div>
                </form>
              )}

              {addingItem && (
                <form onSubmit={addMenuItem} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New service</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Name *</label>
                      <input required autoFocus placeholder="e.g. Caesar Salad" value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Price *</label>
                      <input required type="number" min="0" step="0.01" placeholder="0.00" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Description</label>
                    <input placeholder="Optional description" value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                      style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Category *</label>
                    <select required value={itemForm.category_id} onChange={(e) => setItemForm((f) => ({ ...f, category_id: e.target.value }))}
                      style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", cursor: "pointer" }}>
                      <option value="">Select category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Image (optional)</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {itemImageFile && <span style={{ fontSize: 12, color: MUTED }}>{itemImageFile.name}</span>}
                      <input ref={itemImageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setItemImageFile(e.target.files?.[0] ?? null)} />
                      <button type="button" onClick={() => itemImageInputRef.current?.click()}
                        style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: MUTED, fontSize: 12, cursor: "pointer" }}>
                        {itemImageFile ? "Change image" : "Upload image"}
                      </button>
                      {itemImageFile && <button type="button" onClick={() => setItemImageFile(null)}
                        style={{ background: "none", border: "none", color: MUTED, fontSize: 12, cursor: "pointer" }}>✕ Remove</button>}
                    </div>
                  </div>
                  {itemError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{itemError}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" disabled={itemSaving || itemImageUploading} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: (itemSaving || itemImageUploading) ? "not-allowed" : "pointer" }}>{itemSaving || itemImageUploading ? "Saving…" : "Add item"}</button>
                    <button type="button" onClick={() => { setAddingItem(false); setItemForm(EMPTY_ITEM); setItemError(""); setItemImageFile(null); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  </div>
                </form>
              )}

              {categories.length === 0 ? (
                <Empty message="No service categories yet." sub="Create a service category first, or import from CSV." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {categories.map((cat) => {
                    const items = menuItems.filter((i) => i.category_id === cat.id);
                    return (
                      <div key={cat.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                          <h3 style={{ fontWeight: 800, fontSize: 15, color: TEXT, margin: 0 }}>{cat.name}</h3>
                          <span style={{ color: MUTED, fontSize: 12 }}>{items.length} item{items.length !== 1 ? "s" : ""}</span>
                          <button onClick={() => deleteCategory(cat.id, items.length)}
                            style={{ marginLeft: "auto", background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 10px", color: MUTED, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                        </div>
                        {items.length === 0 ? (
                          <p style={{ color: MUTED, fontSize: 13, paddingLeft: 4 }}>No services yet.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {items.map((item) =>
                              editingItemId === item.id ? (
                                <form key={item.id} onSubmit={updateMenuItem} style={{ ...card, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                                    <input required autoFocus placeholder="Service name" value={editItemForm.name} onChange={(e) => setEditItemForm((f) => ({ ...f, name: e.target.value }))}
                                      style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 14, outline: "none" }} />
                                    <input required type="number" min="0" step="0.01" placeholder="Price" value={editItemForm.price} onChange={(e) => setEditItemForm((f) => ({ ...f, price: e.target.value }))}
                                      style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 14, outline: "none" }} />
                                  </div>
                                  <input placeholder="Description (optional)" value={editItemForm.description} onChange={(e) => setEditItemForm((f) => ({ ...f, description: e.target.value }))}
                                    style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 14, outline: "none" }} />
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {item.image_url && !editItemImageFile && <img src={item.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />}
                                    {editItemImageFile && <span style={{ fontSize: 12, color: MUTED }}>{editItemImageFile.name}</span>}
                                    <input ref={editItemImageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setEditItemImageFile(e.target.files?.[0] ?? null)} />
                                    <button type="button" onClick={() => editItemImageInputRef.current?.click()}
                                      style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", color: MUTED, fontSize: 12, cursor: "pointer" }}>
                                      {item.image_url || editItemImageFile ? "Change image" : "Add image"}
                                    </button>
                                    {editItemImageFile && <button type="button" onClick={() => setEditItemImageFile(null)}
                                      style={{ background: "none", border: "none", color: MUTED, fontSize: 12, cursor: "pointer" }}>✕</button>}
                                  </div>
                                  {itemEditError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{itemEditError}</p>}
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button type="submit" disabled={itemEditSaving} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 800, fontSize: 13, cursor: itemEditSaving ? "not-allowed" : "pointer" }}>{itemEditSaving ? "Saving…" : "Save"}</button>
                                    <button type="button" onClick={() => { setEditingItemId(null); setItemEditError(""); setEditItemImageFile(null); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                                  </div>
                                </form>
                              ) : (
                                <div key={item.id} style={{ ...card, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                  {item.image_url && <img src={item.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                      <span style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</span>
                                      {!item.is_available && <span style={{ ...badge(MUTED), fontSize: 10 }}>unavailable</span>}
                                    </div>
                                    {item.description && <span style={{ color: MUTED, fontSize: 12 }}>{item.description}</span>}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                                    <span style={{ fontWeight: 800, fontSize: 15, color: ACCENT }}>${Number(item.price).toFixed(2)}</span>
                                    <button onClick={() => { setEditingItemId(item.id); setEditItemForm({ name: item.name, price: String(item.price), description: item.description ?? "" }); setItemEditError(""); setEditItemImageFile(null); }}
                                      style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", color: MUTED, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                                    <button onClick={() => deleteMenuItem(item.id)}
                                      style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", color: MUTED, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                                  </div>
                                </div>
                              )
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

          {/* Appointments tab */}
          {tab === "appointments" && (
            <AppointmentCalendar
              business={business}
              locations={locations}
              menuItems={menuItems}
            />
          )}

          {/* Financials tab */}
          {tab === "financials" && (() => {
            const orderRevenue  = doneOrders.reduce((s, o) => s + Number(o.total), 0);
            const manualTotal   = manualRevenue.reduce((s, r) => s + Number(r.amount), 0);
            const totalRevenue  = orderRevenue + manualTotal;
            const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
            const net           = totalRevenue - totalExpenses;
            const avgOrder      = doneOrders.length > 0 ? orderRevenue / doneOrders.length : 0;

            const today = new Date();
            const days7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });
            const revenueByDay: Record<string, number> = {};
            days7.forEach((d) => { revenueByDay[d] = 0; });
            doneOrders.forEach((o) => { const day = o.created_at.slice(0, 10); if (revenueByDay[day] !== undefined) revenueByDay[day] += Number(o.total); });
            manualRevenue.forEach((r) => { const day = r.revenue_date; if (revenueByDay[day] !== undefined) revenueByDay[day] += Number(r.amount); });
            const maxDay = Math.max(...Object.values(revenueByDay), 1);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                  {[
                    { label: "Revenue (30d)",  value: `$${totalRevenue.toFixed(2)}`, color: GREEN },
                    { label: "Orders (billed)", value: doneOrders.length.toString(),  color: ACCENT },
                    { label: "Avg order value", value: `$${avgOrder.toFixed(2)}`,     color: ACCENT },
                    { label: "Net (30d)",       value: `$${net.toFixed(2)}`,          color: net >= 0 ? GREEN : RED },
                  ].map((s) => (
                    <div key={s.label} style={{ ...card, padding: "18px 20px" }}>
                      <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ ...card }}>
                  <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>Daily Revenue — Last 7 Days</p>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                    {days7.map((day) => {
                      const val = revenueByDay[day];
                      const pct = maxDay > 0 ? (val / maxDay) * 100 : 0;
                      const label = new Date(day + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
                      return (
                        <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
                          <div style={{ fontSize: 10, color: MUTED }}>{val > 0 ? `$${val.toFixed(0)}` : ""}</div>
                          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                            <div style={{ width: "100%", height: `${Math.max(pct, val > 0 ? 4 : 0)}%`, background: ACCENT + "aa", borderRadius: "4px 4px 0 0", transition: "height 0.3s", minHeight: val > 0 ? 4 : 0 }} />
                          </div>
                          <div style={{ fontSize: 10, color: MUTED }}>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: 11, letterSpacing: 3, color: GREEN, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Manual Revenue — ${manualTotal.toFixed(2)} total</p>
                    {!addingRevenue && !noRevenueTable && <button onClick={() => setAddingRevenue(true)} style={{ background: "none", border: `1px solid ${GREEN}`, borderRadius: 8, padding: "8px 16px", color: GREEN, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Add revenue</button>}
                  </div>
                  {noRevenueTable && (
                    <div style={{ ...card, padding: "16px 20px", borderColor: ACCENT + "44" }}>
                      <p style={{ color: ACCENT, fontSize: 13, fontWeight: 700, margin: "0 0 6px" }}>Migration required</p>
                      <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>Run <code style={{ background: BG, padding: "2px 6px", borderRadius: 4 }}>supabase/add_manual_revenue.sql</code> in your Supabase SQL editor to enable manual revenue tracking.</p>
                    </div>
                  )}
                  {addingRevenue && (
                    <form onSubmit={addManualRevenue} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New revenue entry</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Category *</label>
                          <select required value={revenueForm.category} onChange={(e) => setRevenueForm((f) => ({ ...f, category: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", cursor: "pointer" }}>
                            {REVENUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Amount *</label>
                          <input required type="number" min="0" step="0.01" placeholder="0.00" value={revenueForm.amount} onChange={(e) => setRevenueForm((f) => ({ ...f, amount: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Description</label>
                          <input placeholder="Optional" value={revenueForm.description} onChange={(e) => setRevenueForm((f) => ({ ...f, description: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Date *</label>
                          <input required type="date" value={revenueForm.date} onChange={(e) => setRevenueForm((f) => ({ ...f, date: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", colorScheme: "dark" }} />
                        </div>
                      </div>
                      {revenueError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{revenueError}</p>}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="submit" disabled={revenueSaving} style={{ background: GREEN, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: revenueSaving ? "not-allowed" : "pointer" }}>{revenueSaving ? "Saving…" : "Add revenue"}</button>
                        <button type="button" onClick={() => { setAddingRevenue(false); setRevenueForm(EMPTY_REVENUE); setRevenueError(""); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      </div>
                    </form>
                  )}
                  {!noRevenueTable && manualRevenue.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {manualRevenue.map((r) => editingRevenueId === r.id ? (
                        <form key={r.id} onSubmit={updateRevenue} style={{ ...card, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <select required value={editRevenueForm.category} onChange={(e) => setEditRevenueForm((f) => ({ ...f, category: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none" }}>
                              {REVENUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input required type="number" min="0" step="0.01" value={editRevenueForm.amount} onChange={(e) => setEditRevenueForm((f) => ({ ...f, amount: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none" }} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <input placeholder="Description" value={editRevenueForm.description} onChange={(e) => setEditRevenueForm((f) => ({ ...f, description: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none" }} />
                            <input required type="date" value={editRevenueForm.date} onChange={(e) => setEditRevenueForm((f) => ({ ...f, date: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none", colorScheme: "dark" }} />
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="submit" style={{ background: GREEN, color: BG, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save</button>
                            <button type="button" onClick={() => setEditingRevenueId(null)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: MUTED, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <div key={r.id} style={{ ...card, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{r.category}</span>
                            {r.description && <span style={{ color: MUTED, fontSize: 12 }}>{r.description}</span>}
                            <span style={{ color: MUTED, fontSize: 11, fontFamily: "monospace" }}>{r.revenue_date}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: GREEN }}>+${Number(r.amount).toFixed(2)}</span>
                            <button onClick={() => { setEditingRevenueId(r.id); setEditRevenueForm({ category: r.category, amount: String(r.amount), description: r.description ?? "", date: r.revenue_date }); }}
                              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", color: MUTED, fontSize: 11, cursor: "pointer" }}>Edit</button>
                            <button onClick={() => deleteRevenue(r.id)}
                              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", color: MUTED, fontSize: 11, cursor: "pointer" }}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ ...card }}>
                  <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>Income Statement — Last 30 Days</p>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Revenue</div>
                    <StmtRow label="Orders (completed)" value={orderRevenue} color={GREEN} />
                    <StmtRow label="Manual entries" value={manualTotal} color={GREEN} />
                    <StmtDivider />
                    <StmtRow label="Total Revenue" value={totalRevenue} color={GREEN} bold />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Expenses</div>
                    {(() => {
                      const byCategory: Record<string, number> = {};
                      expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount); });
                      return Object.entries(byCategory).length === 0
                        ? <div style={{ color: MUTED, fontSize: 13, paddingLeft: 8, marginBottom: 8 }}>No expenses recorded.</div>
                        : Object.entries(byCategory).map(([cat, amt]) => <StmtRow key={cat} label={cat} value={amt} color={RED} negate />);
                    })()}
                    <StmtDivider />
                    <StmtRow label="Total Expenses" value={totalExpenses} color={RED} bold negate />
                  </div>
                  <div style={{ borderTop: `2px solid ${BORDER}`, paddingTop: 14 }}>
                    <StmtRow label="Net Profit / (Loss)" value={Math.abs(net)} color={net >= 0 ? GREEN : RED} bold prefix={net < 0 ? "(" : ""} suffix={net < 0 ? ")" : ""} />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Expenses — ${totalExpenses.toFixed(2)} total</p>
                    {!addingExpense && <button onClick={() => setAddingExpense(true)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: TEXT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Add expense</button>}
                  </div>
                  {addingExpense && (
                    <form onSubmit={addExpense} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New expense</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Category *</label>
                          <select required value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", cursor: "pointer" }}>
                            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Amount *</label>
                          <input required type="number" min="0" step="0.01" placeholder="0.00" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Description</label>
                          <input placeholder="Optional" value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, outline: "none" }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Date *</label>
                          <input required type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", colorScheme: "dark" }} />
                        </div>
                      </div>
                      {expenseError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{expenseError}</p>}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="submit" disabled={expenseSaving} style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: expenseSaving ? "not-allowed" : "pointer" }}>{expenseSaving ? "Saving…" : "Add expense"}</button>
                        <button type="button" onClick={() => { setAddingExpense(false); setExpenseForm(EMPTY_EXPENSE); setExpenseError(""); }} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      </div>
                    </form>
                  )}
                  {expenses.length === 0 && !addingExpense ? (
                    <Empty message="No expenses yet." sub="Track costs to see your net profit." />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {expenses.map((exp) => editingExpenseId === exp.id ? (
                        <form key={exp.id} onSubmit={updateExpense} style={{ ...card, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <select required value={editExpenseForm.category} onChange={(e) => setEditExpenseForm((f) => ({ ...f, category: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none", cursor: "pointer" }}>
                              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input required type="number" min="0" step="0.01" value={editExpenseForm.amount} onChange={(e) => setEditExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none" }} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <input placeholder="Description" value={editExpenseForm.description} onChange={(e) => setEditExpenseForm((f) => ({ ...f, description: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none" }} />
                            <input required type="date" value={editExpenseForm.expense_date} onChange={(e) => setEditExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
                              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: TEXT, fontSize: 13, outline: "none", colorScheme: "dark" }} />
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="submit" style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save</button>
                            <button type="button" onClick={() => setEditingExpenseId(null)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: MUTED, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <div key={exp.id} style={{ ...card, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{exp.category}</span>
                            {exp.description && <span style={{ color: MUTED, fontSize: 12 }}>{exp.description}</span>}
                            <span style={{ color: MUTED, fontSize: 11, fontFamily: "monospace" }}>{exp.expense_date}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: RED }}>−${Number(exp.amount).toFixed(2)}</span>
                            <button onClick={() => { setEditingExpenseId(exp.id); setEditExpenseForm({ category: exp.category, amount: String(exp.amount), description: exp.description ?? "", expense_date: exp.expense_date }); }}
                              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", color: MUTED, fontSize: 11, cursor: "pointer" }}>Edit</button>
                            <button onClick={() => deleteExpense(exp.id)}
                              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", color: MUTED, fontSize: 11, cursor: "pointer" }}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Balance Sheet ──────────────────────────────────────────── */}
                {(() => {
                  const bsAssets      = balanceSheet.filter((b) => b.type === "asset").reduce((s, b) => s + Number(b.amount), 0);
                  const bsLiabilities = balanceSheet.filter((b) => b.type === "liability").reduce((s, b) => s + Number(b.amount), 0);
                  const bsEquity      = balanceSheet.filter((b) => b.type === "equity").reduce((s, b) => s + Number(b.amount), 0);
                  const bsCheck       = bsAssets - bsLiabilities - bsEquity;
                  const bsGroups: Record<string, BalanceSheetItem[]> = { asset: [], liability: [], equity: [] };
                  balanceSheet.forEach((b) => { (bsGroups[b.type] ??= []).push(b); });
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Balance Sheet</p>
                        {!addingBSItem && (
                          <button onClick={() => setAddingBSItem(true)}
                            style={{ background: "none", border: `1px solid ${ACCENT}`, borderRadius: 8, padding: "8px 16px", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            + Add item
                          </button>
                        )}
                      </div>

                      {addingBSItem && (
                        <form onSubmit={addBSItem} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>New balance sheet item</p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Type *</label>
                              <select required value={bsForm.type} onChange={(e) => setBsForm((f) => ({ ...f, type: e.target.value }))}
                                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", cursor: "pointer" }}>
                                <option value="asset">Asset</option>
                                <option value="liability">Liability</option>
                                <option value="equity">Equity</option>
                              </select>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Amount *</label>
                              <input required type="number" min="0" step="0.01" placeholder="0.00" value={bsForm.amount}
                                onChange={(e) => setBsForm((f) => ({ ...f, amount: e.target.value }))}
                                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Label *</label>
                              <input required autoFocus placeholder="e.g. Equipment, Bank loan, Owner equity" value={bsForm.label}
                                onChange={(e) => setBsForm((f) => ({ ...f, label: e.target.value }))}
                                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none" }} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>As-of Date *</label>
                              <input required type="date" value={bsForm.as_of_date}
                                onChange={(e) => setBsForm((f) => ({ ...f, as_of_date: e.target.value }))}
                                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: TEXT, fontSize: 14, outline: "none", colorScheme: "dark" }} />
                            </div>
                          </div>
                          {bsError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{bsError}</p>}
                          <div style={{ display: "flex", gap: 10 }}>
                            <button type="submit" disabled={bsSaving}
                              style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: bsSaving ? "not-allowed" : "pointer" }}>
                              {bsSaving ? "Saving…" : "Add item"}
                            </button>
                            <button type="button" onClick={() => { setAddingBSItem(false); setBsForm(EMPTY_BS_ITEM); setBsError(""); }}
                              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 20px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}

                      {balanceSheet.length === 0 && !addingBSItem ? (
                        <Empty message="No balance sheet items." sub="Track assets, liabilities, and equity to see your financial position." />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {(["asset", "liability", "equity"] as const).map((type) => {
                            const items     = bsGroups[type] ?? [];
                            const subtotal  = items.reduce((s, b) => s + Number(b.amount), 0);
                            const typeColor = type === "asset" ? GREEN : type === "liability" ? RED : ACCENT;
                            const typeLabel = type === "asset" ? "Assets" : type === "liability" ? "Liabilities" : "Equity";
                            return (
                              <div key={type} style={{ ...card }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: items.length > 0 ? 14 : 0 }}>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: typeColor, textTransform: "uppercase", letterSpacing: 1 }}>{typeLabel}</span>
                                  <span style={{ fontSize: 15, fontWeight: 900, color: typeColor, fontFamily: "monospace" }}>${subtotal.toFixed(2)}</span>
                                </div>
                                {items.length === 0 ? (
                                  <p style={{ color: MUTED, fontSize: 12, margin: "8px 0 0", fontStyle: "italic" }}>No {typeLabel.toLowerCase()} recorded.</p>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {items.map((b) => editingBSId === b.id ? (
                                      <form key={b.id} onSubmit={updateBSItem} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                          <select required value={editBSForm.type} onChange={(e) => setEditBSForm((f) => ({ ...f, type: e.target.value }))}
                                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 13, outline: "none" }}>
                                            <option value="asset">Asset</option>
                                            <option value="liability">Liability</option>
                                            <option value="equity">Equity</option>
                                          </select>
                                          <input required type="number" min="0" step="0.01" value={editBSForm.amount}
                                            onChange={(e) => setEditBSForm((f) => ({ ...f, amount: e.target.value }))}
                                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 13, outline: "none" }} />
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                          <input required placeholder="Label" value={editBSForm.label}
                                            onChange={(e) => setEditBSForm((f) => ({ ...f, label: e.target.value }))}
                                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 13, outline: "none" }} />
                                          <input required type="date" value={editBSForm.as_of_date}
                                            onChange={(e) => setEditBSForm((f) => ({ ...f, as_of_date: e.target.value }))}
                                            style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 13, outline: "none", colorScheme: "dark" }} />
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                          <button type="submit" style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save</button>
                                          <button type="button" onClick={() => setEditingBSId(null)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", color: MUTED, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                                        </div>
                                      </form>
                                    ) : (
                                      <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                          <span style={{ fontWeight: 600, fontSize: 13 }}>{b.label}</span>
                                          <span style={{ color: MUTED, fontSize: 11, fontFamily: "monospace" }}>{b.as_of_date}</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                          <span style={{ fontWeight: 800, fontSize: 14, color: typeColor, fontFamily: "monospace" }}>${Number(b.amount).toFixed(2)}</span>
                                          <button onClick={() => { setEditingBSId(b.id); setEditBSForm({ type: b.type, label: b.label, amount: String(b.amount), as_of_date: b.as_of_date }); }}
                                            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 9px", color: MUTED, fontSize: 11, cursor: "pointer" }}>Edit</button>
                                          <button onClick={() => deleteBSItem(b.id)}
                                            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 9px", color: MUTED, fontSize: 11, cursor: "pointer" }}>Delete</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {balanceSheet.length > 0 && (
                            <div style={{ ...card, borderColor: Math.abs(bsCheck) < 0.01 ? GREEN + "44" : ACCENT + "44", padding: "14px 20px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 13, color: MUTED }}>Assets − (Liabilities + Equity)</span>
                                <span style={{ fontSize: 14, fontWeight: 900, color: Math.abs(bsCheck) < 0.01 ? GREEN : ACCENT, fontFamily: "monospace" }}>
                                  {Math.abs(bsCheck) < 0.01 ? "✓ Balanced" : `$${Math.abs(bsCheck).toFixed(2)} off`}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Reports — CSV Export ───────────────────────────────────── */}
                {(() => {
                  const expByCategory: Record<string, number> = {};
                  expenses.forEach((e) => { expByCategory[e.category] = (expByCategory[e.category] ?? 0) + Number(e.amount); });
                  return (
                    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 28 }}>
                      <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Reports — Export</p>

                      {/* P&L */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Profit & Loss (Last 30 days)</span>
                          <button onClick={exportPnL}
                            style={{ background: "none", border: `1px solid ${ACCENT}`, borderRadius: 8, padding: "7px 16px", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            ↓ Export CSV
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                          {[
                            { label: "Revenue",  value: `$${totalRevenue.toFixed(2)}`,  color: GREEN },
                            { label: "Expenses", value: `$${totalExpenses.toFixed(2)}`, color: RED   },
                            { label: "Net",      value: `${net < 0 ? "(" : ""}$${Math.abs(net).toFixed(2)}${net < 0 ? ")" : ""}`, color: net >= 0 ? GREEN : RED },
                          ].map((s) => (
                            <div key={s.label} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
                              <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
                              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cash Flow */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Cash Flow Summary (Last 30 days)</span>
                          <button onClick={exportCashFlow}
                            style={{ background: "none", border: `1px solid ${ACCENT}`, borderRadius: 8, padding: "7px 16px", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            ↓ Export CSV
                          </button>
                        </div>
                        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontSize: 13, color: MUTED }}>Operating inflows</span>
                            <span style={{ fontWeight: 700, color: GREEN, fontFamily: "monospace" }}>+${totalRevenue.toFixed(2)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontSize: 13, color: MUTED }}>Operating outflows</span>
                            <span style={{ fontWeight: 700, color: RED, fontFamily: "monospace" }}>−${totalExpenses.toFixed(2)}</span>
                          </div>
                          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>Net cash flow</span>
                            <span style={{ fontWeight: 900, fontSize: 18, color: net >= 0 ? GREEN : RED, fontFamily: "monospace" }}>
                              {net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expense Breakdown */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Expense Breakdown by Category</span>
                          <button onClick={exportExpenseBreakdown} disabled={expenses.length === 0}
                            style={{ background: "none", border: `1px solid ${expenses.length === 0 ? BORDER : ACCENT}`, borderRadius: 8, padding: "7px 16px", color: expenses.length === 0 ? MUTED : ACCENT, fontSize: 12, fontWeight: 700, cursor: expenses.length === 0 ? "not-allowed" : "pointer", opacity: expenses.length === 0 ? 0.5 : 1 }}>
                            ↓ Export CSV
                          </button>
                        </div>
                        {Object.keys(expByCategory).length === 0 ? (
                          <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>No expenses recorded yet.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                              const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                              return (
                                <div key={cat}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                                    <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{cat}</span>
                                    <span style={{ fontSize: 12, color: MUTED, fontFamily: "monospace" }}>${amt.toFixed(2)} ({pct.toFixed(1)}%)</span>
                                  </div>
                                  <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${pct}%`, background: RED + "88", borderRadius: 3, transition: "width 0.3s" }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const periodStart = (() => {
                    if (cancelPeriod === "day") { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
                    if (cancelPeriod === "week") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                  })();
                  const filtered = cancelledOrders.filter((o) => o.created_at >= periodStart);
                  const totalLost = filtered.reduce((s, o) => s + Number(o.total), 0);
                  const byReason: Record<string, { count: number; lost: number }> = {};
                  filtered.forEach((o) => { const r = o.cancel_reason || "No reason given"; if (!byReason[r]) byReason[r] = { count: 0, lost: 0 }; byReason[r].count++; byReason[r].lost += Number(o.total); });
                  const reasonRows = Object.entries(byReason).sort((a, b) => b[1].count - a[1].count);
                  return (
                    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ fontSize: 11, letterSpacing: 3, color: RED, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Cancellations — Last 30 Days</p>
                        <div style={{ display: "flex", background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3, gap: 2 }}>
                          {(["day", "week", "month"] as const).map((p) => (
                            <button key={p} onClick={() => setCancelPeriod(p)}
                              style={{ background: cancelPeriod === p ? SURFACE : "none", border: "none", borderRadius: 6, padding: "5px 12px", color: cancelPeriod === p ? TEXT : MUTED, fontWeight: cancelPeriod === p ? 700 : 400, fontSize: 12, cursor: "pointer" }}>
                              {p === "day" ? "Today" : p === "week" ? "7 days" : "30 days"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{ background: RED + "11", border: `1px solid ${RED}33`, borderRadius: 10, padding: "16px 18px" }}>
                          <div style={{ fontSize: 11, color: RED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Cancelled appointments</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: RED }}>{filtered.length}</div>
                        </div>
                        <div style={{ background: RED + "11", border: `1px solid ${RED}33`, borderRadius: 10, padding: "16px 18px" }}>
                          <div style={{ fontSize: 11, color: RED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Lost revenue</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: RED }}>${totalLost.toFixed(2)}</div>
                        </div>
                      </div>
                      {reasonRows.length === 0 ? (
                        <div style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: "12px 0" }}>No cancellations in this period.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>By Reason</div>
                          {reasonRows.map(([reason, { count, lost }]) => {
                            const pct = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
                            return (
                              <div key={reason}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{reason}</span>
                                  <span style={{ fontSize: 12, color: MUTED, fontFamily: "monospace" }}>{count}× · ${lost.toFixed(2)} ({pct.toFixed(0)}%)</span>
                                </div>
                                <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: RED + "88", borderRadius: 3, transition: "width 0.3s" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Branding tab */}
          {tab === "branding" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {brandingError && <p style={{ color: RED, fontSize: 13, margin: 0 }}>{brandingError}</p>}

              {/* Logo */}
              <div style={card}>
                <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>Logo</p>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  {business.logo_url ? (
                    <img src={business.logo_url} alt="Logo" style={{ width: 80, height: 80, borderRadius: 10, objectFit: "cover", border: `1px solid ${BORDER}` }} />
                  ) : (
                    <div style={{ width: 80, height: 80, borderRadius: 10, background: BG, border: `2px dashed ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 12 }}>No logo</div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Appears next to your business name in the customer booking header.</p>
                    <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
                    <button onClick={() => logoInputRef.current?.click()} disabled={brandingLogoUploading}
                      style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: brandingLogoUploading ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
                      {brandingLogoUploading ? "Uploading…" : business.logo_url ? "Replace Logo" : "Upload Logo"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Hero Image */}
              <div style={card}>
                <p style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>Hero Image</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {business.hero_image_url ? (
                    <img src={business.hero_image_url} alt="Hero" style={{ width: "100%", maxHeight: 200, borderRadius: 10, objectFit: "cover", border: `1px solid ${BORDER}` }} />
                  ) : (
                    <div style={{ width: "100%", height: 120, borderRadius: 10, background: BG, border: `2px dashed ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 12 }}>No hero image</div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Displayed as a full-width banner at the top of your customer booking page.</p>
                    <input ref={heroInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleHeroUpload} />
                    <button onClick={() => heroInputRef.current?.click()} disabled={brandingHeroUploading}
                      style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: brandingHeroUploading ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
                      {brandingHeroUploading ? "Uploading…" : business.hero_image_url ? "Replace Hero Image" : "Upload Hero Image"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StmtRow({ label, value, color, bold, negate, prefix = "", suffix = "" }: {
  label: string; value: number; color: string; bold?: boolean; negate?: boolean; prefix?: string; suffix?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 8px", marginBottom: 2 }}>
      <span style={{ fontSize: 14, color: bold ? TEXT : MUTED, fontWeight: bold ? 800 : 400 }}>{label}</span>
      <span style={{ fontSize: 14, color, fontWeight: bold ? 900 : 600, fontFamily: "monospace" }}>
        {prefix}{negate ? "−" : ""}${value.toFixed(2)}{suffix}
      </span>
    </div>
  );
}

function StmtDivider() {
  return <div style={{ borderTop: `1px solid ${BORDER}`, margin: "8px 8px 10px" }} />;
}

function Empty({ message, sub }: { message: string; sub: string }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <p style={{ color: TEXT, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{message}</p>
      <p style={{ color: MUTED, fontSize: 13 }}>{sub}</p>
    </div>
  );
}