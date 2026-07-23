import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth } from "../_shared/verifyAuth.ts";

/**
 * Sprint 3A: links the caller's own QRBooker owner account to the WEGN
 * Identity Service, fire-and-forget from LoginPage.tsx's standalone
 * owner login only. Same shape as QRWegn's and Wegn Store's own
 * link-identity-account functions - see wegn-identity's README.md
 * "Security model" section and credentialRegistry.ts.
 *
 * Unlike register-with-wsms in this same repo, there is no business
 * lookup here at all - identity linking is about proving who the
 * authenticated caller is, not which business they own, so QRBooker's
 * "businesses is publicly readable" RLS quirk (see that function's own
 * header comment) is not relevant here. This repo's own
 * _shared/verifyAuth.ts already returns email directly with no
 * business/tenant coupling, so it is reused as-is - no adaptation
 * needed, unlike Wegn Store's equivalent (Sprint 2 Task 4), whose
 * shared verifyAuth also resolved auth_business_id() and had to be
 * bypassed for this exact reason.
 *
 * Holds IDENTITY_CREDENTIAL server-side only - a credential scoped in
 * wegn-identity to link-account with productKey "qrbooker" only.
 *
 * Fire-and-forget from the frontend's perspective - a failure here must
 * never block or fail a QRBooker login, which has already succeeded by
 * the time this is called.
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
  const identityUrl = Deno.env.get("IDENTITY_LINK_ACCOUNT_URL");
  const identitySecret = Deno.env.get("IDENTITY_CREDENTIAL");

  if (!supabaseUrl || !supabaseAnonKey || !identityUrl || !identitySecret) {
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
  if (!verified.email) {
    // No email on the session (should not happen for a password-based
    // owner login, but link-account requires one) - fail quiet, this
    // must never surface as a login error.
    return jsonResponse({ ok: false, error: "No email on session" }, 200);
  }

  try {
    const identityRes = await fetch(identityUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: identitySecret,
        productKey: "qrbooker",
        productAuthUserId: verified.authUserId,
        email: verified.email,
      }),
    });
    const identityBody = await identityRes.json().catch(() => ({}));
    if (!identityRes.ok) {
      console.error("[link-identity-account] Identity service returned an error:", identityRes.status, identityBody);
      return jsonResponse({ ok: false, error: "Identity link failed" }, 502);
    }
    return jsonResponse({ ok: true, alreadyLinked: !!identityBody.alreadyLinked, wegnAccountId: identityBody.wegnAccountId ?? null });
  } catch (err) {
    console.error("[link-identity-account] request to Identity service failed:", err);
    return jsonResponse({ ok: false, error: "Request to Identity service failed" }, 502);
  }
});
