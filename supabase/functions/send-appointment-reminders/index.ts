// send-appointment-reminders
// Called hourly by pg_cron. Sends reminder emails at the 24h and 2h marks
// before each appointment that has a client_email address.
// Uses BUSINESS_TIMEZONE (default: America/New_York) to interpret the stored
// date + start_time, which are recorded in the business's local time.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY       = Deno.env.get("SENDGRID_API_KEY")!;
const FROM_EMAIL             = Deno.env.get("FROM_EMAIL") ?? "noreply@qrbooker.co";
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUSINESS_TIMEZONE      = Deno.env.get("BUSINESS_TIMEZONE") ?? "America/New_York";
const CRON_SECRET            = Deno.env.get("CRON_SECRET");

// ── Helpers ────────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: "BarberShop 21" },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`SendGrid ${res.status}: ${body}`);
  }
}

function fmtTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${(mStr ?? "00").padStart(2, "0")} ${ampm}`;
}

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

// Returns the current time expressed as a "fake UTC" Date in the business timezone.
// This lets us subtract two local times without DST math complications,
// because both appt time and now-in-tz are expressed the same way.
function localNow(tz: string): Date {
  // sv-SE gives "YYYY-MM-DD HH:MM:SS" which parses unambiguously as UTC
  const s = new Date().toLocaleString("sv-SE", { timeZone: tz });
  return new Date(s.replace(" ", "T") + "Z");
}

type Appointment = {
  id: string;
  client_name: string;
  client_email: string;
  service_name: string | null;
  date: string;
  start_time: string;
  notes: string | null;
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
  location_id: string | null;
  business_id: string;
};

function buildReminderHtml(appt: Appointment, barberName: string | null, bizName: string, label: string): string {
  const timeStr = fmtTime(appt.start_time);
  const dateStr = fmtDate(appt.date);
  const rows: Array<[string, string]> = [["Date", dateStr], ["Time", timeStr]];
  if (appt.service_name) rows.push(["Service", appt.service_name]);
  if (barberName)        rows.push(["With",    barberName]);
  if (appt.notes)        rows.push(["Notes",   appt.notes]);

  const tableRows = rows.map(([l, v]) => `
    <tr>
      <td style="padding:10px 0;color:#999;font-size:13px;width:80px">${l}</td>
      <td style="padding:10px 0;color:#1a1a1a;font-size:13px;font-weight:700">${v}</td>
    </tr>`).join("");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5"><tr><td align="center" style="padding:32px 16px">
<table width="480" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#080808;padding:24px 32px;text-align:center">
    <div style="font-size:28px;font-weight:900;color:#E8C547;letter-spacing:2px">BARBERSHOP 21</div>
  </td></tr>
  <tr><td style="padding:32px">
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">Reminder: ${label}</h1>
    <p style="margin:0 0 24px;color:#666;font-size:14px">
      Hi ${appt.client_name}, your appointment at <strong>${bizName}</strong> is coming up.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f0">
      ${tableRows}
    </table>
  </td></tr>
  <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:11px;color:#bbb">Powered by <strong>QRBooker</strong></p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Validate cron secret when provided
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  const nowLocal = localNow(BUSINESS_TIMEZONE);
  const todayStr = nowLocal.toISOString().split("T")[0];

  // Fetch upcoming appointments with a client_email that haven't had all reminders sent
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id, client_name, client_email, service_name, date, start_time, notes, reminder_24h_sent, reminder_2h_sent, location_id, business_id")
    .not("client_email", "is", null)
    .in("status", ["booked", "confirmed"])
    .gte("date", todayStr)
    .or("reminder_24h_sent.eq.false,reminder_2h_sent.eq.false");

  if (error) {
    console.error("Query error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  const appts = (appointments ?? []) as Appointment[];

  for (const appt of appts) {
    // Treat appt time as business-local by parsing as "fake UTC"
    const apptLocal = new Date(`${appt.date}T${appt.start_time.substring(0, 8)}Z`);
    const diffMs    = apptLocal.getTime() - nowLocal.getTime();
    const diffH     = diffMs / 3_600_000;

    // Fetch supporting data (do only when needed)
    let barberName: string | null = null;
    let bizName = "BarberShop 21";

    if (
      (!appt.reminder_24h_sent && diffH >= 23.5 && diffH < 24.5) ||
      (!appt.reminder_2h_sent  && diffH >= 1.5  && diffH < 2.5)
    ) {
      const [bizRes, locRes] = await Promise.all([
        supabase.from("businesses").select("name").eq("id", appt.business_id).single(),
        appt.location_id
          ? supabase.from("locations").select("name").eq("id", appt.location_id).single()
          : Promise.resolve({ data: null }),
      ]);
      bizName    = (bizRes.data as { name: string } | null)?.name ?? bizName;
      barberName = (locRes.data as { name: string } | null)?.name ?? null;
    }

    // 24h reminder
    if (!appt.reminder_24h_sent && diffH >= 23.5 && diffH < 24.5) {
      const timeStr = fmtTime(appt.start_time);
      const dateStr = fmtDate(appt.date);
      await sendEmail(
        appt.client_email,
        `Reminder: your appointment at ${bizName} is tomorrow at ${timeStr}`,
        buildReminderHtml(appt, barberName, bizName, `tomorrow at ${timeStr} — ${dateStr}`),
      );
      await supabase.from("appointments").update({ reminder_24h_sent: true }).eq("id", appt.id);
      sent++;
    }

    // 2h reminder
    if (!appt.reminder_2h_sent && diffH >= 1.5 && diffH < 2.5) {
      const timeStr = fmtTime(appt.start_time);
      await sendEmail(
        appt.client_email,
        `Reminder: your appointment at ${bizName} is in 2 hours`,
        buildReminderHtml(appt, barberName, bizName, `in 2 hours at ${timeStr}`),
      );
      await supabase.from("appointments").update({ reminder_2h_sent: true }).eq("id", appt.id);
      sent++;
    }
  }

  console.log(`Reminders run: checked ${appts.length} appointments, sent ${sent} emails`);
  return new Response(JSON.stringify({ ok: true, checked: appts.length, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
