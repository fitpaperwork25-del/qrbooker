import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const GOLD   = "#E8C547";
const DARK   = "#080808";
const CARD   = "#111111";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT   = "#F0EDE8";
const MUTED  = "#666666";
const RED    = "#f44336";

type Business = { id: string; name: string; logo_url: string | null; hero_image_url: string | null };
type Loc      = { id: string; name: string; slug: string };
type Cat      = { id: string; name: string; display_order: number };
type Item     = { id: string; category_id: string; name: string; price: number; description: string | null };

const DURATIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
];

function p2(n: number) { return String(n).padStart(2, "0"); }

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

function fmtDate(d: string) {
  if (!d) return "";
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function fmtTime(t: string) {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr || "00"} ${ampm}`;
}

// ── 12-hour time picker ───────────────────────────────────────
function Time12Picker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hStr, mStr] = value.split(":");
  const hour24 = parseInt(hStr || "9", 10);
  const minute  = (mStr || "00").padStart(2, "0");
  const ampm    = hour24 < 12 ? "AM" : "PM";
  const hour12  = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;

  const sel: React.CSSProperties = {
    flex: 1, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10,
    padding: "14px 4px", color: TEXT, fontSize: 15, textAlign: "center",
    cursor: "pointer", outline: "none",
  };

  function commit(h12: number, min: string, ap: string) {
    let h24 = h12;
    if (ap === "AM" && h12 === 12) h24 = 0;
    else if (ap === "PM" && h12 !== 12) h24 += 12;
    onChange(`${p2(h24)}:${min}`);
  }

  const mins = Array.from({ length: 12 }, (_, i) => p2(i * 5));
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select value={hour12} style={sel} onChange={e => commit(parseInt(e.target.value, 10), minute, ampm)}>
        {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <select value={minute} style={sel} onChange={e => commit(hour12, e.target.value, ampm)}>
        {mins.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={ampm} style={sel} onChange={e => commit(hour12, minute, e.target.value)}>
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10,
  padding: "14px 16px", color: TEXT, fontSize: 15, outline: "none", boxSizing: "border-box",
};
const sel: React.CSSProperties = { ...inp, cursor: "pointer" };
const lbl: React.CSSProperties = {
  display: "block", fontSize: 10, color: MUTED, fontWeight: 700,
  letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8,
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column" };

// ── Component ─────────────────────────────────────────────────
export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  const [business,  setBusiness]  = useState<Business | null>(null);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [cats,      setCats]      = useState<Cat[]>([]);
  const [items,     setItems]     = useState<Item[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", service_id: "", location_id: searchParams.get("barber") ?? "",
    date: localToday(), start_time: "09:00", duration: "60", notes: "",
  });
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { void load(); }, [slug]);

  async function load() {
    setLoading(true);
    const { data: biz } = await supabase
      .from("businesses")
      .select("id, name, logo_url, hero_image_url")
      .eq("slug", slug ?? "")
      .maybeSingle();

    if (!biz) { setNotFound(true); setLoading(false); return; }
    setBusiness(biz as Business);

    const [locRes, catRes] = await Promise.all([
      supabase.from("locations").select("id, name, slug")
        .eq("business_id", biz.id).eq("is_active", true).order("name"),
      supabase.from("menu_categories").select("id, name, display_order")
        .eq("business_id", biz.id).order("display_order"),
    ]);

    const locs = (locRes.data as Loc[]) ?? [];
    const categories = (catRes.data as Cat[]) ?? [];
    setLocations(locs);
    setCats(categories);

    // Pre-select barber from ?barber=<slug> URL param
    const barberSlug = searchParams.get("barber");
    if (barberSlug) {
      const match = locs.find(l => l.slug === barberSlug);
      if (match) {
        setForm(f => ({ ...f, location_id: match.id }));
      }
    }

    if (categories.length > 0) {
      const { data: menuItems } = await supabase
        .from("menu_items")
        .select("id, category_id, name, price, description")
        .in("category_id", categories.map(c => c.id))
        .eq("is_available", true)
        .order("display_order");
      setItems((menuItems as Item[]) ?? []);
    }
    setLoading(false);
  }

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !form.name.trim()) return;
    setError(""); setSaving(true);

    const [hStr, mStr] = form.start_time.split(":");
    const h = parseInt(hStr, 10), m = parseInt(mStr, 10);
    const endMin = h * 60 + m + parseInt(form.duration, 10);
    const endH   = Math.floor(endMin / 60) % 24;
    const endM   = endMin % 60;
    const svc    = items.find(i => i.id === form.service_id);

    const { error: err } = await supabase.from("appointments").insert({
      business_id:  business.id,
      location_id:  form.location_id  || null,
      client_name:  form.name.trim(),
      client_phone: form.phone.trim() || null,
      service_id:   form.service_id   || null,
      service_name: svc?.name         || null,
      date:         form.date,
      start_time:   `${p2(h)}:${p2(m)}:00`,
      end_time:     `${p2(endH)}:${p2(endM)}:00`,
      status:       "booked",
      notes:        form.notes.trim() || null,
    });

    if (err) {
      setError(err.code === "42501"
        ? "Booking is not available right now. Please contact the business directly."
        : err.message
      );
      setSaving(false);
      return;
    }
    setConfirmed(true); setSaving(false);
  }

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: DARK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GOLD}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  // ── Not found ─────────────────────────────────────────────────
  if (notFound) return (
    <div style={{ background: DARK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 32, fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 56, fontWeight: 900, color: MUTED }}>404</div>
      <p style={{ color: TEXT, fontSize: 18, fontWeight: 700, margin: 0 }}>Business not found</p>
      <p style={{ color: MUTED, fontSize: 14, margin: 0, textAlign: "center", maxWidth: 300 }}>
        This booking link may be invalid. Please scan the QR code again.
      </p>
    </div>
  );

  // ── Confirmed ─────────────────────────────────────────────────
  if (confirmed) {
    const svc   = items.find(i => i.id === form.service_id);
    const chair = locations.find(l => l.id === form.location_id);
    const rows  = [
      { label: "Name",    value: form.name },
      svc   && { label: "Service", value: svc.name },
      chair && { label: "With",    value: chair.name },
      { label: "Date",    value: fmtDate(form.date) },
      { label: "Time",    value: fmtTime(form.start_time) },
    ].filter(Boolean) as { label: string; value: string }[];

    return (
      <div style={{ background: DARK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 80, color: GOLD, lineHeight: 1 }}>✓</div>
            <h1 style={{ color: TEXT, fontSize: 28, fontWeight: 900, margin: "16px 0 8px", letterSpacing: -0.5 }}>You're booked!</h1>
            <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>We'll see you soon at <strong style={{ color: TEXT }}>{business?.name}</strong>.</p>
          </div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
            {rows.map((row, i) => (
              <div key={row.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 20px", gap: 16,
                borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
              }}>
                <span style={{ color: MUTED, fontSize: 13 }}>{row.label}</span>
                <span style={{ color: TEXT, fontWeight: 700, fontSize: 13, textAlign: "right" }}>{row.value}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setConfirmed(false); setForm(f => ({ ...f, name: "", phone: "", notes: "", service_id: "", location_id: "" })); }}
            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "15px", color: MUTED, fontSize: 15, cursor: "pointer", width: "100%" }}>
            Book another appointment
          </button>

          <p style={{ textAlign: "center", color: MUTED, fontSize: 12, margin: 0 }}>
            Powered by <span style={{ color: GOLD, fontWeight: 700 }}>QRBooker</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Main page ─────────────────────────────────────────────────
  return (
    <div style={{ background: DARK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: TEXT, paddingBottom: 60 }}>

      {/* Hero image */}
      <div style={{ position: "relative" }}>
        {business?.hero_image_url ? (
          <>
            <img src={business.hero_image_url} alt=""
              style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(8,8,8,0) 30%, rgba(8,8,8,0.85) 100%)" }} />
          </>
        ) : (
          <div style={{ height: 80, background: "linear-gradient(135deg,#111 0%,#1a1200 100%)" }} />
        )}
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px" }}>

        {/* Business header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 20, paddingBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
          {business?.logo_url && (
            <img src={business.logo_url} alt=""
              style={{ width: 60, height: 60, borderRadius: 12, objectFit: "contain", background: "#fff", padding: 4, border: `2px solid ${GOLD}55`, flexShrink: 0, boxSizing: "border-box" }} />
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>{business?.name}</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED, letterSpacing: 0.5 }}>Scan · Book · Show up</p>
          </div>
        </div>

        {/* Services & Pricing */}
        {cats.length > 0 && items.length > 0 && (
          <div style={{ paddingTop: 28, paddingBottom: 12 }}>
            <p style={{ margin: "0 0 18px", fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              Services & Pricing
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {cats.map(cat => {
                const catItems = items.filter(i => i.category_id === cat.id);
                if (catItems.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <p style={{ margin: "0 0 10px", fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                      {cat.name}
                    </p>
                    {catItems.map(item => (
                      <div key={item.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                        padding: "10px 0", borderBottom: `1px solid ${BORDER}`, gap: 12,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{item.name}</div>
                          {item.description && (
                            <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
                          )}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: GOLD, flexShrink: 0 }}>
                          {Number(item.price) > 0 ? `$${Number(item.price).toFixed(2)}` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider */}
        <div style={{ margin: "28px 0 0", height: 1, background: `linear-gradient(to right, ${GOLD}44, transparent)` }} />

        {/* Booking form */}
        <div style={{ paddingTop: 28 }}>
          <p style={{ margin: "0 0 22px", fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            Book an Appointment
          </p>

          <form onSubmit={book} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Name */}
            <div style={field}>
              <label style={lbl}>Your name *</label>
              <input required autoComplete="name" placeholder="First & last name"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={inp} />
            </div>

            {/* Phone */}
            <div style={field}>
              <label style={lbl}>Phone number</label>
              <input type="tel" autoComplete="tel" placeholder="+1 555 0100"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                style={inp} />
            </div>

            {/* Service */}
            {items.length > 0 && (
              <div style={field}>
                <label style={lbl}>Service</label>
                <select value={form.service_id} onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))} style={sel}>
                  <option value="">— Select a service —</option>
                  {cats.map(cat => {
                    const catItems = items.filter(i => i.category_id === cat.id);
                    if (catItems.length === 0) return null;
                    return (
                      <optgroup key={cat.id} label={cat.name}>
                        {catItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name}{Number(item.price) > 0 ? `  —  $${Number(item.price).toFixed(2)}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Chair / Barber */}
            {locations.length > 0 && (
              <div style={field}>
                <label style={lbl}>Chair / Barber</label>
                <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))} style={sel}>
                  <option value="">— No preference —</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            {/* Date */}
            <div style={field}>
              <label style={lbl}>Date *</label>
              <input required type="date" min={localToday()} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{ ...inp, colorScheme: "dark" }} />
            </div>

            {/* Time + Duration */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={field}>
                <label style={lbl}>Start time *</label>
                <Time12Picker value={form.start_time} onChange={v => setForm(f => ({ ...f, start_time: v }))} />
              </div>
              <div style={field}>
                <label style={lbl}>Duration</label>
                <select value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} style={sel}>
                  {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={field}>
              <label style={lbl}>Notes</label>
              <input placeholder="Any special requests…"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={inp} />
            </div>

            {error && (
              <p style={{ color: RED, fontSize: 13, margin: 0, padding: "10px 14px", background: RED + "15", borderRadius: 8, border: `1px solid ${RED}44` }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={saving} style={{
              width: "100%", background: GOLD, color: "#000",
              border: "none", borderRadius: 12, padding: "17px",
              fontWeight: 900, fontSize: 16, cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1, letterSpacing: 0.5, marginTop: 4,
            }}>
              {saving ? "Booking…" : "Confirm Booking"}
            </button>

            <p style={{ textAlign: "center", color: MUTED, fontSize: 11, margin: 0, letterSpacing: 0.5 }}>
              Powered by <span style={{ color: GOLD, fontWeight: 700 }}>QRBooker</span>
            </p>
          </form>
        </div>

      </div>
    </div>
  );
}