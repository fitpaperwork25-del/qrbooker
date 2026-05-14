// @ts-nocheck
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { anonSupabase as supabase } from '../lib/anonSupabase';

export default function ScanPage() {
  const { bizId, locationId } = useParams();

  const [business, setBusiness]       = useState(null);
  const [categories, setCategories]   = useState([]);
  const [items, setItems]             = useState([]);
  const [cart, setCart]               = useState({});
  const [locationUuid, setLocationUuid] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [placing, setPlacing]         = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId]         = useState(null);
  const [error, setError]             = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);

  // Tab state
  const [openTab, setOpenTab]         = useState(null);   // { id, total, location_id }
  const [tabLoading, setTabLoading]   = useState(false);
  const [showCloseTab, setShowCloseTab] = useState(false);
  const [tabClosed, setTabClosed]     = useState(false);
  const [tabFinalTotal, setTabFinalTotal] = useState(0);

  useEffect(() => {
    fetchMenu();
  }, [bizId]);

  async function fetchMenu() {
    setLoading(true);
    try {
      const { data: biz } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', bizId)
        .single();
      setBusiness(biz);

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const locQuery = supabase.from('locations').select('id').eq('business_id', bizId);
      const { data: loc } = await (UUID_RE.test(locationId)
        ? locQuery.eq('id', locationId)
        : locQuery.eq('slug', locationId)
      ).single();
      const uuid = loc?.id ?? null;
      setLocationUuid(uuid);

      // Check localStorage for an open tab at this table
      if (uuid) {
        const savedTabId = localStorage.getItem(`tab_${uuid}`);
        if (savedTabId) {
          const { data: tab } = await supabase
            .from('tabs')
            .select('id, total, location_id, status')
            .eq('id', savedTabId)
            .single();
          if (tab && tab.status === 'open') {
            setOpenTab(tab);
          } else {
            localStorage.removeItem(`tab_${uuid}`);
          }
        }
      }

      const { data: cats } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('business_id', bizId)
        .eq('is_visible', true)
        .order('display_order');
      setCategories(cats || []);
      if (cats && cats.length > 0) setActiveCategory(cats[0].id);

      if (cats && cats.length > 0) {
        const { data: menuItems } = await supabase
          .from('menu_items')
          .select('*')
          .in('category_id', cats.map(c => c.id))
          .eq('is_available', true)
          .order('display_order');
        setItems(menuItems || []);
      }
    } catch {
      setError('Failed to load menu.');
    }
    setLoading(false);
  }

  function addToCart(item) {
    setCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  }

  function removeFromCart(itemId) {
    setCart(prev => {
      const next = { ...prev };
      if (next[itemId] > 1) next[itemId]--;
      else delete next[itemId];
      return next;
    });
  }

  const cartItems = Object.entries(cart).map(([id, qty]) => ({
    ...items.find(i => i.id === id),
    qty,
  }));
  const cartTotal = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  // ── Open a new tab ────────────────────────────────────────────
  async function openNewTab() {
    if (!locationUuid || !bizId) return;
    setTabLoading(true);
    setError(null);
    try {
      const { data: tab, error: tabErr } = await supabase
        .from('tabs')
        .insert({ business_id: bizId, location_id: locationUuid, status: 'open', total: 0 })
        .select('id, total, location_id, status')
        .single();
      if (tabErr) throw tabErr;
      localStorage.setItem(`tab_${locationUuid}`, tab.id);
      setOpenTab(tab);
    } catch (err) {
      setError('Could not open tab: ' + (err?.message || 'unknown error'));
    }
    setTabLoading(false);
  }

  // ── Regular order (no tab) ────────────────────────────────────
  async function placeOrder() {
    if (cartItems.length === 0) return;
    if (!locationUuid) { setError('Could not find this table. Please scan the QR code again.'); return; }
    setPlacing(true);
    setError(null);
    try {
      const newOrderId = crypto.randomUUID();
      const { error: orderErr } = await supabase
        .from('orders')
        .insert({ id: newOrderId, business_id: bizId, location_id: locationUuid, total: cartTotal, status: 'new' });
      if (orderErr) throw orderErr;
      const { error: itemsErr } = await supabase.from('order_items').insert(
        cartItems.map(i => ({ order_id: newOrderId, menu_item_id: i.id, quantity: i.qty, unit_price: i.price }))
      );
      if (itemsErr) throw itemsErr;
      setOrderId(newOrderId);
      setOrderPlaced(true);
      setCart({});
    } catch (err) {
      setError(`Order failed: ${err?.message || err?.code || JSON.stringify(err)}`);
    }
    setPlacing(false);
  }

  // ── Add order to open tab ─────────────────────────────────────
  async function addToTabOrder() {
    if (cartItems.length === 0 || !openTab) return;
    if (!locationUuid) { setError('Could not find this table.'); return; }
    setPlacing(true);
    setError(null);
    try {
      const newOrderId = crypto.randomUUID();
      const { error: orderErr } = await supabase
        .from('orders')
        .insert({ id: newOrderId, business_id: bizId, location_id: locationUuid, total: cartTotal, status: 'new', tab_id: openTab.id });
      if (orderErr) throw orderErr;
      const { error: itemsErr } = await supabase.from('order_items').insert(
        cartItems.map(i => ({ order_id: newOrderId, menu_item_id: i.id, quantity: i.qty, unit_price: i.price }))
      );
      if (itemsErr) throw itemsErr;

      // Update running tab total
      const newTotal = Number(openTab.total) + cartTotal;
      await supabase.from('tabs').update({ total: newTotal }).eq('id', openTab.id);
      setOpenTab(prev => ({ ...prev, total: newTotal }));

      setOrderId(newOrderId);
      setOrderPlaced(true);
      setCart({});
    } catch (err) {
      setError(`Order failed: ${err?.message || err?.code || JSON.stringify(err)}`);
    }
    setPlacing(false);
  }

  // ── Close tab ─────────────────────────────────────────────────
  async function closeTab() {
    if (!openTab) return;
    setTabLoading(true);
    setError(null);
    try {
      const final = Number(openTab.total);
      const { error: tabErr } = await supabase
        .from('tabs')
        .update({ status: 'closed', closed_at: new Date().toISOString(), total: final })
        .eq('id', openTab.id);
      if (tabErr) throw tabErr;
      localStorage.removeItem(`tab_${locationUuid}`);
      setTabFinalTotal(final);
      setOpenTab(null);
      setShowCloseTab(false);
      setTabClosed(true);
    } catch (err) {
      setError('Could not close tab: ' + (err?.message || 'unknown error'));
    }
    setTabLoading(false);
  }

  const itemsByCategory = (catId) => items.filter(i => i.category_id === catId);

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div style={S.centered}>
      <div style={S.spinner} />
    </div>
  );

  // ── Tab closed confirmation ───────────────────────────────────
  if (tabClosed) return (
    <div style={S.centered}>
      <div style={S.successBox}>
        <div style={S.checkmark}>✓</div>
        <h2 style={S.successTitle}>Tab Closed</h2>
        <p style={S.successSub}>Total: <strong style={{ color: gold }}>${tabFinalTotal.toFixed(2)}</strong></p>
        <p style={S.successSub}>Please pay with your server. Thank you!</p>
        <button style={S.newOrderBtn} onClick={() => setTabClosed(false)}>
          Back to Menu
        </button>
      </div>
    </div>
  );

  // ── Order placed confirmation ─────────────────────────────────
  if (orderPlaced) return (
    <div style={S.centered}>
      <div style={S.successBox}>
        <div style={S.checkmark}>✓</div>
        <h2 style={S.successTitle}>{openTab ? 'Added to Tab!' : 'Order Placed!'}</h2>
        <p style={S.successSub}>
          {openTab
            ? `Tab running total: $${Number(openTab.total).toFixed(2)}`
            : 'Your order has been sent to the kitchen.'}
        </p>
        <p style={S.orderId}>#{orderId?.slice(-6).toUpperCase()}</p>
        <button style={S.newOrderBtn} onClick={() => setOrderPlaced(false)}>
          {openTab ? 'Add More to Tab' : 'Order More'}
        </button>
        {openTab && (
          <button style={{ ...S.newOrderBtn, background: 'transparent', border: `1px solid ${gold}`, color: gold, marginTop: 10 }}
            onClick={() => { setOrderPlaced(false); setShowCloseTab(true); }}>
            Close Tab & Pay
          </button>
        )}
      </div>
    </div>
  );

  // ── Close tab confirmation overlay ────────────────────────────
  if (showCloseTab) return (
    <div style={S.centered}>
      <div style={S.successBox}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🧾</div>
        <h2 style={S.successTitle}>Close Your Tab?</h2>
        <p style={S.successSub}>Running total</p>
        <div style={{ fontSize: 36, fontWeight: 800, color: gold, margin: '8px 0 20px' }}>
          ${Number(openTab?.total ?? 0).toFixed(2)}
        </div>
        <p style={{ ...S.successSub, fontSize: 13 }}>
          All orders are already in progress with the kitchen.
          Closing the tab means you're ready to pay with your server.
        </p>
        <button
          style={{ ...S.newOrderBtn, marginTop: 16 }}
          onClick={closeTab}
          disabled={tabLoading}
        >
          {tabLoading ? 'Closing…' : 'Close Tab & Pay'}
        </button>
        <button
          style={{ ...S.newOrderBtn, background: 'transparent', border: `1px solid ${border}`, color: muted, marginTop: 10 }}
          onClick={() => setShowCloseTab(false)}
        >
          Keep Tab Open
        </button>
        {error && <p style={{ color: '#e53e3e', fontSize: 13, marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );

  // ── Main menu page ────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.bizName}>{business?.name || 'Menu'}</h1>
      </div>

      {/* Tab banner */}
      {openTab ? (
        <div style={S.tabBannerOpen}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: muted }}>Tab open</span>
            <span style={{ fontWeight: 800, color: gold, fontSize: 16 }}>${Number(openTab.total).toFixed(2)}</span>
          </div>
          <button style={S.closeTabBtn} onClick={() => setShowCloseTab(true)}>
            Close Tab →
          </button>
        </div>
      ) : (
        <div style={S.tabBannerClosed}>
          <span style={{ fontSize: 13, color: muted }}>Staying for a while?</span>
          <button style={S.openTabBtn} onClick={openNewTab} disabled={tabLoading || !locationUuid}>
            {tabLoading ? 'Opening…' : 'Open a Tab'}
          </button>
        </div>
      )}

      {/* Category Nav */}
      <div style={S.catNav}>
        {categories.map(cat => (
          <button
            key={cat.id}
            style={{ ...S.catBtn, ...(activeCategory === cat.id ? S.catBtnActive : {}) }}
            onClick={() => {
              setActiveCategory(cat.id);
              document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Menu */}
      <div style={S.menuArea}>
        {categories.map(cat => {
          const catItems = itemsByCategory(cat.id);
          if (catItems.length === 0) return null;
          return (
            <div key={cat.id} id={`cat-${cat.id}`} style={S.catSection}>
              <h2 style={S.catTitle}>{cat.name}</h2>
              {catItems.map(item => (
                <div key={item.id} style={S.itemCard}>
                  <div style={S.itemInfo}>
                    <div style={S.itemName}>{item.name}</div>
                    {item.description && <div style={S.itemDesc}>{item.description}</div>}
                    <div style={S.itemPrice}>${item.price.toFixed(2)}</div>
                  </div>
                  <div style={S.itemControls}>
                    {cart[item.id] ? (
                      <div style={S.qtyRow}>
                        <button style={S.qtyBtn} onClick={() => removeFromCart(item.id)}>−</button>
                        <span style={S.qtyNum}>{cart[item.id]}</span>
                        <button style={S.qtyBtn} onClick={() => addToCart(item)}>+</button>
                      </div>
                    ) : (
                      <button style={S.addBtn} onClick={() => addToCart(item)}>Add</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Cart Bar */}
      {cartCount > 0 && (
        <div style={S.cartBar}>
          <div style={S.cartLeft}>
            <span style={S.cartCount}>{cartCount}</span>
            <span style={S.cartLabel}>item{cartCount > 1 ? 's' : ''} in cart</span>
          </div>
          <div style={S.cartRight}>
            <span style={S.cartTotal}>${cartTotal.toFixed(2)}</span>
            {openTab ? (
              <button style={S.placeBtn} onClick={addToTabOrder} disabled={placing}>
                {placing ? 'Adding…' : 'Add to Tab'}
              </button>
            ) : (
              <button style={S.placeBtn} onClick={placeOrder} disabled={placing}>
                {placing ? 'Placing…' : 'Place Order'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <div style={S.errorBar}>{error}</div>}
    </div>
  );
}

const gold   = '#C9823A';
const dark   = '#0f0f0f';
const card   = '#1a1a1a';
const border = '#2a2a2a';
const text   = '#f0f0f0';
const muted  = '#888';

const S = {
  page:        { background: dark, minHeight: '100vh', color: text, fontFamily: 'system-ui, sans-serif', paddingBottom: 100 },
  header:      { padding: '20px 16px 12px', borderBottom: `1px solid ${border}` },
  bizName:     { margin: 0, fontSize: 22, fontWeight: 700, color: gold },

  // Tab banners
  tabBannerOpen: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 16px', background: '#1a1400', borderBottom: `1px solid ${gold}44`,
  },
  tabBannerClosed: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 16px', background: card, borderBottom: `1px solid ${border}`,
  },
  closeTabBtn: {
    background: 'none', border: `1px solid ${gold}`, color: gold,
    borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  openTabBtn: {
    background: gold, color: '#000',
    border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },

  catNav:      { display: 'flex', flexWrap: 'nowrap', gap: 8, padding: '12px 16px', overflowX: 'auto', overflowY: 'hidden', borderBottom: `1px solid ${border}`, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' },
  catBtn:      { background: 'transparent', border: `1px solid ${border}`, color: muted, borderRadius: 20, padding: '6px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' },
  catBtnActive:{ background: gold, borderColor: gold, color: '#000', fontWeight: 600 },
  menuArea:    { padding: '0 16px' },
  catSection:  { paddingTop: 20 },
  catTitle:    { fontSize: 16, fontWeight: 700, color: gold, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 },
  itemCard:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: card, borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: `1px solid ${border}` },
  itemInfo:    { flex: 1, paddingRight: 12 },
  itemName:    { fontWeight: 600, fontSize: 15, marginBottom: 4 },
  itemDesc:    { fontSize: 12, color: muted, lineHeight: 1.4, marginBottom: 6 },
  itemPrice:   { color: gold, fontWeight: 700, fontSize: 15 },
  itemControls:{ display: 'flex', alignItems: 'center', paddingTop: 4 },
  addBtn:      { background: gold, color: '#000', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  qtyRow:      { display: 'flex', alignItems: 'center', gap: 10 },
  qtyBtn:      { background: border, color: text, border: 'none', borderRadius: 6, width: 30, height: 30, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qtyNum:      { fontSize: 16, fontWeight: 700, minWidth: 20, textAlign: 'center' },
  cartBar:     { position: 'fixed', bottom: 0, left: 0, right: 0, background: card, borderTop: `2px solid ${gold}`, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cartLeft:    { display: 'flex', alignItems: 'center', gap: 10 },
  cartCount:   { background: gold, color: '#000', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 },
  cartLabel:   { fontSize: 14, color: muted },
  cartRight:   { display: 'flex', alignItems: 'center', gap: 14 },
  cartTotal:   { fontWeight: 700, fontSize: 16, color: gold },
  placeBtn:    { background: gold, color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  centered:    { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: dark },
  spinner:     { width: 36, height: 36, border: `3px solid ${border}`, borderTop: `3px solid ${gold}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  successBox:  { textAlign: 'center', padding: 40, maxWidth: 360 },
  checkmark:   { fontSize: 64, color: gold, marginBottom: 16 },
  successTitle:{ fontSize: 28, fontWeight: 700, color: text, margin: '0 0 8px' },
  successSub:  { color: muted, fontSize: 16, margin: '0 0 12px' },
  orderId:     { color: gold, fontWeight: 700, fontSize: 18, margin: '0 0 24px' },
  newOrderBtn: { background: gold, color: '#000', border: 'none', borderRadius: 10, padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'block', width: '100%' },
  errorBar:    { position: 'fixed', top: 0, left: 0, right: 0, background: '#c0392b', color: '#fff', padding: '12px 16px', textAlign: 'center', fontSize: 14, zIndex: 999 },
};
