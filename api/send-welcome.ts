import { Resend } from "resend";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = "https://qrserve-v3.vercel.app";

function html(businessName: string, slug: string): string {
  const scanUrl      = `${APP_URL}/scan/${slug}`;
  const staffUrl     = `${APP_URL}/staff-login?slug=${slug}`;
  const dashboardUrl = `${APP_URL}/dashboard`;

  // QR finder-pattern square (3 nested divs, works without images)
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
  <title>Welcome to QR-Wegn</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;">
<tr><td align="center" style="padding:0 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- ── HEADER ─────────────────────────────────────────────────── -->
  <tr>
    <td align="center" style="padding:52px 32px 40px;border-bottom:1px solid rgba(255,255,255,0.08);">

      <!-- QR mark: 3 finder-pattern squares -->
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
            <!-- data dots suggestion -->
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

      <!-- Wordmark -->
      <div style="font-size:28px;font-weight:900;color:#F0EDE8;letter-spacing:2px;line-height:1;">QR-Wegn</div>
      <div style="margin-top:8px;font-size:10px;font-weight:600;color:#E8C547;letter-spacing:5px;">SCAN &middot; ORDER &middot; SERVE</div>
    </td>
  </tr>

  <!-- ── WELCOME HEADLINE ────────────────────────────────────────── -->
  <tr>
    <td style="padding:48px 32px 0;">
      <div style="font-size:34px;font-weight:900;color:#F0EDE8;line-height:1.1;letter-spacing:-0.5px;">
        You&rsquo;re live,<br/>${businessName}.
      </div>
    </td>
  </tr>

  <!-- ── INTRO ───────────────────────────────────────────────────── -->
  <tr>
    <td style="padding:20px 32px 36px;">
      <p style="margin:0;font-size:16px;line-height:1.75;color:#999999;">
        Your QR ordering platform is ready. Customers can now scan a table QR code,
        browse your menu, and place orders in seconds &mdash; no app, no friction.
        Everything you need to go live is below.
      </p>
    </td>
  </tr>

  <!-- ── DEPLOYMENT KIT ─────────────────────────────────────────── -->
  <tr>
    <td style="padding:0 32px 36px;">
      <div style="background:#111111;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:24px 28px;">
        <div style="font-size:10px;font-weight:700;color:#E8C547;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px;">
          Deploy Kit
        </div>

        <!-- Scan page -->
        <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">
          <tr>
            <td style="vertical-align:top;padding-right:12px;">
              <div style="width:8px;height:8px;background:#E8C547;border-radius:50%;margin-top:5px;"></div>
            </td>
            <td>
              <div style="font-size:12px;font-weight:700;color:#F0EDE8;margin-bottom:3px;">Customer Scan Page</div>
              <a href="${scanUrl}" style="font-size:13px;color:#E8C547;text-decoration:none;font-family:monospace;">${scanUrl}</a>
              <div style="font-size:11px;color:#666666;margin-top:2px;">Print QR codes for each table from your dashboard</div>
            </td>
          </tr>
        </table>

        <!-- Staff login -->
        <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">
          <tr>
            <td style="vertical-align:top;padding-right:12px;">
              <div style="width:8px;height:8px;background:#E8C547;border-radius:50%;margin-top:5px;"></div>
            </td>
            <td>
              <div style="font-size:12px;font-weight:700;color:#F0EDE8;margin-bottom:3px;">Staff Kitchen View</div>
              <a href="${staffUrl}" style="font-size:13px;color:#E8C547;text-decoration:none;font-family:monospace;">${staffUrl}</a>
              <div style="font-size:11px;color:#666666;margin-top:2px;">Restaurant ID: <strong style="color:#F0EDE8;">${slug}</strong> &nbsp;&middot;&nbsp; Set your staff PIN in the dashboard</div>
            </td>
          </tr>
        </table>

        <!-- Dashboard -->
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="vertical-align:top;padding-right:12px;">
              <div style="width:8px;height:8px;background:#E8C547;border-radius:50%;margin-top:5px;"></div>
            </td>
            <td>
              <div style="font-size:12px;font-weight:700;color:#F0EDE8;margin-bottom:3px;">Owner Dashboard</div>
              <a href="${dashboardUrl}" style="font-size:13px;color:#E8C547;text-decoration:none;font-family:monospace;">${dashboardUrl}</a>
              <div style="font-size:11px;color:#666666;margin-top:2px;">Manage tables, menu, orders, and financials</div>
            </td>
          </tr>
        </table>
      </div>
    </td>
  </tr>

  <!-- ── QUICK START ────────────────────────────────────────────── -->
  <tr>
    <td style="padding:0 32px 40px;">
      <div style="font-size:10px;font-weight:700;color:#E8C547;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px;">
        Quick Start
      </div>

      <!-- Step 1 -->
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:18px;">
        <tr>
          <td style="vertical-align:top;padding-right:16px;width:28px;">
            <div style="width:26px;height:26px;background:#E8C547;border-radius:50%;display:block;text-align:center;line-height:26px;font-size:13px;font-weight:900;color:#080808;">1</div>
          </td>
          <td style="vertical-align:top;">
            <div style="font-size:15px;font-weight:700;color:#F0EDE8;margin-bottom:4px;">Set up your tables and menu</div>
            <div style="font-size:13px;color:#888888;line-height:1.6;">Log in to your dashboard, add your tables under the Tables tab, then build your menu with categories and items.</div>
          </td>
        </tr>
      </table>

      <!-- Step 2 -->
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:18px;">
        <tr>
          <td style="vertical-align:top;padding-right:16px;width:28px;">
            <div style="width:26px;height:26px;background:#E8C547;border-radius:50%;display:block;text-align:center;line-height:26px;font-size:13px;font-weight:900;color:#080808;">2</div>
          </td>
          <td style="vertical-align:top;">
            <div style="font-size:15px;font-weight:700;color:#F0EDE8;margin-bottom:4px;">Print your QR codes</div>
            <div style="font-size:13px;color:#888888;line-height:1.6;">Download a QR code for each table from the Tables tab. Print and place them on each table &mdash; customers scan to order instantly.</div>
          </td>
        </tr>
      </table>

      <!-- Step 3 -->
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="vertical-align:top;padding-right:16px;width:28px;">
            <div style="width:26px;height:26px;background:#E8C547;border-radius:50%;display:block;text-align:center;line-height:26px;font-size:13px;font-weight:900;color:#080808;">3</div>
          </td>
          <td style="vertical-align:top;">
            <div style="font-size:15px;font-weight:700;color:#F0EDE8;margin-bottom:4px;">Brief your staff</div>
            <div style="font-size:13px;color:#888888;line-height:1.6;">Set a staff PIN in your dashboard, then share the staff login link. Kitchen staff use the live order view to manage tickets.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── CTA BUTTON ─────────────────────────────────────────────── -->
  <tr>
    <td align="center" style="padding:0 32px 56px;">
      <a href="${dashboardUrl}"
         style="display:inline-block;background:#E8C547;color:#080808;text-decoration:none;font-weight:800;font-size:16px;padding:16px 40px;border-radius:10px;letter-spacing:0.3px;">
        Open Your Dashboard &rarr;
      </a>
    </td>
  </tr>

  <!-- ── FOOTER ─────────────────────────────────────────────────── -->
  <tr>
    <td style="border-top:1px solid rgba(255,255,255,0.07);padding:32px;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;color:#555555;">
        Questions? Reply to this email or contact us at
        <a href="mailto:fitpaperwork25@gmail.com" style="color:#E8C547;text-decoration:none;">fitpaperwork25@gmail.com</a>
      </p>
      <p style="margin:0;font-size:11px;color:#444444;letter-spacing:1px;">
        &copy; 2026 QR-Wegn &nbsp;&middot;&nbsp; SCAN &middot; ORDER &middot; SERVE
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

  const { email, businessName, slug } = req.body as {
    email: string;
    businessName: string;
    slug: string;
  };

  if (!email || !businessName || !slug) {
    return res.status(400).json({ error: "email, businessName and slug required" });
  }

  try {
    const { error } = await resend.emails.send({
      from: "QRServe <onboarding@qrserve.app>",
      to:   email,
      subject: `You're live, ${businessName} 🚀`,
      html: html(businessName, slug),
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("send-welcome error:", err);
    return res.status(500).json({ error: err.message });
  }
}
