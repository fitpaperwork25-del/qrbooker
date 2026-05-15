import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "../lib/useAuth";
import { supabase } from "../lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────
const SUPER_ADMIN = "fitpaperwork25@gmail.com";
const APP_URL     = "https://qrserve-v3.vercel.app";

const BG     = "#080808";
const CARD   = "#111111";
const INNER  = "#161616";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT   = "#F0EDE8";
const MUTED  = "#666666";
const ACCENT = "#E8C547";
const GREEN  = "#4CAF50";
const RED    = "#f44336";
const ORANGE = "#F97316";
const BLUE   = "#3B82F6";

const BIZ_TYPES = ["restaurant","cafe","barbershop","salon","hotel"] as const;
const QUICK_NOTES = ["QR code printed 🖨️","Staff trained ✅","Went live 🚀","Follow-up call 📞","Issue reported ⚠️"];

// ── Types ─────────────────────────────────────────────────────────────────────
type AdminBiz = {
  id: string; name: string; slug: string; plan: string;
  subscription_status: string; created_at: string;
  owner_email: string | null; staff_pin: string | null;
  location_count: number; menu_item_count: number; order_count: number;
  qr_printed: boolean; staff_trained: boolean;
};
type AdminNote = { id: string; business_id: string; note: string; created_at: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
function deployStatus(b: AdminBiz): { label: string; color: string } {
  if (b.order_count > 0)                              return { label: "Live",        color: GREEN  };
  if (b.location_count > 0 && b.menu_item_count > 0) return { label: "In Progress", color: ACCENT };
  return                                                     { label: "Not Started", color: MUTED  };
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: "inline-block",
      background: color + "22", color,
      border: `1px solid ${color}44`,
      borderRadius: 5, padding: "2px 8px",
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      textTransform: "uppercase" as const,
    }}>{label}</span>
  );
}

