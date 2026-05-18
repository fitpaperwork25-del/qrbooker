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

  // Try to create; if already exists, find them via direct REST API call
  let userId: string;
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email:          "fitpaperwork25@gmail.com",
    password:       "TempAdmin2026!",
    email_confirm:  true,
  });

  if (userError) {
    if (!userError.message.toLowerCase().includes("already been registered")) {
      return res.status(400).json({ error: userError.message });
    }

    // User exists — query directly via Admin REST API with email filter
    const lookupUrl = `${process.env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent("fitpaperwork25@gmail.com")}`;
    const lookupRes = await fetch(lookupUrl, {
      headers: {
        "apikey":        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });
    const lookupJson = await lookupRes.json() as any;

    // Response may be { users: [...] } or an array directly
    const users: any[] = Array.isArray(lookupJson) ? lookupJson : (lookupJson.users ?? []);
    const existing = users.find(
      (u: any) => u.email?.toLowerCase() === "fitpaperwork25@gmail.com"
    );

    if (!existing) {
      // Fallback: paginate through all users
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const fallback = list?.users?.find(
        (u) => u.email?.toLowerCase() === "fitpaperwork25@gmail.com"
      );
      if (!fallback) {
        return res.status(404).json({
          error: "User not found",
          lookupResponse: lookupJson,
          totalFromList: list?.users?.length ?? 0,
        });
      }
      userId = fallback.id;
    } else {
      userId = existing.id;
    }

    // Reset password so they can sign in
    await supabase.auth.admin.updateUserById(userId, {
      password:      "TempAdmin2026!",
      email_confirm: true,
    });
  } else {
    userId = userData.user.id;
  }

  // Insert business row
  const { error: bizError } = await supabase.from("businesses").insert({
    owner_id:            userId,
    name:                "QR-Wegn HQ",
    slug:                "qr-wegn-hq",
    type:                "platform",
    plan:                "starter",
    subscription_status: "trialing",
  });

  if (bizError) {
    return res.status(400).json({ error: bizError.message, user_id: userId });
  }

  return res.json({ success: true, user_id: userId });
}
