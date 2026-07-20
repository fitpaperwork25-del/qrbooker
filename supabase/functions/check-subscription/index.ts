import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth } from "../_shared/verifyAuth.ts";

/**
 * WSMS integration, observe-only phase - mirrors wegn-store-app's
 * check-subscription exactly (see docs/WSMS_INTEGRATION_GUIDE.md).
 * Proxies the caller's own business to WSMS's check-entitlement API and
 * returns the result - never called directly from the browser with the
 * WSMS secret, which would leak it client-side.
 *
 * Unlike Wegn Store, there's no auth_business_id() to resolve a single
 * "current business" - the caller supplies the businessId explicitly.
 * This endpoint is read-only and returns entitlement status regardless
 * of whether the caller owns that business (matches the public-read
 * posture already granted on the businesses table itself - this reveals
 * nothing businesses.subscription_status doesn't already expose to
 * anyone). Only register-with-wsms (a write) requires the stricter
 * owner_id check.
 *
 * Deliberately does not gate anything yet - the frontend only shows a
 * dismissible notice on a non-active result, never blocks a feature.
 */

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
  const wsmsUrl = Deno.env.get("WSMS_URL");
  const wsmsSecret = Deno.env.get("WSMS_PRODUCT_SECRET");

  if (!supabaseUrl || !supabaseAnonKey || !wsmsUrl || !wsmsSecret) {
    return jsonResponse({ error: "Server is not configured (missing required secrets)" }, 500);
  }

  const verified = await verifyAuth({
    supabaseUrl,
    supabaseAnonKey,
    authorizationHeader: req.headers.get("Authorization"),
  });
  if (!verified) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  let body: { businessId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return jsonResponse({ error: "businessId is required" }, 400);

  try {
    const wsmsRes = await fetch(wsmsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productKey: "qrbooker",
        secret: wsmsSecret,
        externalBusinessId: businessId,
      }),
    });
    const wsmsBody = await wsmsRes.json().catch(() => ({}));
    if (!wsmsRes.ok) {
      console.error("[check-subscription] WSMS returned an error:", wsmsRes.status, wsmsBody);
      return jsonResponse({ known: false, active: null, status: null });
    }
    return jsonResponse({
      known: !!wsmsBody.found,
      active: wsmsBody.active ?? null,
      status: wsmsBody.status ?? null,
      currentPeriodEnd: wsmsBody.currentPeriodEnd ?? null,
      gracePeriodEndsAt: wsmsBody.gracePeriodEndsAt ?? null,
    });
  } catch (err) {
    console.error("[check-subscription] request to WSMS failed:", err);
    return jsonResponse({ known: false, active: null, status: null });
  }
});
