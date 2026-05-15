import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = "https://qrserve-v3.vercel.app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || user?.email !== "fitpaperwork25@gmail.com") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { email } = req.body as { email: string };
  if (!email) return res.status(400).json({ error: "email required" });

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${APP_URL}/dashboard` },
  });

  if (error) return res.status(400).json({ error: error.message });
  return res.json({ link: (data as any).properties?.action_link });
}
