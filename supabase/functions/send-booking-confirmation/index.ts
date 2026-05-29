// send-booking-confirmation
// Triggered by a Supabase Database Webhook on appointments INSERT.
// Sends a confirmation email to the customer (if email provided) and
// a new-booking notification to Pierce.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY       = Deno.env.get("SENDGRID_API_KEY")!;
const PIERCE_EMAIL           = Deno.env.get("PIERCE_EMAIL")!;
const FROM_EMAIL             = Deno.env.get("FROM_EMAIL") ?? "noreply@qrbooker.co";
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

function detailRows(record: Record<string, unknown>, barberName: string | null): string {
  const rows: Array<[string, string]> = [
    ["Name", String(record.client_name ?? "")],
  ];
  if (record.service_name) rows.push(["Service", String(record.service_name)]);
  if (barberName)          rows.push(["With",    barberName]);
  rows.push(["Date", fmtDate(String(record.date))]);
  rows.push(["Time", fmtTime(String(record.start_time))]);
  if (record.notes) rows.push(["Notes", String(record.notes)]);

  return rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 0;color:#999;font-size:13px;width:80px">${label}</td>
      <td style="padding:10px 0;color:#1a1a1a;font-size:13px;font-weight:700">${value}</td>
    </tr>`).join("");
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Validate shared secret when set
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: { type: string; record: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  if (payload.type !== "INSERT") {
    return new Response("ignored", { status: 200 });
  }

  const record = payload.record;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  // Fetch supporting data in parallel
  const [bizRes, locationRes] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", record.business_id).single(),
    record.location_id
      ? supabase.from("locations").select("name").eq("id", record.location_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const bizName    = (bizRes.data as { name: string } | null)?.name ?? "the barber shop";
  const barberName = (locationRes.data as { name: string } | null)?.name ?? null;
  const dateStr    = fmtDate(String(record.date));
  const timeStr    = fmtTime(String(record.start_time));
  const rows       = detailRows(record, barberName);

  // ── Customer confirmation ────────────────────────────────────────────────
  if (record.client_email) {
    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5"><tr><td align="center" style="padding:32px 16px">
<table width="480" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#080808;padding:24px 32px;text-align:center">
    <div style="font-size:28px;font-weight:900;color:#E8C547;letter-spacing:2px">BARBERSHOP 21</div>
  </td></tr>
  <tr><td style="padding:32px">
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">You're booked! ✓</h1>
    <p style="margin:0 0 24px;color:#666;font-size:14px">Here's your appointment summary. We'll see you soon.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f0">
      ${rows}
    </table>
    <div style="margin-top:24px;padding:16px;background:#fff8e1;border-radius:8px;border-left:3px solid #E8C547">
      <p style="margin:0;font-size:13px;color:#666">
        You'll receive a reminder <strong>24 hours</strong> and <strong>2 hours</strong> before your appointment.
      </p>
    </div>
  </td></tr>
  <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:11px;color:#bbb">Powered by <strong>QRBooker</strong></p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>`;

    await sendEmail(
      String(record.client_email),
      `Booking confirmed — ${bizName} — ${dateStr} at ${timeStr}`,
      html,
    );
  }

  // ── Pierce notification ──────────────────────────────────────────────────
  const pierceHtml = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5"><tr><td align="center" style="padding:32px 16px">
<table width="480" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#080808;padding:24px 32px">
    <div style="font-size:13px;font-weight:700;color:#E8C547;letter-spacing:2px;text-transform:uppercase">New Booking</div>
    <div style="font-size:20px;font-weight:900;color:#fff;margin-top:4px">${bizName}</div>
  </td></tr>
  <tr><td style="padding:32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f0">
      ${rows}
      ${record.client_phone ? `<tr><td style="padding:10px 0;color:#999;font-size:13px;width:80px">Phone</td><td style="padding:10px 0;color:#1a1a1a;font-size:13px;font-weight:700">${record.client_phone}</td></tr>` : ""}
      ${record.client_email ? `<tr><td style="padding:10px 0;color:#999;font-size:13px;width:80px">Email</td><td style="padding:10px 0;color:#1a1a1a;font-size:13px;font-weight:700">${record.client_email}</td></tr>` : ""}
    </table>
  </td></tr>
  <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:11px;color:#bbb">QRBooker</p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  await sendEmail(
    PIERCE_EMAIL,
    `New booking — ${String(record.client_name)} — ${dateStr} at ${timeStr}`,
    pierceHtml,
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
