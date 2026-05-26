import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { ACCENT, BG, BORDER, MUTED, SURFACE, TEXT, GREEN, RED } from "../constants/theme";

// ── Constants ─────────────────────────────────────────────
const SLOT_H       = 48;
const DAY_START    = 8;
const DAY_END      = 21;
const TOTAL_SLOTS  = (DAY_END - DAY_START) * 2;
const TOTAL_H      = TOTAL_SLOTS * SLOT_H;

const APPT_COLOR: Record<string, string> = {
  booked:    "#E8C547",
  confirmed: "#4CAF50",
  done:      "#888888",
  cancelled: "#f44336",
  no_show:   "#F97316",
};
const APPT_STATUSES = ["booked", "confirmed", "done", "cancelled", "no_show"] as const;
const DURATIONS     = [15, 30, 45, 60, 90, 120];
const WEEKDAYS      = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS        = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];

// ── Types ─────────────────────────────────────────────────
type Appointment = {
  id: string; business_id: string; location_id: string | null;
  client_name: string; client_phone: string | null;
  service_id: string | null; service_name: string | null;
  start_time: string; end_time: string;
  status: string; notes: string | null;
};
type BlockedTime = {
  id: string; location_id: string | null;
  start_time: string; end_time: string; reason: string | null;
};
type Location = { id: string; name: string; label: string | null; is_active: boolean };
type MenuItem  = { id: string; name: string; price: number; category_id: string; description: string | null; is_available: boolean; image_url: string | null };
type Business  = { id: string; [key: string]: unknown };

// ── Helpers ───────────────────────────────────────────────
function getMonday(d: Date): Date {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m    = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function fmt(d: Date): string { return d.toISOString().slice(0, 10); }

function minToPx(absMin: number): number {
  return ((absMin - DAY_START * 60) / 30) * SLOT_H;
}
function durPx(startMin: number, endMin: number): number {
  return ((endMin - startMin) / 30) * SLOT_H;
}
function apptDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

// ── Default form values ───────────────────────────────────
const E_APPT  = { client_name: "", client_phone: "", location_id: "", service_id: "", date: "", start_time: "09:00", duration: "60", notes: "", status: "booked" };
const E_BLOCK = { location_id: "", date: "", start_time: "09:00", end_time: "10:00", reason: "" };

// ── Shared style shortcuts ────────────────────────────────
const inp: React.CSSProperties = {
  background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: "10px 14px", color: TEXT, fontSize: 14, outline: "none",
  width: "100%", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1,
  textTransform: "uppercase", marginBottom: 4, display: "block",
};
const modalOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 200, padding: 20,
};
const modalBox: React.CSSProperties = {
  background: "#111", border: `1px solid ${BORDER}`, borderRadius: 12,
  padding: "28px 32px", width: "100%", maxWidth: 480,
  display: "flex", flexDirection: "column", gap: 18,
  maxHeight: "90vh", overflowY: "auto",
};

