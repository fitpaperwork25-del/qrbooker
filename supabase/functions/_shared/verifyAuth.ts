import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Verifies the caller's Supabase JWT server-side. Unlike Wegn Store's
 * equivalent, this does NOT resolve a single "current business" for the
 * session - QRBooker has no auth_business_id()-style RPC, and a caller
 * may own more than one business. Callers must always verify ownership
 * of a SPECIFIC businessId explicitly (see register-with-wsms) - never
 * assume the returned authUserId alone proves anything about any
 * business without that explicit check, especially since QRBooker's
 * businesses table is publicly readable (see
 * docs/QRBOOKER_WSMS_INTEGRATION_DESIGN.md, Phase 3).
 */
export type VerifiedRequest = {
  authUserId: string;
  email: string | null;
  /** A Supabase client scoped to the caller's own JWT - RLS applies to
   *  every query made with this client. Never use the service-role key
   *  for ownership checks. */
  supabase: SupabaseClient;
};

export async function verifyAuth(params: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authorizationHeader: string | null;
}): Promise<VerifiedRequest | null> {
  if (!params.authorizationHeader) return null;

  const supabase = createClient(params.supabaseUrl, params.supabaseAnonKey, {
    global: { headers: { Authorization: params.authorizationHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return null;

  return { authUserId: userData.user.id, email: userData.user.email ?? null, supabase };
}
