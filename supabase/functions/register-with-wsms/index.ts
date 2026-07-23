import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth } from "../_shared/verifyAuth.ts";

/**
 * Registers the caller's own business as a WSMS trialing subscriber.
 * Fire-and-forget from the frontend's perspective - a failure here must
 * never block business creation, which has already committed by the
 * time this is called (see RegisterPage.tsx/DashboardPage.tsx/
 * AdminPage.tsx call sites). Holds WSMS_PRODUCT_SECRET server-side only
 * - this is QRBooker's OWN product secret, not platform-admin's; it can
 * only ever self-register a trialing subscription for QRBooker's own
 * businesses.
 *
 * MANDATORY: businessId is looked up through verified.supabase (the
 * caller's own RLS-scoped client), filtered by BOTH id AND owner_id.
 * QRBooker's businesses table has a "public can read businesses" RLS
 * policy (needed for anonymous booking pages) - a lookup filtered by id
 * alone would return the row for ANY authenticated caller regardless of
 * who owns it, since public read means the row is always visible. The
 * owner_id filter is what actually proves ownership here; this is the
 * mandatory standard for every WSMS product integration per
 * docs/WSMS_PRODUCT_INTEGRATION_PATTERN.md Part 1, not optional or
 * QRBooker-specific.
 *
 * One narrow, explicit exception: QRBooker's own super-admin
 * (SUPER_ADMIN in AdminPage.tsx, the same email-based check already
 * used to gate /admin) creates businesses on behalf of OTHER users via
 * the admin_create_business RPC - that caller can never pass the
 * owner_id check by definition. Rather than weaken the check for
 * everyone, the super-admin's email is allowed as a second, explicit
 * path to the SAME lookup - still filtered by id, still a real
 * database check, never a bypass of ownership verification itself.
 *
 * Sprint 3B Phase 1: also accepts an optional wegnAccountId, forwarded
 * to WSMS's self-register-subscription unchanged - this function never
 * validates or interprets it beyond basic type-checking, WSMS owns that
 * (format validation, conflict handling). Never required; a missing or
 * absent value never affects registration. See
 * docs/WSMS_IDENTITY_RELATIONSHIP_DECISION.md (qrwegn repo).
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
  const wsmsUrl = Deno.env.get("WSMS_SELF_REGISTER_URL");
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

  let body: { businessId?: string; wegnAccountId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return jsonResponse({ error: "businessId is required" }, 400);
  // Passed through as-is - WSMS is the one place format/conflict rules
  // for this value live (see self-register-subscription's own header).
  const wegnAccountId = typeof body.wegnAccountId === "string" && body.wegnAccountId ? body.wegnAccountId : undefined;

  // Ownership check - see header comment. id alone is not sufficient
  // because businesses is publicly readable. The super-admin exception
  // is still a real database check (id must exist), never a bypass of
  // "prove you have a right to this business" - it substitutes "you are
  // the recognized platform super-admin" for "you own it," which is the
  // actual, narrow precondition admin_create_business's callers meet.
  const isSuperAdmin = verified.email === SUPER_ADMIN_EMAIL;
  let bizQuery = verified.supabase.from("businesses").select("id, name").eq("id", businessId);
  if (!isSuperAdmin) bizQuery = bizQuery.eq("owner_id", verified.authUserId);
  const { data: business, error: bizErr } = await bizQuery.maybeSingle();
  if (bizErr) { console.error("[register-with-wsms] business lookup failed:", bizErr); return jsonResponse({ ok: false, error: "Lookup failed" }, 500); }
  if (!business) return jsonResponse({ ok: false, error: "Business not found, or you do not have access to it" }, 403);

  try {
    const wsmsRes = await fetch(wsmsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productKey: "qrbooker",
        secret: wsmsSecret,
        externalBusinessId: business.id,
        businessDisplayName: business.name,
        ...(wegnAccountId ? { wegnAccountId } : {}),
      }),
    });
    const wsmsBody = await wsmsRes.json().catch(() => ({}));
    if (!wsmsRes.ok) {
      console.error("[register-with-wsms] WSMS returned an error:", wsmsRes.status, wsmsBody);
      return jsonResponse({ ok: false, error: typeof wsmsBody.error === "string" ? wsmsBody.error : "WSMS registration failed" }, 502);
    }
    return jsonResponse({ ok: true, alreadyExists: !!wsmsBody.alreadyExists, status: wsmsBody.status ?? null, currentPeriodEnd: wsmsBody.currentPeriodEnd ?? null });
  } catch (err) {
    console.error("[register-with-wsms] request to WSMS failed:", err);
    return jsonResponse({ ok: false, error: "Request to WSMS failed" }, 502);
  }
});