// ── Component ─────────────────────────────────────────────
export function AppointmentCalendar({
  business, locations, menuItems,
}: {
  business: Business;
  locations: Location[];
  menuItems: MenuItem[];
}) {
  const [view,       setView]       = useState<"week" | "month">("week");
  const [weekStart,  setWeekStart]  = useState<Date>(() => getMonday(new Date()));
  const [monthDate,  setMonthDate]  = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });

  const [appointments,  setAppointments]  = useState<Appointment[]>([]);
  const [blockedTimes,  setBlockedTimes]  = useState<BlockedTime[]>([]);
  const [calLoading,    setCalLoading]    = useState(false);

  const [showAddAppt,   setShowAddAppt]   = useState(false);
  const [apptForm,      setApptForm]      = useState(E_APPT);
  const [apptError,     setApptError]     = useState("");
  const [apptSaving,    setApptSaving]    = useState(false);

  const [showBlock,     setShowBlock]     = useState(false);
  const [blockForm,     setBlockForm]     = useState(E_BLOCK);
  const [blockError,    setBlockError]    = useState("");
  const [blockSaving,   setBlockSaving]   = useState(false);

  const [selectedAppt,  setSelectedAppt]  = useState<Appointment | null>(null);
  const [statusSaving,  setStatusSaving]  = useState(false);

  // ── Data loading ─────────────────────────────────────────
  const loadRange = useCallback(async (from: string, to: string) => {
    setCalLoading(true);
    const [aRes, bRes] = await Promise.all([
      supabase.from("appointments")
        .select("id,business_id,location_id,client_name,client_phone,service_id,service_name,start_time,end_time,status,notes")
        .eq("business_id", business.id as string)
        .gte("start_time", from).lte("start_time", to)
        .order("start_time"),
      supabase.from("blocked_times")
        .select("id,location_id,start_time,end_time,reason")
        .eq("business_id", business.id as string)
        .gte("start_time", from).lte("start_time", to)
        .order("start_time"),
    ]);
    if (aRes.data) setAppointments(aRes.data as Appointment[]);
    if (bRes.data) setBlockedTimes(bRes.data as BlockedTime[]);
    setCalLoading(false);
  }, [business.id]);

  useEffect(() => {
    if (view === "week") {
      loadRange(`${fmt(weekStart)}T00:00:00`, `${fmt(addDays(weekStart, 6))}T23:59:59`);
    } else {
      const y = monthDate.getFullYear(), m = monthDate.getMonth();
      loadRange(
        `${new Date(y, m, 1).toISOString().slice(0, 10)}T00:00:00`,
        `${new Date(y, m + 1, 0).toISOString().slice(0, 10)}T23:59:59`,
      );
    }
  }, [view, weekStart, monthDate, loadRange]);

  // ── Mutations ─────────────────────────────────────────────
  async function saveAppt(e: React.FormEvent) {
    e.preventDefault();
    setApptError(""); setApptSaving(true);
    const start = new Date(`${apptForm.date}T${apptForm.start_time}`);
    const end   = new Date(start.getTime() + parseInt(apptForm.duration) * 60000);
    const svc   = menuItems.find(m => m.id === apptForm.service_id);
    const { data, error } = await supabase.from("appointments").insert({
      business_id:  business.id,
      location_id:  apptForm.location_id  || null,
      client_name:  apptForm.client_name.trim(),
      client_phone: apptForm.client_phone.trim() || null,
      service_id:   apptForm.service_id   || null,
      service_name: svc?.name             || null,
      start_time:   start.toISOString(),
      end_time:     end.toISOString(),
      status:       apptForm.status,
      notes:        apptForm.notes.trim() || null,
    }).select("id,business_id,location_id,client_name,client_phone,service_id,service_name,start_time,end_time,status,notes").single();
    if (error) { setApptError(error.message); setApptSaving(false); return; }
    setAppointments(p => [...p, data as Appointment]);
    setShowAddAppt(false); setApptForm(E_APPT); setApptSaving(false);
  }

  async function saveBlock(e: React.FormEvent) {
    e.preventDefault();
    setBlockError(""); setBlockSaving(true);
    const start = new Date(`${blockForm.date}T${blockForm.start_time}`);
    const end   = new Date(`${blockForm.date}T${blockForm.end_time}`);
    if (end <= start) { setBlockError("End time must be after start time."); setBlockSaving(false); return; }

    let rows: object[];
    if (blockForm.location_id === "all") {
      rows = locations.map(l => ({ business_id: business.id, location_id: l.id, start_time: start.toISOString(), end_time: end.toISOString(), reason: blockForm.reason.trim() || null }));
    } else {
      rows = [{ business_id: business.id, location_id: blockForm.location_id || null, start_time: start.toISOString(), end_time: end.toISOString(), reason: blockForm.reason.trim() || null }];
    }

    const { data, error } = await supabase.from("blocked_times").insert(rows).select("id,location_id,start_time,end_time,reason");
    if (error) { setBlockError(error.message); setBlockSaving(false); return; }
    setBlockedTimes(p => [...p, ...(data as BlockedTime[])]);
    setShowBlock(false); setBlockForm(E_BLOCK); setBlockSaving(false);
  }

  async function deleteBlock(id: string) {
    await supabase.from("blocked_times").delete().eq("id", id);
    setBlockedTimes(p => p.filter(b => b.id !== id));
  }

  async function updateStatus(id: string, status: string) {
    setStatusSaving(true);
    await supabase.from("appointments").update({ status }).eq("id", id);
    setAppointments(p => p.map(a => a.id === id ? { ...a, status } : a));
    setSelectedAppt(p => p ? { ...p, status } : p);
    setStatusSaving(false);
  }

  async function deleteAppt(id: string) {
    if (!window.confirm("Delete this appointment?")) return;
    await supabase.from("appointments").delete().eq("id", id);
    setAppointments(p => p.filter(a => a.id !== id));
    setSelectedAppt(null);
  }

  function openAddAppt(date?: string, time?: string, locId?: string) {
    setApptForm({
      ...E_APPT,
      date:        date  || fmt(new Date()),
      start_time:  time  || "09:00",
      location_id: locId || locations[0]?.id || "",
    });
    setApptError("");
    setShowAddAppt(true);
  }

  // ── Month View ────────────────────────────────────────────
  function renderMonth() {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const firstWeekday = new Date(y, m, 1).getDay();
    const offset       = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const daysInMonth  = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [...Array(offset).fill(null)];
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const todayStr = fmt(new Date());

    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
          {WEEKDAYS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1, padding: "6px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ minHeight: 72 }} />;
            const dateStr  = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayAppts = appointments.filter(a => apptDateStr(a.start_time) === dateStr);
            const hasBlock = blockedTimes.some(b => apptDateStr(b.start_time) === dateStr);
            const isToday  = dateStr === todayStr;
            return (
              <div key={i} onClick={() => { setView("week"); setWeekStart(getMonday(new Date(`${dateStr}T12:00:00`))); }}
                style={{ background: isToday ? ACCENT + "15" : SURFACE, border: `1px solid ${isToday ? ACCENT + "66" : BORDER}`, borderRadius: 8, padding: "7px 9px", minHeight: 72, cursor: "pointer", position: "relative", transition: "border-color 0.15s" }}>
                {hasBlock && (
                  <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(255,0,0,0.04) 5px,rgba(255,0,0,0.04) 10px)", borderRadius: 7, pointerEvents: "none" }} />
                )}
                <div style={{ fontSize: 13, fontWeight: isToday ? 900 : 600, color: isToday ? ACCENT : TEXT, marginBottom: 5 }}>{day}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {dayAppts.slice(0, 8).map(a => (
                    <div key={a.id} style={{ width: 8, height: 8, borderRadius: "50%", background: APPT_COLOR[a.status] ?? MUTED, flexShrink: 0 }} title={a.client_name} />
                  ))}
                  {dayAppts.length > 8 && <span style={{ fontSize: 9, color: MUTED }}>+{dayAppts.length - 8}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Week View ─────────────────────────────────────────────
  function renderWeek() {
    const days    = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const todayStr = fmt(new Date());

    const timeSlots: { label: string; absMin: number }[] = [];
    for (let h = DAY_START; h < DAY_END; h++) {
      timeSlots.push({ label: `${h}:00`,  absMin: h * 60 });
      timeSlots.push({ label: `${h}:30`,  absMin: h * 60 + 30 });
    }

    return (
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", background: SURFACE }}>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: SURFACE, zIndex: 10 }}>
          <div />
          {days.map(day => {
            const dateStr = fmt(day);
            const isToday = dateStr === todayStr;
            const count   = appointments.filter(a => apptDateStr(a.start_time) === dateStr).length;
            return (
              <div key={dateStr} style={{ padding: "10px 6px", textAlign: "center", borderLeft: `1px solid ${BORDER}`, background: isToday ? ACCENT + "08" : "transparent" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: isToday ? ACCENT : MUTED }}>
                  {day.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isToday ? ACCENT : TEXT, lineHeight: 1.2 }}>
                  {day.getDate()}
                </div>
                {count > 0 && (
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{count} appt{count !== 1 ? "s" : ""}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Scrollable time grid */}
        <div style={{ overflowY: "auto", maxHeight: 620 }}>
          <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", height: TOTAL_H, position: "relative" }}>

            {/* Time labels column */}
            <div style={{ position: "relative" }}>
              {timeSlots.map((slot, i) => (
                <div key={i} style={{ position: "absolute", top: i * SLOT_H, right: 0, left: 0, height: SLOT_H, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 3 }}>
                  {slot.label.endsWith(":00") && (
                    <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", lineHeight: 1 }}>
                      {slot.label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const dateStr  = fmt(day);
              const dayAppts = appointments.filter(a => apptDateStr(a.start_time) === dateStr);
              const dayBlocks = blockedTimes.filter(b => apptDateStr(b.start_time) === dateStr);

              return (
                <div key={dateStr} style={{ borderLeft: `1px solid ${BORDER}`, position: "relative", height: TOTAL_H }}>

                  {/* Clickable slot lines */}
                  {timeSlots.map((slot, i) => (
                    <div key={i}
                      onClick={() => {
                        const h = Math.floor(slot.absMin / 60);
                        const min = slot.absMin % 60;
                        openAddAppt(dateStr, `${h}:${String(min).padStart(2, "0")}`, locations[0]?.id || "");
                      }}
                      style={{
                        position: "absolute", top: i * SLOT_H, left: 0, right: 0, height: SLOT_H,
                        borderTop: `1px solid ${i % 2 === 0 ? BORDER : "rgba(255,255,255,0.03)"}`,
                        cursor: "cell",
                      }}
                    />
                  ))}

                  {/* Blocked times */}
                  {dayBlocks.map(b => {
                    const s    = new Date(b.start_time);
                    const e    = new Date(b.end_time);
                    const sMin = s.getHours() * 60 + s.getMinutes();
                    const eMin = e.getHours() * 60 + e.getMinutes();
                    const top  = minToPx(sMin);
                    const h    = durPx(sMin, eMin);
                    if (h <= 0) return null;
                    return (
                      <div key={b.id}
                        title={b.reason ? `Blocked: ${b.reason}` : "Blocked — click to remove"}
                        onClick={ev => { ev.stopPropagation(); if (window.confirm(`Remove block${b.reason ? `: "${b.reason}"` : ""}?`)) deleteBlock(b.id); }}
                        style={{
                          position: "absolute", top: Math.max(0, top), left: 2, right: 2,
                          height: Math.max(h, 16), zIndex: 2, cursor: "pointer", overflow: "hidden",
                          background: "repeating-linear-gradient(45deg, rgba(255,0,0,0.09), rgba(255,0,0,0.09) 6px, rgba(255,0,0,0.04) 6px, rgba(255,0,0,0.04) 12px)",
                          border: `1px solid ${RED}44`, borderRadius: 5, padding: "2px 5px",
                        }}>
                        <span style={{ fontSize: 9, color: RED + "cc", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {b.reason || "Blocked"}
                          {b.location_id && ` · ${locations.find(l => l.id === b.location_id)?.name ?? ""}`}
                        </span>
                      </div>
                    );
                  })}

                  {/* Appointments */}
                  {dayAppts.map(a => {
                    const s     = new Date(a.start_time);
                    const e     = new Date(a.end_time);
                    const sMin  = s.getHours() * 60 + s.getMinutes();
                    const eMin  = e.getHours() * 60 + e.getMinutes();
                    const top   = minToPx(sMin);
                    const h     = durPx(sMin, eMin);
                    const color = APPT_COLOR[a.status] ?? MUTED;
                    const chair = locations.find(l => l.id === a.location_id);
                    if (h <= 0) return null;
                    return (
                      <div key={a.id}
                        onClick={ev => { ev.stopPropagation(); setSelectedAppt(a); }}
                        style={{
                          position: "absolute", top: Math.max(0, top), left: 4, right: 4,
                          height: Math.max(h, 24), zIndex: 3, cursor: "pointer", overflow: "hidden",
                          background: color + "20", border: `1.5px solid ${color}88`, borderRadius: 5,
                          padding: "3px 6px",
                        }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.client_name}
                        </div>
                        {h > 34 && (
                          <div style={{ fontSize: 10, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.service_name || chair?.name || ""}
                          </div>
                        )}
                        {h > 50 && (
                          <div style={{ fontSize: 9, color: MUTED }}>
                            {s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Nav helpers ───────────────────────────────────────────
  function prevPeriod() {
    if (view === "week") setWeekStart(d => addDays(d, -7));
    else setMonthDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; });
  }
  function nextPeriod() {
    if (view === "week") setWeekStart(d => addDays(d, 7));
    else setMonthDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; });
  }
  function goToday() {
    const t = new Date();
    setWeekStart(getMonday(t));
    setMonthDate(new Date(t.getFullYear(), t.getMonth(), 1));
  }

  const periodLabel = view === "week"
    ? `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  const navBtn: React.CSSProperties = { background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", color: MUTED, cursor: "pointer", fontSize: 14, lineHeight: 1 };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* View toggle */}
        <div style={{ display: "flex", background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3, gap: 2 }}>
          {(["week", "month"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? SURFACE : "none", border: "none", borderRadius: 6, padding: "5px 14px", color: view === v ? TEXT : MUTED, fontWeight: view === v ? 700 : 400, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
          ))}
        </div>

        {/* Navigation */}
        <button onClick={prevPeriod} style={navBtn}>←</button>
        <span style={{ fontWeight: 800, fontSize: 14, color: TEXT, minWidth: 170, textAlign: "center" }}>{periodLabel}</span>
        <button onClick={nextPeriod} style={navBtn}>→</button>
        <button onClick={goToday} style={{ ...navBtn, fontSize: 12, padding: "6px 14px" }}>Today</button>

        <div style={{ flex: 1 }} />
        {calLoading && <span style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>Loading…</span>}

        <button onClick={() => { setShowBlock(true); setBlockForm({ ...E_BLOCK, date: fmt(view === "week" ? weekStart : monthDate) }); }}
          style={{ background: "none", border: `1px solid ${RED}55`, borderRadius: 8, padding: "8px 16px", color: RED, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Block time
        </button>
        <button onClick={() => openAddAppt()}
          style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          + Add appointment
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {Object.entries(APPT_COLOR).map(([s, c]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ fontSize: 11, color: MUTED, textTransform: "capitalize" }}>{s.replace("_", " ")}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 14, height: 8, borderRadius: 2, background: "repeating-linear-gradient(45deg,rgba(255,0,0,0.2),rgba(255,0,0,0.2) 3px,rgba(0,0,0,0) 3px,rgba(0,0,0,0) 6px)", border: `1px solid ${RED}44` }} />
          <span style={{ fontSize: 11, color: MUTED }}>Blocked</span>
        </div>
      </div>

      {/* Calendar body */}
      {view === "month" ? renderMonth() : renderWeek()}

      {/* ── Add Appointment Modal ─────────────────────────── */}
      {showAddAppt && (
        <div style={modalOverlay} onClick={() => setShowAddAppt(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: TEXT, margin: 0 }}>New Appointment</p>
              <button onClick={() => setShowAddAppt(false)} style={{ background: "none", border: "none", color: MUTED, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <form onSubmit={saveAppt} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Client name *</label>
                <input required autoFocus placeholder="e.g. John Smith" value={apptForm.client_name}
                  onChange={e => setApptForm(f => ({ ...f, client_name: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Phone</label>
                <input placeholder="+1 555 0100" value={apptForm.client_phone}
                  onChange={e => setApptForm(f => ({ ...f, client_phone: e.target.value }))} style={inp} />
              </div>
              {locations.length > 0 && (
                <div>
                  <label style={lbl}>Chair</label>
                  <select value={apptForm.location_id} onChange={e => setApptForm(f => ({ ...f, location_id: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                    <option value="">— Unassigned —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              {menuItems.length > 0 && (
                <div>
                  <label style={lbl}>Service</label>
                  <select value={apptForm.service_id} onChange={e => setApptForm(f => ({ ...f, service_id: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                    <option value="">— None —</option>
                    {menuItems.map(m => <option key={m.id} value={m.id}>{m.name} — ${Number(m.price).toFixed(2)}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Date *</label>
                  <input required type="date" value={apptForm.date}
                    onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, colorScheme: "dark" }} />
                </div>
                <div>
                  <label style={lbl}>Start time *</label>
                  <input required type="time" value={apptForm.start_time}
                    onChange={e => setApptForm(f => ({ ...f, start_time: e.target.value }))} style={{ ...inp, colorScheme: "dark" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Duration</label>
                  <select value={apptForm.duration} onChange={e => setApptForm(f => ({ ...f, duration: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                    {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={apptForm.status} onChange={e => setApptForm(f => ({ ...f, status: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                    <option value="booked">Booked</option>
                    <option value="confirmed">Confirmed</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <input placeholder="Any notes…" value={apptForm.notes}
                  onChange={e => setApptForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
              </div>
              {apptError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{apptError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" disabled={apptSaving}
                  style={{ background: ACCENT, color: BG, border: "none", borderRadius: 8, padding: "11px 24px", fontWeight: 800, fontSize: 13, cursor: apptSaving ? "not-allowed" : "pointer" }}>
                  {apptSaving ? "Saving…" : "Save appointment"}
                </button>
                <button type="button" onClick={() => setShowAddAppt(false)}
                  style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 18px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Block Time Modal ──────────────────────────────── */}
      {showBlock && (
        <div style={modalOverlay} onClick={() => setShowBlock(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: TEXT, margin: 0 }}>Block Time</p>
              <button onClick={() => setShowBlock(false)} style={{ background: "none", border: "none", color: MUTED, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <form onSubmit={saveBlock} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {locations.length > 0 && (
                <div>
                  <label style={lbl}>Chair</label>
                  <select value={blockForm.location_id} onChange={e => setBlockForm(f => ({ ...f, location_id: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                    <option value="">— None / General —</option>
                    <option value="all">All chairs</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={lbl}>Date *</label>
                <input required type="date" value={blockForm.date}
                  onChange={e => setBlockForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, colorScheme: "dark" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Start time *</label>
                  <input required type="time" value={blockForm.start_time}
                    onChange={e => setBlockForm(f => ({ ...f, start_time: e.target.value }))} style={{ ...inp, colorScheme: "dark" }} />
                </div>
                <div>
                  <label style={lbl}>End time *</label>
                  <input required type="time" value={blockForm.end_time}
                    onChange={e => setBlockForm(f => ({ ...f, end_time: e.target.value }))} style={{ ...inp, colorScheme: "dark" }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Reason</label>
                <input placeholder="e.g. Lunch break, Training, Day off" value={blockForm.reason}
                  onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} style={inp} />
              </div>
              {blockError && <p style={{ color: RED, fontSize: 12, margin: 0 }}>{blockError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" disabled={blockSaving}
                  style={{ background: RED + "22", color: RED, border: `1px solid ${RED}55`, borderRadius: 8, padding: "11px 24px", fontWeight: 800, fontSize: 13, cursor: blockSaving ? "not-allowed" : "pointer" }}>
                  {blockSaving ? "Saving…" : "Block time"}
                </button>
                <button type="button" onClick={() => setShowBlock(false)}
                  style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 18px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Appointment Detail Modal ──────────────────────── */}
      {selectedAppt && (
        <div style={modalOverlay} onClick={() => setSelectedAppt(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: TEXT, margin: 0 }}>Appointment</p>
              <button onClick={() => setSelectedAppt(null)} style={{ background: "none", border: "none", color: MUTED, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: TEXT }}>{selectedAppt.client_name}</div>
                {selectedAppt.client_phone && (
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{selectedAppt.client_phone}</div>
                )}
              </div>
              {selectedAppt.service_name && (
                <div style={{ fontSize: 14, color: ACCENT, fontWeight: 700 }}>{selectedAppt.service_name}</div>
              )}
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                {new Date(selectedAppt.start_time).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                <br />
                {new Date(selectedAppt.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {" – "}
                {new Date(selectedAppt.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
              {selectedAppt.location_id && (
                <div style={{ fontSize: 13, color: MUTED }}>
                  Chair: <span style={{ color: TEXT, fontWeight: 600 }}>{locations.find(l => l.id === selectedAppt.location_id)?.name ?? "—"}</span>
                </div>
              )}
              {selectedAppt.notes && (
                <div style={{ fontSize: 13, color: MUTED, fontStyle: "italic", background: BG, padding: "10px 14px", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                  {selectedAppt.notes}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Status</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {APPT_STATUSES.map(s => {
                    const active = selectedAppt.status === s;
                    const color  = APPT_COLOR[s];
                    return (
                      <button key={s} disabled={statusSaving} onClick={() => updateStatus(selectedAppt.id, s)}
                        style={{ background: active ? color + "30" : "none", border: `1px solid ${active ? color : BORDER}`, borderRadius: 8, padding: "7px 13px", color: active ? color : MUTED, fontWeight: active ? 800 : 500, fontSize: 12, cursor: statusSaving ? "not-allowed" : "pointer", textTransform: "capitalize", transition: "all 0.15s" }}>
                        {s.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => deleteAppt(selectedAppt.id)}
                style={{ background: "none", border: `1px solid ${RED}55`, borderRadius: 8, padding: "8px 16px", color: RED, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Delete appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