function planColor(p: string) {
  return p === "enterprise" ? TEXT : p === "pro" ? ACCENT : MUTED;
}
function statusColor(s: string) {
  if (s === "active")    return GREEN;
  if (s === "trialing")  return ACCENT;
  if (s === "past_due")  return ORANGE;
  return RED;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { session } = useAuth();
  const isSuperAdmin = session?.user?.email === SUPER_ADMIN;

  const [businesses, setBusinesses] = useState<AdminBiz[]>([]);
  const [notes,      setNotes]      = useState<Record<string, AdminNote[]>>({});
  const [qrCodes,    setQrCodes]    = useState<Record<string, string>>({});
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState("");
  const [loadingDashboard, setLoadingDashboard] = useState<string | null>(null);

  // Per-business UI state
  const [pinInputs,     setPinInputs]     = useState<Record<string, string>>({});
  const [savingPin,     setSavingPin]     = useState<string | null>(null);
  const [noteInputs,    setNoteInputs]    = useState<Record<string, string>>({});
  const [savingNote,    setSavingNote]    = useState<string | null>(null);
  const [togglingCheck, setTogglingCheck] = useState<string | null>(null);
  const [copied,        setCopied]        = useState<string | null>(null);

  // New Client modal
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "", slug: "", type: "restaurant" as string,
    email: "", password: "", pin: "1234",
  });
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientError, setNewClientError] = useState("");

  useEffect(() => { if (isSuperAdmin) void load(); }, [isSuperAdmin]);

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    const [bizRes, notesRes] = await Promise.all([
      supabase.rpc("get_admin_businesses"),
      supabase.from("admin_notes").select("id, business_id, note, created_at")
                                  .order("created_at", { ascending: false }),
    ]);

    if (bizRes.error) { setError(bizRes.error.message); setLoading(false); return; }

    const bizList = (bizRes.data ?? []) as AdminBiz[];
    setBusinesses(bizList);

    // Group notes by business
    const noteMap: Record<string, AdminNote[]> = {};
    ((notesRes.data ?? []) as AdminNote[]).forEach((n) => {
      if (!noteMap[n.business_id]) noteMap[n.business_id] = [];
      noteMap[n.business_id].push(n);
    });
    setNotes(noteMap);

    // Init PIN inputs from current values
    const pins: Record<string, string> = {};
    bizList.forEach((b) => { pins[b.id] = b.staff_pin ?? ""; });
    setPinInputs(pins);

    // Generate QR codes
    const entries = await Promise.all(
      bizList.map(async (b) => [
        b.id,
        await QRCode.toDataURL(`${APP_URL}/scan/${b.slug}`, {
          width: 140, margin: 1,
          color: { dark: "#E8C547", light: "#111111" },
        }),
      ] as [string, string])
    );
    setQrCodes(Object.fromEntries(entries));
    setLoading(false);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function savePin(bizId: string) {
    const pin = (pinInputs[bizId] ?? "").trim();
    if (!pin) return;
    setSavingPin(bizId);
    await supabase.rpc("admin_update_staff_pin", { p_biz_id: bizId, p_pin: pin });
    setBusinesses((prev) => prev.map((b) => b.id === bizId ? { ...b, staff_pin: pin } : b));
    setSavingPin(null);
  }

  async function addNote(bizId: string, text: string) {
    const note = text.trim();
    if (!note) return;
    setSavingNote(bizId);
    const { data } = await supabase.from("admin_notes")
      .insert({ business_id: bizId, note })
      .select("id, business_id, note, created_at")
      .single();
    if (data) {
      setNotes((prev) => ({ ...prev, [bizId]: [data as AdminNote, ...(prev[bizId] ?? [])] }));
      setNoteInputs((prev) => ({ ...prev, [bizId]: "" }));
    }
    setSavingNote(null);
  }

  async function toggleCheck(bizId: string, field: "qr_printed" | "staff_trained", current: boolean) {
    setTogglingCheck(`${bizId}:${field}`);
    await supabase.rpc("admin_toggle_checklist", { p_biz_id: bizId, p_field: field, p_value: !current });
    setBusinesses((prev) => prev.map((b) =>
      b.id === bizId ? { ...b, [field]: !current } : b
    ));
    setTogglingCheck(null);
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function openOwnerDashboard(biz: AdminBiz) {
    if (!biz.owner_email) return;
    setLoadingDashboard(biz.id);
    const jwt = session?.access_token;
    const res = await fetch("/api/admin-get-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ email: biz.owner_email }),
    });
    const data = await res.json();
    setLoadingDashboard(null);
    if (data.link) window.open(data.link, "_blank");
  }

  async function createClient() {
    const { name, slug, type, email, password, pin } = newClient;
    if (!name || !slug || !email || !password) { setNewClientError("All fields required."); return; }
    setCreatingClient(true);
    setNewClientError("");

    // 1. Create auth user via server endpoint
    const jwt = session?.access_token;
    const userRes = await fetch("/api/admin-create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ email, password }),
    });
    const userData = await userRes.json();
    if (!userRes.ok) { setNewClientError(userData.error ?? "User creation failed"); setCreatingClient(false); return; }

    // 2. Create business via SECURITY DEFINER RPC
    const { error: bizErr } = await supabase.rpc("admin_create_business", {
      p_owner_id: userData.user_id, p_name: name, p_slug: slug, p_type: type, p_pin: pin,
    });
    if (bizErr) { setNewClientError(bizErr.message); setCreatingClient(false); return; }

    setShowNewClient(false);
    setNewClient({ name: "", slug: "", type: "restaurant", email: "", password: "", pin: "1234" });
    setCreatingClient(false);
    void load();
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!isSuperAdmin) return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <p style={{ color: RED, fontWeight: 700, fontSize: 16, margin: "0 0 6px" }}>Access denied</p>
        <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Super-admin only.</p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 36, height: 36, border: `3px solid rgba(255,255,255,0.08)`, borderTop: `3px solid ${ACCENT}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (error) return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      <p style={{ color: RED }}>{error}</p>
    </div>
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  const live       = businesses.filter(b => b.order_count > 0).length;
  const inProgress = businesses.filter(b => b.order_count === 0 && b.location_count > 0 && b.menu_item_count > 0).length;
  const notStarted = businesses.filter(b => b.location_count === 0 || b.menu_item_count === 0).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif" }}>

      {/* Header */}
      <header style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "20px 28px", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 4px" }}>Super Admin</p>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
              Client Success — {businesses.length} business{businesses.length !== 1 ? "es" : ""}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {[
              { label: "Live",        val: live,       color: GREEN  },
              { label: "In Progress", val: inProgress, color: ACCENT },
              { label: "Not Started", val: notStarted, color: MUTED  },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
              </div>
            ))}
            <button
              onClick={() => setShowNewClient(true)}
              style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              + New Client
            </button>
          </div>
        </div>
      </header>

      {/* Business cards */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
        {businesses.map((biz) => {
          const deploy   = deployStatus(biz);
          const bizNotes = notes[biz.id] ?? [];

          // Checklist
          const checks = [
            { label: "Account created",     done: true,                              auto: true },
            { label: "Tables set up",        done: biz.location_count > 0,           auto: true },
            { label: "Menu loaded",          done: biz.menu_item_count > 0,          auto: true },
            { label: "QR printed",           done: biz.qr_printed,                   auto: false, field: "qr_printed"    as const },
            { label: "Staff trained",        done: biz.staff_trained,                auto: false, field: "staff_trained"  as const },
            { label: "First order received", done: biz.order_count > 0,              auto: true },
          ];
          const doneCount = checks.filter(c => c.done).length;

          return (
            <div key={biz.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>

              {/* ── Card header ────────────────────────────────────────── */}
              <div style={{ padding: "18px 22px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 17 }}>{biz.name}</span>
                    <Badge color={deploy.color} label={deploy.label} />
                    <Badge color={planColor(biz.plan)} label={biz.plan} />
                    <Badge color={statusColor(biz.subscription_status)} label={biz.subscription_status} />
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: MUTED }}>
                    <span style={{ color: ACCENT, fontFamily: "monospace" }}>/{biz.slug}</span>
                    {biz.owner_email && <span>{biz.owner_email}</span>}
                    <span>Joined {new Date(biz.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    <span style={{ color: doneCount === 6 ? GREEN : MUTED }}>Setup {doneCount}/6</span>
                  </div>
                </div>
                {/* QR code */}
                {qrCodes[biz.id] && (
                  <a href={qrCodes[biz.id]} download={`qr-${biz.slug}.png`} title="Download QR"
                     style={{ display: "block", borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, flexShrink: 0 }}>
                    <img src={qrCodes[biz.id]} alt="QR" width={72} height={72} style={{ display: "block" }} />
                  </a>
                )}
              </div>

              {/* ── Body: two-column grid ──────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 0 }}>

                {/* LEFT: Deploy Kit + Checklist + PIN */}
                <div style={{ borderRight: `1px solid ${BORDER}`, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Deploy Kit */}
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: 2, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 10px" }}>Deploy Kit</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Scan page link */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: MUTED, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {APP_URL}/scan/{biz.slug}
                        </span>
                        <button onClick={() => copy(`${APP_URL}/scan/${biz.slug}`, `scanlink-${biz.id}`)}
                          style={{ background: copied === `scanlink-${biz.id}` ? GREEN + "22" : INNER, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", color: copied === `scanlink-${biz.id}` ? GREEN : MUTED, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                          {copied === `scanlink-${biz.id}` ? "✓ Copied" : "Copy"}
                        </button>
                        <a href={`${APP_URL}/scan/${biz.slug}`} target="_blank" rel="noreferrer"
                           style={{ background: INNER, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", color: MUTED, fontSize: 11, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
                          Open ↗
                        </a>
                      </div>
                      {/* Staff login — slug+pin pre-filled via query params */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: MUTED, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          /staff-login?slug=<span style={{ color: TEXT }}>{biz.slug}</span>&amp;pin=<span style={{ color: TEXT }}>{biz.staff_pin ?? "—"}</span>
                        </span>
                        <button onClick={() => copy(`${APP_URL}/staff-login?slug=${biz.slug}&pin=${biz.staff_pin ?? ""}`, `stafflink-${biz.id}`)}
                          style={{ background: copied === `stafflink-${biz.id}` ? GREEN + "22" : INNER, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", color: copied === `stafflink-${biz.id}` ? GREEN : MUTED, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                          {copied === `stafflink-${biz.id}` ? "✓ Copied" : "Copy"}
                        </button>
                        <a href={`${APP_URL}/staff-login?slug=${biz.slug}&pin=${biz.staff_pin ?? ""}`} target="_blank" rel="noreferrer"
                           style={{ background: INNER, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", color: MUTED, fontSize: 11, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
                          Staff ↗
                        </a>
                      </div>
                      {/* Owner dashboard — opens via magic link */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: MUTED, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {biz.owner_email ?? "no email on file"}
                        </span>
                        <button
                          onClick={() => openOwnerDashboard(biz)}
                          disabled={!biz.owner_email || loadingDashboard === biz.id}
                          title="Generates a magic link — opens owner's dashboard in a new tab"
                          style={{ background: INNER, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", color: biz.owner_email ? BLUE : MUTED, fontSize: 11, fontWeight: 700, cursor: biz.owner_email ? "pointer" : "not-allowed", flexShrink: 0 }}>
                          {loadingDashboard === biz.id ? "…" : "Dashboard ↗"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Deployment checklist */}
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: 2, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 10px" }}>Deployment Checklist</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {checks.map((c) => (
                        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {c.auto ? (
                            <span style={{ width: 18, height: 18, borderRadius: "50%", background: c.done ? GREEN + "33" : INNER, border: `1px solid ${c.done ? GREEN : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: c.done ? GREEN : MUTED, flexShrink: 0 }}>
                              {c.done ? "✓" : "–"}
                            </span>
                          ) : (
                            <button
                              disabled={togglingCheck === `${biz.id}:${c.field}`}
                              onClick={() => toggleCheck(biz.id, c.field!, c.done)}
                              style={{ width: 18, height: 18, borderRadius: "50%", background: c.done ? GREEN + "33" : INNER, border: `1px solid ${c.done ? GREEN : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: c.done ? GREEN : MUTED, cursor: "pointer", flexShrink: 0, padding: 0 }}>
                              {c.done ? "✓" : "–"}
                            </button>
                          )}
                          <span style={{ fontSize: 12, color: c.done ? TEXT : MUTED }}>
                            {c.label}
                            {!c.auto && <span style={{ color: MUTED, fontSize: 10, marginLeft: 4 }}>(click to toggle)</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Reset staff PIN */}
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: 2, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 10px" }}>Staff PIN</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="text"
                        maxLength={6}
                        value={pinInputs[biz.id] ?? ""}
                        onChange={(e) => setPinInputs((p) => ({ ...p, [biz.id]: e.target.value.replace(/\D/g, "") }))}
                        placeholder="1234"
                        style={{ flex: 1, background: INNER, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 10px", color: TEXT, fontSize: 14, outline: "none", fontFamily: "monospace", letterSpacing: 4 }}
                      />
                      <button
                        onClick={() => savePin(biz.id)}
                        disabled={savingPin === biz.id}
                        style={{ background: savingPin === biz.id ? BORDER : ACCENT, color: BG, border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: savingPin === biz.id ? "not-allowed" : "pointer", flexShrink: 0 }}>
                        {savingPin === biz.id ? "…" : "Update"}
                      </button>
                    </div>
                  </div>

                </div>

                {/* RIGHT: Communication log */}
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ fontSize: 10, letterSpacing: 2, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Communication Log</p>

                  {/* Quick notes */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {QUICK_NOTES.map((qn) => (
                      <button key={qn}
                        onClick={() => addNote(biz.id, qn)}
                        style={{ background: INNER, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", color: MUTED, fontSize: 11, cursor: "pointer" }}>
                        {qn}
                      </button>
                    ))}
                  </div>

                  {/* Free-text input */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Add a note…"
                      value={noteInputs[biz.id] ?? ""}
                      onChange={(e) => setNoteInputs((p) => ({ ...p, [biz.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addNote(biz.id, noteInputs[biz.id] ?? "")}
                      style={{ flex: 1, background: INNER, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 10px", color: TEXT, fontSize: 13, outline: "none" }}
                    />
                    <button
                      onClick={() => addNote(biz.id, noteInputs[biz.id] ?? "")}
                      disabled={savingNote === biz.id}
                      style={{ background: savingNote === biz.id ? BORDER : INNER, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 14px", color: savingNote === biz.id ? MUTED : ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                      {savingNote === biz.id ? "…" : "Log"}
                    </button>
                  </div>

                  {/* Log entries */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                    {bizNotes.length === 0 ? (
                      <p style={{ color: MUTED, fontSize: 12, margin: "4px 0 0" }}>No notes yet.</p>
                    ) : (
                      bizNotes.map((n) => (
                        <div key={n.id} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: 10, color: MUTED, flexShrink: 0, fontFamily: "monospace" }}>{timeAgo(n.created_at)}</span>
                          <span style={{ fontSize: 13, color: TEXT }}>{n.note}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })}

        {businesses.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 24px", color: MUTED, fontSize: 14 }}>
            No businesses yet. Click "+ New Client" to add one.
          </div>
        )}
      </main>

      {/* ── New Client modal ────────────────────────────────────────────────── */}
      {showNewClient && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}
             onClick={(e) => e.target === e.currentTarget && setShowNewClient(false)}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, maxWidth: 460, width: "100%" }}>
            <h2 style={{ margin: "0 0 20px", fontWeight: 900, fontSize: 18 }}>New Client</h2>
            {newClientError && <p style={{ color: RED, fontSize: 13, margin: "0 0 12px" }}>{newClientError}</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Business Name *", key: "name",     placeholder: "Snelling Cafe",    type: "text"     },
                { label: "Slug *",          key: "slug",     placeholder: "snelling-cafe",     type: "text"     },
                { label: "Owner Email *",   key: "email",    placeholder: "owner@email.com",   type: "email"    },
                { label: "Password *",      key: "password", placeholder: "Temp password",     type: "password" },
                { label: "Staff PIN",       key: "pin",      placeholder: "1234",              type: "text"     },
              ].map((f) => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const, display: "block", marginBottom: 5 }}>{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(newClient as any)[f.key]}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewClient((prev) => {
                        const next = { ...prev, [f.key]: val };
                        if (f.key === "name") next.slug = slugify(val);
                        return next;
                      });
                    }}
                    style={{ width: "100%", background: INNER, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "10px 12px", color: TEXT, fontSize: 14, outline: "none", boxSizing: "border-box" as const }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const, display: "block", marginBottom: 5 }}>Business Type</label>
                <select value={newClient.type} onChange={(e) => setNewClient((p) => ({ ...p, type: e.target.value }))}
                  style={{ width: "100%", background: INNER, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "10px 12px", color: TEXT, fontSize: 14, outline: "none", cursor: "pointer" }}>
                  {BIZ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={createClient} disabled={creatingClient}
                style={{ flex: 1, background: creatingClient ? BORDER : ACCENT, color: BG, border: "none", borderRadius: 8, padding: "12px", fontWeight: 800, fontSize: 14, cursor: creatingClient ? "not-allowed" : "pointer" }}>
                {creatingClient ? "Creating…" : "Create Client"}
              </button>
              <button onClick={() => { setShowNewClient(false); setNewClientError(""); }}
                style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 20px", color: MUTED, fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
