import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Verify caller is the super-admin
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || user?.email !== "fitpaperwork25@gmail.com") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) return res.status(400).json({ error: error.message });
  return res.json({ user_id: data.user.id });
}
