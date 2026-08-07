import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend  = new Resend(process.env.RESEND_API_KEY);
const APP_URL = "https://qrbooker.app";

function html(businessName: string, magicLink: string): string {
  const finder = `
    <div style="width:24px;height:24px;background:#E8C547;border-radius:3px;display:inline-block;">
      <div style="margin:5px;width:14px;height:14px;background:#111111;border-radius:1px;">
        <div style="margin:4px;width:6px;height:6px;background:#E8C547;border-radius:1px;"></div>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Your WEGN Appointments dashboard is ready</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;">
<tr><td align="center" style="padding:0 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- HEADER -->
  <tr>
    <td align="center" style="padding:52px 32px 40px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr>
          <td>${finder}</td>
          <td width="10"></td>
          <td>${finder}</td>
        </tr>
        <tr><td colspan="3" height="10"></td></tr>
        <tr>
          <td>${finder}</td>
          <td></td>
          <td>
            <table cellpadding="0" cellspacing="2">
              <tr>
                <td style="width:6px;height:6px;background:#E8C547;border-radius:1px;opacity:.7;"></td>
                <td style="width:6px;height:6px;background:#E8C547;border-radius:1px;opacity:.4;"></td>
              </tr>
              <tr>
                <td style="width:6px;height:6px;background:#E8C547;border-radius:1px;opacity:.4;"></td>
                <td style="width:6px;height:6px;background:#E8C547;border-radius:1px;opacity:.7;"></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <div style="font-size:28px;font-weight:900;color:#F0EDE8;letter-spacing:2px;line-height:1;">WEGN Appointments</div>
      <div style="margin-top:8px;font-size:10px;font-weight:600;color:#E8C547;letter-spacing:5px;">SCAN &middot; BOOK &middot; SHOW UP</div>
    </td>
  </tr>

  <!-- HEADLINE -->
  <tr>
    <td style="padding:48px 32px 0;">
      <div style="font-size:34px;font-weight:900;color:#F0EDE8;line-height:1.1;letter-spacing:-0.5px;">
        You&rsquo;re set up,<br/>${businessName}.
      </div>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:20px 32px 36px;">
      <p style="margin:0;font-size:16px;line-height:1.75;color:#999999;">
        Your booking dashboard on WEGN Appointments is ready and waiting for you.
        Click the button below to log in &mdash; no password needed, this link signs you straight in.
      </p>
    </td>
  </tr>

  <!-- MAGIC LINK CTA -->
  <tr>
    <td align="center" style="padding:0 32px 40px;">
      <a href="${magicLink}"
         style="display:inline-block;background:#E8C547;color:#080808;text-decoration:none;font-weight:800;font-size:16px;padding:16px 40px;border-radius:10px;letter-spacing:0.3px;">
        Open My Dashboard &rarr;
      </a>
      <p style="margin:16px 0 0;font-size:11px;color:#555555;">
        This link expires in 1 hour and can only be used once.
      </p>
    </td>
  </tr>

  <!-- WHAT'S WAITING -->
  <tr>
    <td style="padding:0 32px 40px;">
      <div style="background:#111111;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:24px 28px;">
        <div style="font-size:10px;font-weight:700;color:#E8C547;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px;">
          What&rsquo;s waiting for you
        </div>
        ${[
          ["Chairs & QR codes",   "Add your chairs and download a QR code for each one"],
          ["Service menu",        "Add your services, set durations and prices — all live instantly"],
          ["Live bookings",       "Watch bookings come in and manage them in real time"],
          ["Staff access",        "Set a PIN so your staff can view the booking queue"],
        ].map(([title, sub]) => `
        <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">
          <tr>
            <td style="vertical-align:top;padding-right:12px;">
              <div style="width:8px;height:8px;background:#E8C547;border-radius:50%;margin-top:5px;"></div>
            </td>
            <td>
              <div style="font-size:12px;font-weight:700;color:#F0EDE8;margin-bottom:2px;">${title}</div>
              <div style="font-size:12px;color:#666666;">${sub}</div>
            </td>
          </tr>
        </table>`).join("")}
      </div>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="border-top:1px solid rgba(255,255,255,0.07);padding:32px;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;color:#555555;">
        Questions? Reply to this email or reach us at
        <a href="mailto:fitpaperwork25@gmail.com" style="color:#E8C547;text-decoration:none;">fitpaperwork25@gmail.com</a>
      </p>
      <p style="margin:0;font-size:11px;color:#444444;letter-spacing:1px;">
        &copy; 2026 WEGN Appointments &nbsp;&middot;&nbsp; SCAN &middot; BOOK &middot; SHOW UP
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || user?.email !== "fitpaperwork25@gmail.com") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { email, businessName } = req.body as { email: string; businessName: string };
  if (!email || !businessName) {
    return res.status(400).json({ error: "email and businessName required" });
  }

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: APP_URL },
  });

  if (linkErr) return res.status(400).json({ error: linkErr.message });

  const magicLink = (linkData as any).properties?.action_link;
  if (!magicLink) return res.status(500).json({ error: "Failed to generate magic link" });

  const { error: sendErr } = await resend.emails.send({
    from: "WEGN Appointments <onboarding@resend.dev>",
    to: email,
    subject: `Your WEGN Appointments dashboard is ready, ${businessName}`,
    html: html(businessName, magicLink),
  });

  if (sendErr) {
    console.error("Resend error:", sendErr);
    return res.status(500).json({ error: sendErr.message });
  }

  return res.json({ ok: true });
}
