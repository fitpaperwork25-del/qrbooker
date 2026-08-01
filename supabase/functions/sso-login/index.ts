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
 */

const REDIRECT_URL = "https://qrbooker.app";

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
  if (!encodedPayload || !signature) return redirect(REDIRECT_URL);

  const secret = Deno.env.get("IDENTITY_CREDENTIAL");
  if (!secret) return redirect(REDIRECT_URL);

  const expectedSignature = await hmacSha256Hex(secret, encodedPayload);
  if (!timingSafeEqualHex(expectedSignature, signature)) return redirect(REDIRECT_URL);

  let payload: { email?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return redirect(REDIRECT_URL);
  }
  if (typeof payload.email !== "string" || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return redirect(REDIRECT_URL);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return redirect(REDIRECT_URL);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: payload.email,
    options: { redirectTo: REDIRECT_URL },
  });
  const actionLink = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link;
  if (error || !actionLink) return redirect(REDIRECT_URL);

  return redirect(actionLink);
});
