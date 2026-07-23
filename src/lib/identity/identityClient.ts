import { supabase } from "../supabase";

/**
 * Sprint 3A: WEGN Identity Service integration, fire-and-forget from the
 * standalone owner login (LoginPage.tsx) only. Mirrors QRWegn's and Wegn
 * Store's own linkIdentityAccount() exactly, which itself mirrors this
 * repo's own registerBusinessWithWsms() (../wsms/subscriptionClient.ts)
 * - same non-blocking contract, same shape. A failure here must never be
 * visible to the person logging in, never delay navigation, and never
 * throw - see supabase/functions/link-identity-account/index.ts for the
 * server-side half of this contract.
 */
export async function linkIdentityAccount(): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("link-identity-account", {});
    if (error) console.error("[linkIdentityAccount] link failed (non-blocking):", error);
  } catch (err) {
    console.error("[linkIdentityAccount] link failed (non-blocking):", err);
  }
}
