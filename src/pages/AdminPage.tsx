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
type TableLoc  = { id: string; name: string; label: string | null };

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
  const [showHelp,         setShowHelp]         = useState(false);

  // Per-business table QR panel
  const [tablesByBiz, setTablesByBiz] = useState<Record<string, TableLoc[]>>({});
  const [tableQrs,    setTableQrs]    = useState<Record<string, string>>({});  // `${bizId}:${locId}`
  const [expandedQr,  setExpandedQr]  = useState<Set<string>>(new Set());
  const [loadingQr,   setLoadingQr]   = useState<string | null>(null);
  const [zipping,     setZipping]     = useState<string | null>(null);
  const [printingQr,  setPrintingQr]  = useState<string | null>(null);

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

  async function toggleQrPanel(biz: AdminBiz) {
    // Toggle if already loaded
    if (tablesByBiz[biz.id]) {
      setExpandedQr((prev) => {
        const next = new Set(prev);
        next.has(biz.id) ? next.delete(biz.id) : next.add(biz.id);
        return next;
      });
      return;
    }
    setLoadingQr(biz.id);

    const { data } = await supabase
      .from("locations")
      .select("id, name, label")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .order("name");

    const locs = (data ?? []) as TableLoc[];
    setTablesByBiz((prev) => ({ ...prev, [biz.id]: locs }));

    // Generate a QR per table pointing to /scan/{slug}?table={locId}
    const entries = await Promise.all(
      locs.map(async (loc) => {
        const url = `${APP_URL}/scan/${biz.slug}?table=${loc.id}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 200, margin: 1,
          color: { dark: "#E8C547", light: "#111111" },
        });
        return [`${biz.id}:${loc.id}`, dataUrl] as [string, string];
      })
    );
    setTableQrs((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    setExpandedQr((prev) => new Set([...prev, biz.id]));
    setLoadingQr(null);
  }

  function downloadSingleQr(dataUrl: string, label: string, slug: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${slug}-${label.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  }

  async function downloadAllQrs(biz: AdminBiz) {
    const locs = tablesByBiz[biz.id] ?? [];
    if (!locs.length) return;
    setZipping(biz.id);
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const loc of locs) {
      const dataUrl = tableQrs[`${biz.id}:${loc.id}`];
      if (!dataUrl) continue;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const name = (loc.label || loc.name).replace(/\s+/g, "-").toLowerCase();
      zip.file(`qr-${biz.slug}-${name}.png`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-codes-${biz.slug}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setZipping(null);
  }

  async function printAllQrs(biz: AdminBiz) {
    setPrintingQr(biz.id);

    // Load tables lazily
    let locs = tablesByBiz[biz.id];
    if (!locs) {
      const { data } = await supabase
        .from("locations")
        .select("id, name, label")
        .eq("business_id", biz.id)
        .eq("is_active", true)
        .order("name");
      locs = (data ?? []) as TableLoc[];
      setTablesByBiz((prev) => ({ ...prev, [biz.id]: locs }));
    }
    if (!locs.length) { setPrintingQr(null); return; }

    // High-res branded QRs: gold on dark, scale=10
    const entries = await Promise.all(
      locs.map(async (loc) => {
        const url     = `${APP_URL}/scan/${biz.slug}?table=${loc.id}`;
        const dataUrl = await QRCode.toDataURL(url, {
          scale: 10, margin: 1,
          color: { dark: "#E8C547", light: "#080808" },
        });
        return { loc, dataUrl, url };
      })
    );

    // ── jsPDF setup ──────────────────────────────────────────────────────
    // FedEx Office Quick Postcard: 4×6" + 0.125" bleed on all sides
    // CMYK-equivalent colours used for DeviceRGB output (standard PDF)
    //   #080808 → CMYK(0,0,0,97)   #E8C547 → CMYK(0,15,69,9)
    //   #F0EDE8 → CMYK(0,2,3,6)
    const { jsPDF } = await import("jspdf");

    const BLEED  = 0.125;
    const W      = 4 + BLEED * 2;   // 4.25"
    const H      = 6 + BLEED * 2;   // 6.25"
    const PAD    = BLEED + 0.18;     // safe-area left/right padding
    const CX     = W / 2;           // horizontal centre

    // Brand colours as [r,g,b]
    const GOLD   = [232, 197,  71] as const;
    const DARK   = [  8,   8,   8] as const;
    const LIGHT  = [240, 237, 232] as const;
    const MUTED  = [110, 105,  88] as const;
    const FGOLD  = [ 80,  68,  18] as const; // faded gold for back

    const doc = new jsPDF({ orientation: "portrait", unit: "in", format: [W, H] });

    // ── Drawing helpers ──────────────────────────────────────────────────

    /** Draw one QR finder pattern square */
    function finder(x: number, y: number, s: number) {
      const brd = s * 0.143;
      const cSz = s * 0.286;
      const r   = s * 0.15;
      doc.setFillColor(...GOLD);
      doc.roundedRect(x, y, s, s, r, r, "F");
      doc.setFillColor(...DARK);
      doc.roundedRect(x + brd, y + brd, s - 2*brd, s - 2*brd, r*0.5, r*0.5, "F");
      doc.setFillColor(...GOLD);
      doc.roundedRect(x + s*0.357, y + s*0.357, cSz, cSz, r*0.3, r*0.3, "F");
    }

    /** Draw QR mark (3 finder patterns) */
    function qrMark(x: number, y: number, s: number) {
      const gap = s * 0.22;
      finder(x, y, s);                      // TL
      finder(x + s + gap, y, s);            // TR
      finder(x, y + s + gap, s);            // BL
      // A couple of data dots
      const dot = s * 0.22;
      doc.setFillColor(...GOLD);
      doc.roundedRect(x + s + gap, y + s + gap, dot, dot, dot*0.2, dot*0.2, "F");
    }

    /** Crop marks at all four corners */
    function cropMarks() {
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.004);
      const mk = 0.08;
      const corners = [
        { hx1: 0,      hy: BLEED,   vx: BLEED,   vy1: 0,      dir: 1  },
        { hx1: W-mk,   hy: BLEED,   vx: W-BLEED, vy1: 0,      dir: 1  },
        { hx1: 0,      hy: H-BLEED, vx: BLEED,   vy1: H-mk,   dir: -1 },
        { hx1: W-mk,   hy: H-BLEED, vx: W-BLEED, vy1: H-mk,   dir: -1 },
      ];
      for (const c of corners) {
        doc.line(c.hx1, c.hy, c.hx1 + mk, c.hy);
        doc.line(c.vx,  c.vy1, c.vx, c.vy1 + mk);
      }
    }

    // ── Front page ───────────────────────────────────────────────────────
    function drawFront(entry: { loc: TableLoc; dataUrl: string }) {
      const label = entry.loc.label ?? entry.loc.name;

      // Full-bleed background
      doc.setFillColor(...DARK);
      doc.rect(0, 0, W, H, "F");

      // ── Logo row ──────────────────────────────────────────────────────
      const logoY = PAD;
      const fSz   = 0.115;
      qrMark(PAD, logoY, fSz);
      const markW = fSz * 2 + fSz * 0.22;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LIGHT);
      doc.text("QR-Wegn", PAD + markW + 0.06, logoY + fSz * 1.45);

      // ── Thin gold rule ─────────────────────────────────────────────────
      const ruleY = logoY + fSz * 2 + fSz * 0.22 + 0.1;
      doc.setDrawColor(...FGOLD);
      doc.setLineWidth(0.006);
      doc.line(PAD, ruleY, W - PAD, ruleY);

      // ── Restaurant name ────────────────────────────────────────────────
      const nameY = ruleY + 0.3;
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LIGHT);
      doc.text(biz.name, CX, nameY, { align: "center", maxWidth: W - PAD * 2 });

      // ── QR code ────────────────────────────────────────────────────────
      const qrSz  = 2.1;
      const qrX   = (W - qrSz) / 2;
      const qrY   = nameY + 0.22;
      doc.addImage(entry.dataUrl, "PNG", qrX, qrY, qrSz, qrSz);

      // ── CTA text ───────────────────────────────────────────────────────
      const ctaY = qrY + qrSz + 0.18;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("Scan to order — No app required", CX, ctaY, { align: "center" });

      // ── Table pill ─────────────────────────────────────────────────────
      const pillLabel = label.toUpperCase();
      const pillH     = 0.19;
      const pillY     = H - BLEED - 0.22;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      const pillW = doc.getTextWidth(pillLabel) + 0.22;
      doc.setFillColor(...GOLD);
      doc.roundedRect(CX - pillW/2, pillY - pillH + 0.04, pillW, pillH, pillH/2, pillH/2, "F");
      doc.text(pillLabel, CX, pillY, { align: "center" });

      cropMarks();
    }

    // ── Back page ────────────────────────────────────────────────────────
    function drawBack(entry: { loc: TableLoc; url: string }) {
      // Full-bleed background
      doc.setFillColor(...DARK);
      doc.rect(0, 0, W, H, "F");

      // Vertical gold accent bar (left of centre)
      doc.setFillColor(...GOLD);
      doc.rect(PAD, BLEED + 0.5, 0.018, H - BLEED*2 - 1.0, "F");

      // ── Tagline ────────────────────────────────────────────────────────
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...FGOLD);
      doc.text("SCAN · ORDER · ENJOY", CX, H*0.37, { align: "center", charSpace: 2.5 });

      // ── Restaurant name ────────────────────────────────────────────────
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LIGHT);
      doc.text(biz.name, CX, H*0.50, { align: "center", maxWidth: W - PAD * 2 });

      // ── Scan URL ───────────────────────────────────────────────────────
      doc.setFontSize(7.5);
      doc.setFont("courier", "normal");
      doc.setTextColor(...GOLD);
      doc.text(entry.url, CX, H*0.61, { align: "center", maxWidth: W - PAD * 2 });

      // ── Powered by ─────────────────────────────────────────────────────
      const pwY  = H - BLEED - 0.22;
      const pfSz = 0.07;
      const mkW  = pfSz * 2 + pfSz * 0.22;
      qrMark(CX - mkW/2 - 0.28, pwY - pfSz * 2.4, pfSz);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(68, 64, 50);
      doc.text("Powered by QR-Wegn", CX + 0.06, pwY, { align: "center" });

      cropMarks();
    }

    // ── Build pages (Front + Back per table) ─────────────────────────────
    for (let i = 0; i < entries.length; i++) {
      if (i > 0) doc.addPage();
      drawFront(entries[i]);
      doc.addPage();
      drawBack(entries[i]);
    }

    // ── Output: autoPrint + open in new tab ───────────────────────────────
    // autoPrint embeds a JS action so the PDF viewer shows the print dialog.
    (doc as any).autoPrint();
    const pdfBlob = doc.output("blob");
    const pdfUrl  = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, "_blank");
    // Revoke after 2 min — long enough for the new tab to load the PDF
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 120_000);

    setPrintingQr(null);
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
              onClick={() => setShowHelp(true)}
              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 16px", color: MUTED, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              ? Help
            </button>
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

              {/* ── Table QR panel ─────────────────────────────────────── */}
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: "14px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => toggleQrPanel(biz)}
                      disabled={loadingQr === biz.id}
                      style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      {loadingQr === biz.id ? "Loading…" : expandedQr.has(biz.id) ? "▲ Hide QR Codes" : `▼ Show QR Codes (${biz.location_count} tables)`}
                    </button>
                    <button
                      onClick={() => printAllQrs(biz)}
                      disabled={printingQr === biz.id}
                      style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: TEXT, fontSize: 12, fontWeight: 700, cursor: printingQr === biz.id ? "not-allowed" : "pointer" }}
                    >
                      {printingQr === biz.id ? "Preparing…" : "🖨 Print All QRs"}
                    </button>
                  </div>
                  {expandedQr.has(biz.id) && (tablesByBiz[biz.id]?.length ?? 0) > 0 && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => printAllQrs(biz)}
                        disabled={printingQr === biz.id}
                        style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: TEXT, fontSize: 12, fontWeight: 700, cursor: printingQr === biz.id ? "not-allowed" : "pointer" }}
                      >
                        {printingQr === biz.id ? "Preparing…" : "🖨 Print All QRs"}
                      </button>
                      <button
                        onClick={() => downloadAllQrs(biz)}
                        disabled={zipping === biz.id}
                        style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: zipping === biz.id ? "not-allowed" : "pointer" }}
                      >
                        {zipping === biz.id ? "Zipping…" : `⬇ Download All (${tablesByBiz[biz.id]?.length})`}
                      </button>
                    </div>
                  )}
                </div>

                {expandedQr.has(biz.id) && tablesByBiz[biz.id] && (
                  <div style={{ marginTop: 16 }}>
                    {tablesByBiz[biz.id].length === 0 ? (
                      <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>No active tables found. Add tables in the owner dashboard first.</p>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
                        {tablesByBiz[biz.id].map((loc) => {
                          const qrKey  = `${biz.id}:${loc.id}`;
                          const qrData = tableQrs[qrKey];
                          const label  = loc.label || loc.name;
                          return (
                            <div key={loc.id} style={{ background: INNER, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px", textAlign: "center" }}>
                              {qrData
                                ? <img src={qrData} alt={label} width={120} height={120} style={{ display: "block", margin: "0 auto 10px", borderRadius: 6 }} />
                                : <div style={{ width: 120, height: 120, background: BORDER, borderRadius: 6, margin: "0 auto 10px" }} />
                              }
                              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>{label}</div>
                              <button
                                onClick={() => qrData && downloadSingleQr(qrData, label, biz.slug)}
                                disabled={!qrData}
                                style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 12px", color: MUTED, fontSize: 11, fontWeight: 700, cursor: qrData ? "pointer" : "not-allowed", width: "100%" }}
                              >
                                ⬇ Download
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
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

      {/* ── Help modal ──────────────────────────────────────────────────────── */}
      {showHelp && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 50, padding: "40px 20px", overflowY: "auto" }}
          onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}
        >
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "32px 36px", maxWidth: 680, width: "100%", position: "relative" }}>
            <button onClick={() => setShowHelp(false)}
              style={{ position: "absolute", top: 18, right: 18, background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
              ✕
            </button>

            <p style={{ fontSize: 10, letterSpacing: 3, color: ACCENT, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>Operations Guide</p>
            <h2 style={{ margin: "0 0 28px", fontWeight: 900, fontSize: 22 }}>QR-Wegn Admin Panel</h2>

            {([
              {
                title: "Platform Overview",
                body: [
                  "QR-Wegn is a QR-ordering platform for hospitality businesses. Each business gets a QR code per table — customers scan it, browse the menu, and place orders without an app.",
                  `Production URL: ${APP_URL}`,
                  "Stack: React + Vite frontend on Vercel, Supabase (Postgres + Auth + RLS), Stripe for billing.",
                ],
              },
              {
                title: "Key URLs",
                body: [
                  `${APP_URL}/                    — Landing page`,
                  `${APP_URL}/scan/{slug}         — Customer menu (e.g. /scan/snelling-cafe)`,
                  `${APP_URL}/staff-login         — Staff kitchen view login`,
                  `${APP_URL}/dashboard           — Owner business dashboard`,
                  `${APP_URL}/admin               — This page (super-admin only)`,
                  `${APP_URL}/scan/demo-restaurant — Demo customer view`,
                ],
              },
              {
                title: "Onboarding a New Client",
                body: [
                  "1. Click '+ New Client' → enter business name (slug auto-fills), owner email, a temp password, and a staff PIN.",
                  "2. The account is created and the business is provisioned instantly.",
                  "3. Send the owner their login link: " + APP_URL + "/login",
                  "4. Walk them through adding tables (Tables tab) and menu items (Menu tab) in their dashboard.",
                  "5. Download or share the QR code from the Deploy Kit below their card — they print one per table.",
                  "6. Tick 'QR printed' and 'Staff trained' in the Deployment Checklist when done.",
                  "7. Log the milestone in Communication Log: 'Went live 🚀'.",
                ],
              },
              {
                title: "Using the Admin Panel",
                body: [
                  "Deployment Status badge — auto-calculated: Not Started (no tables/menu) → In Progress (tables + menu, no orders yet) → Live (first order received).",
                  "Deploy Kit — three rows per business: (1) scan page link + QR download, (2) pre-filled staff login link with slug & PIN, (3) owner dashboard magic link.",
                  "Deployment Checklist — first 3 items are automatic; 'QR printed' and 'Staff trained' are manual toggles you click when confirmed.",
                  "Communication Log — use quick-note buttons or type a free-form entry. All notes are timestamped and stored per business.",
                  "Staff PIN Reset — type a new PIN and click Update. Takes effect immediately for kitchen staff.",
                  "Owner Dashboard ↗ — generates a one-time magic link that signs you in as that owner. Opens in a new tab. Use incognito to avoid signing out of your admin session.",
                ],
              },
              {
                title: "Troubleshooting Common Issues",
                body: [
                  "Scan page shows 'Restaurant not found' — check the business slug matches exactly what's in the URL. Verify the business exists in this panel.",
                  "Staff can't log in — confirm the slug and PIN match what's shown in Deploy Kit. Use the pre-filled staff login link to bypass typos.",
                  "Owner dashboard blank after login — the auth state needs a moment to resolve on mobile. Have them wait 2–3 seconds or hard-refresh.",
                  "Orders not appearing in kitchen — confirm the staff is viewing the right business slug. Kitchen view only shows 'new' and 'preparing' statuses.",
                  "Revenue shows $0 — Financials tab counts all non-cancelled orders. If all orders are cancelled or still 'new', revenue will be zero.",
                  "Can't create a new client — slug must be unique across all businesses. Try a more specific slug (e.g. snelling-cafe-mpls).",
                  "Magic link expired — magic links expire after 1 hour. Click 'Dashboard ↗' again to generate a fresh one.",
                ],
              },
            ] as { title: string; body: string[] }[]).map((section) => (
              <div key={section.title} style={{ marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
                  {section.title}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {section.body.map((line, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 13, color: line.startsWith(APP_URL) || line.match(/^https?:\/\//) ? MUTED : TEXT, lineHeight: 1.6, fontFamily: line.startsWith(APP_URL) ? "monospace" : "sans-serif" }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={() => setShowHelp(false)}
              style={{ marginTop: 8, background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "11px 28px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              Got it
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
