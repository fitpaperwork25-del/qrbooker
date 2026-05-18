import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// One-time bootstrap endpoint — deleted immediately after use.
const BOOTSTRAP_SECRET = "qwegn-bootstrap-2026";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-bootstrap-secret"] !== BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // fitpaperwork25@gmail.com is blocked by a stale auth.identities/flow_state
  // record that requires SQL to clear. Use etbarekh@me.com (already active)
  // as the admin account instead.
  const ADMIN_EMAIL = "etbarekh@gmail.com";
  const KNOWN_USER_ID = "12fd42fd-b9f4-4e55-aefa-2cda24670e6d";

  // Check if a business already exists for this user
  const { data: existing } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", KNOWN_USER_ID)
    .maybeSingle();

  if (existing) {
    return res.json({ success: true, message: "Business already exists", business: existing, user_id: KNOWN_USER_ID });
  }

  // Create QR-Wegn HQ business row
  const { error: bizError } = await supabase.from("businesses").insert({
    owner_id:            KNOWN_USER_ID,
    name:                "QR-Wegn HQ",
    slug:                "qr-wegn-hq",
    type:                "platform",
    plan:                "starter",
    subscription_status: "trialing",
  });

  if (bizError) {
    return res.status(400).json({ error: bizError.message });
  }

  return res.json({ success: true, user_id: KNOWN_USER_ID, email: ADMIN_EMAIL, message: "QR-Wegn HQ created. Log in with etbarekh@me.com" });
}
