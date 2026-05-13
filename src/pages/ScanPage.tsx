import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ScanPage() {
  const { bizId, locationId } = useParams();
  const [business, setBusiness] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);

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

      const { data: cats } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('business_id', bizId)
        .eq('is_visible', true)
        .order('display_order');
      setCategories(cats || []);
      if (cats && cats.length > 0) setActiveCategory(cats[0].id);

      if (cats && cats.length > 0) {
        const catIds = cats.map(c => c.id);
        const { data: menuItems } = await supabase
          .from('menu_items')
          .select('*')
          .in('category_id', catIds)
          .eq('is_available', true)
          .order('display_order');
        setItems(menuItems || []);
      }
    } catch (err) {
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

  async function placeOrder() {
    if (cartItems.length === 0) return;
    setPlacing(true);
    setError(null);
    try {
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({ business_id: bizId, location_id: locationId, total: cartTotal, status: 'new' })
        .select()
        .single();

      if (orderErr) throw orderErr;

      const orderItemsPayload = cartItems.map(i => ({
        order_id: order.id,
        menu_item_id: i.id,
        quantity: i.qty,
        unit_price: i.price,
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsPayload);
      if (itemsErr) throw itemsErr;

      setOrderId(order.id);
      setOrderPlaced(true);
      setCart({});
    } catch (err) {
      setError('Failed to place order. Please try again.');
    }
    setPlacing(false);
  }

  const itemsByCategory = (catId) => items.filter(i => i.category_id === catId);

  if (loading) return (
    <div style={styles.centered}>
      <div style={styles.spinner} />
    </div>
  );

  if (orderPlaced) return (
    <div style={styles.centered}>
      <div style={styles.successBox}>
        <div style={styles.checkmark}>✓</div>
        <h2 style={styles.successTitle}>Order Placed!</h2>
        <p style={styles.successSub}>Your order has been sent to the kitchen.</p>
        <p style={styles.orderId}>Order #{orderId?.slice(-6).toUpperCase()}</p>
        <button style={styles.newOrderBtn} onClick={() => setOrderPlaced(false)}>
          Order More
        </button>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.bizName}>{business?.name || 'Menu'}</h1>
      </div>

      {/* Category Nav */}
      <div style={styles.catNav}>
        {categories.map(cat => (
          <button
            key={cat.id}
            style={{ ...styles.catBtn, ...(activeCategory === cat.id ? styles.catBtnActive : {}) }}
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
      <div style={styles.menuArea}>
        {categories.map(cat => {
          const catItems = itemsByCategory(cat.id);
          if (catItems.length === 0) return null;
          return (
            <div key={cat.id} id={`cat-${cat.id}`} style={styles.catSection}>
              <h2 style={styles.catTitle}>{cat.name}</h2>
              {catItems.map(item => (
                <div key={item.id} style={styles.itemCard}>
                  <div style={styles.itemInfo}>
                    <div style={styles.itemName}>{item.name}</div>
                    {item.description && <div style={styles.itemDesc}>{item.description}</div>}
                    <div style={styles.itemPrice}>${item.price.toFixed(2)}</div>
                  </div>
                  <div style={styles.itemControls}>
                    {cart[item.id] ? (
                      <div style={styles.qtyRow}>
                        <button style={styles.qtyBtn} onClick={() => removeFromCart(item.id)}>−</button>
                        <span style={styles.qtyNum}>{cart[item.id]}</span>
                        <button style={styles.qtyBtn} onClick={() => addToCart(item)}>+</button>
                      </div>
                    ) : (
                      <button style={styles.addBtn} onClick={() => addToCart(item)}>Add</button>
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
        <div style={styles.cartBar}>
          <div style={styles.cartLeft}>
            <span style={styles.cartCount}>{cartCount}</span>
            <span style={styles.cartLabel}>item{cartCount > 1 ? 's' : ''} in cart</span>
          </div>
          <div style={styles.cartRight}>
            <span style={styles.cartTotal}>${cartTotal.toFixed(2)}</span>
            <button style={styles.placeBtn} onClick={placeOrder} disabled={placing}>
              {placing ? 'Placing...' : 'Place Order'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={styles.errorBar}>{error}</div>}
    </div>
  );
}

const gold = '#C9823A';
const dark = '#0f0f0f';
const card = '#1a1a1a';
const border = '#2a2a2a';
const text = '#f0f0f0';
const muted = '#888';

const styles = {
  page: { background: dark, minHeight: '100vh', color: text, fontFamily: 'system-ui, sans-serif', paddingBottom: 100 },
  header: { padding: '20px 16px 12px', borderBottom: `1px solid ${border}` },
  bizName: { margin: 0, fontSize: 22, fontWeight: 700, color: gold },
  catNav: { display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', borderBottom: `1px solid ${border}`, scrollbarWidth: 'none' },
  catBtn: { background: 'transparent', border: `1px solid ${border}`, color: muted, borderRadius: 20, padding: '6px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' },
  catBtnActive: { background: gold, borderColor: gold, color: '#000', fontWeight: 600 },
  menuArea: { padding: '0 16px' },
  catSection: { paddingTop: 20 },
  catTitle: { fontSize: 16, fontWeight: 700, color: gold, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 },
  itemCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: card, borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: `1px solid ${border}` },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemName: { fontWeight: 600, fontSize: 15, marginBottom: 4 },
  itemDesc: { fontSize: 12, color: muted, lineHeight: 1.4, marginBottom: 6 },
  itemPrice: { color: gold, fontWeight: 700, fontSize: 15 },
  itemControls: { display: 'flex', alignItems: 'center', paddingTop: 4 },
  addBtn: { background: gold, color: '#000', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 10 },
  qtyBtn: { background: border, color: text, border: 'none', borderRadius: 6, width: 30, height: 30, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qtyNum: { fontSize: 16, fontWeight: 700, minWidth: 20, textAlign: 'center' },
  cartBar: { position: 'fixed', bottom: 0, left: 0, right: 0, background: card, borderTop: `2px solid ${gold}`, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cartLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  cartCount: { background: gold, color: '#000', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 },
  cartLabel: { fontSize: 14, color: muted },
  cartRight: { display: 'flex', alignItems: 'center', gap: 14 },
  cartTotal: { fontWeight: 700, fontSize: 16, color: gold },
  placeBtn: { background: gold, color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: dark },
  spinner: { width: 36, height: 36, border: `3px solid ${border}`, borderTop: `3px solid ${gold}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  successBox: { textAlign: 'center', padding: 40 },
  checkmark: { fontSize: 64, color: gold, marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: 700, color: text, margin: '0 0 8px' },
  successSub: { color: muted, fontSize: 16, margin: '0 0 12px' },
  orderId: { color: gold, fontWeight: 700, fontSize: 18, margin: '0 0 24px' },
  newOrderBtn: { background: gold, color: '#000', border: 'none', borderRadius: 10, padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  errorBar: { position: 'fixed', top: 0, left: 0, right: 0, background: '#c0392b', color: '#fff', padding: '12px 16px', textAlign: 'center', fontSize: 14 },
};
