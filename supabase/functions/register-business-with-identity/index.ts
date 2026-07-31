import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Cross-product signup Phase A / Phase C stub: registers the caller's
 * own owned QRBooker business with WEGN Identity's canonical Business
 * Registry, via wegn-identity's register-business-link. New in this
 * repo - mirrors qrwegn's own register-business-with-identity and
 * wegn-store-app's Sprint 5 Phase 1C version exactly (same envelope
 * shape, same ownership-verification discipline), adjusted only for
 * productKey "qrbooker" and this repo's own businesses schema (no
 * country_code column, same as qrwegn - countryCode is always sent as
 * null, matching wegn-identity's register-business-link contract, which
 * already treats that field as optional).
 *
 * PHASE C PLACEHOLDER - decision not yet made: register-business-link's
 * envelope requires ownerConfirmed: true, and the Business Registry
 * contract's own intent (see wegn-identity's register-business-link,
 * and qrwegn/wegn-store-app's identical header comments) was "a real,
 * deliberate owner action, not something silently created on signup."
 * This function is currently invoked automatically from RegisterPage.tsx
 * immediately after a successful account-link - not from any explicit
 * owner-confirmation UI, because none exists yet in any of the three
 * products. If a future decision requires explicit confirmation
 * instead, move the *call site* (RegisterPage.tsx) behind that UI;
 * nothing here needs to change.
 *
 * Holds IDENTITY_REGISTRY_CREDENTIAL server-side only - scoped in
 * wegn-identity to register-business-link + productKey "qrbooker" only
 * (see wegn-identity's credentialRegistry.ts, which already reserves
 * IDENTITY_REGISTRY_CREDENTIAL_QRBOOKER as an env var name — this
 * function is what that reserved slot was for). Separate from
 * IDENTITY_CREDENTIAL (link-account), same as the other two products.
 *
 * Deliberately NOT wired to any automatic trigger beyond RegisterPage's
 * own signup flow - no backfill for pre-existing QRBooker businesses is
 * attempted here.
 */
const SUPER_ADMIN_EMAIL = "fitpaperwork25@gmail.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const identityUrl = Deno.env.get("IDENTITY_REGISTER_BUSINESS_LINK_URL");
  const identitySecret = Deno.env.get("IDENTITY_REGISTRY_CREDENTIAL");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !identityUrl || !identitySecret) {
    return jsonResponse({ error: "Server is not configured (missing required secrets)" }, 500);
  }

  const authorizationHeader = req.headers.get("Authorization");
  if (!authorizationHeader) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorizationHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }
  const authUserId = userData.user.id;
  const callerEmail = userData.user.email ?? null;

  let body: { businessId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) {
    return jsonResponse({ error: "businessId is required" }, 400);
  }

  // Ownership check - QRBooker's businesses table has an owner-only RLS
  // policy in schema.sql, but register-with-wsms's own header comment
  // (this repo) documents the table as public-readable in practice for
  // the anonymous booking/scan pages, and treats the owner_id filter as
  // mandatory regardless - same defensive standard applied here, not
  // assumed safe either way. Same narrow super-admin exception as
  // register-with-wsms's own admin_create_business path.
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const isSuperAdmin = callerEmail === SUPER_ADMIN_EMAIL;
  let bizQuery = admin.from("businesses").select("id, name, type").eq("id", businessId);
  if (!isSuperAdmin) bizQuery = bizQuery.eq("owner_id", authUserId);
  const { data: business, error: businessErr } = await bizQuery.maybeSingle();
  if (businessErr) {
    return jsonResponse({ error: "Business lookup failed" }, 500);
  }
  if (!business) {
    return jsonResponse({ error: "Business not found or not owned by caller" }, 404);
  }

  const requestId = crypto.randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 4 * 60 * 1000);

  try {
    const identityRes = await fetch(identityUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
      body: JSON.stringify({
        secret: identitySecret,
        productKey: "qrbooker",
        productAuthUserId: authUserId,
        externalBusinessId: business.id,
        ownerConfirmed: true,
        displayName: business.name,
        businessType: business.type ?? null,
        countryCode: null, // QRBooker's businesses table has no country column
        requestId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }),
    });
    const identityBody = await identityRes.json().catch(() => ({}));
    if (!identityRes.ok) {
      console.error("[register-business-with-identity] Identity service returned an error:", identityRes.status, identityBody);
      return jsonResponse({ ok: false, error: "Business registration failed" }, 502);
    }
    return jsonResponse({
      ok: true,
      wegnBusinessId: identityBody.wegnBusinessId ?? null,
      alreadyLinked: !!identityBody.alreadyLinked,
    });
  } catch (err) {
    console.error("[register-business-with-identity] request to Identity service failed:", err);
    return jsonResponse({ ok: false, error: "Request to Identity service failed" }, 502);
  }
});
