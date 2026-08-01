import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Cross-product SSO bridge, QRBooker side. Reached only via a full-page
 * browser redirect from WEGN Home's Launch button (never fetched via
 * XHR/CORS) - deployed with --no-verify-jwt since there is no pre-existing
 * session or apikey to attach to that navigation; the HMAC-signed token
 * itself is this endpoint's entire authentication, verified against the
 * same IDENTITY_CREDENTIAL secret this project already holds for
 * link-identity-account's own outbound call to wegn-identity (see that
 * function's header) - no new credential distributed for this.
 *
 * Deliberately does not create or modify any user - generateLink only
 * ever succeeds for an email that already has a QRBooker account.
 *
 * Destination resolution (WEGN Restaurants Launch audit): the token now
 * carries the actual redirect destination, resolved server-side by
 * wegn-identity's sso-issue-token from wegn_product_destinations - the
 * same canonical source business-portfolio-v1 already uses - instead of
 * this file hardcoding its own. FALLBACK_URL is only a defense-in-depth
 * value for a malformed/missing payload, and ALLOWED_ORIGIN guards
 * against ever redirecting somewhere outside this product even if that
 * canonical config were ever misentered - the token's HMAC signature
 * already proves wegn-identity produced it, this is a second, cheap
 * check on top.
 */

const FALLBACK_URL = "https://qrbooker.app";
const ALLOWED_ORIGIN = "https://qrbooker.app";

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function base64UrlDecode(input: string): string {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return atob(b64);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return redirect(FALLBACK_URL);

  const secret = Deno.env.get("IDENTITY_CREDENTIAL");
  if (!secret) return redirect(FALLBACK_URL);

  const expectedSignature = await hmacSha256Hex(secret, encodedPayload);
  if (!timingSafeEqualHex(expectedSignature, signature)) return redirect(FALLBACK_URL);

  let payload: { email?: unknown; destination?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return redirect(FALLBACK_URL);
  }
  if (typeof payload.email !== "string" || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return redirect(FALLBACK_URL);
  }

  let redirectTo = FALLBACK_URL;
  if (typeof payload.destination === "string") {
    try {
      if (new URL(payload.destination).origin === ALLOWED_ORIGIN) redirectTo = payload.destination;
    } catch {
      // malformed destination - keep the fallback
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return redirect(FALLBACK_URL);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: payload.email,
    options: { redirectTo },
  });
  const actionLink = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link;
  if (error || !actionLink) return redirect(FALLBACK_URL);

  return redirect(actionLink);
});
