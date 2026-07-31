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
 *
 * Sprint 3B Phase 1: now returns the resolved wegnAccountId (or null on
 * any failure) instead of void. This value was already being computed
 * server-side and previously discarded - every existing call site
 * (`void linkIdentityAccount();` in LoginPage.tsx) is unaffected, since
 * `void` discards a return value regardless of its type. Exposing it
 * lets a future, deliberately-chosen call site pass it on to
 * registerBusinessWithWsms() (see that function's own Phase 1 header
 * comment) - no call site does that yet in this repo; see
 * docs/WSMS_IDENTITY_RELATIONSHIP_DECISION.md (qrwegn repo) for why.
 */
export async function linkIdentityAccount(): Promise<{ wegnAccountId: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("link-identity-account", {});
    if (error) {
      console.error("[linkIdentityAccount] link failed (non-blocking):", error);
      return { wegnAccountId: null };
    }
    return { wegnAccountId: typeof data?.wegnAccountId === "string" ? data.wegnAccountId : null };
  } catch (err) {
    console.error("[linkIdentityAccount] link failed (non-blocking):", err);
    return { wegnAccountId: null };
  }
}

/**
 * Cross-product signup Phase A / Phase C stub: registers the caller's
 * own business with WEGN Identity's canonical Business Registry (see
 * supabase/functions/register-business-with-identity/index.ts, new in
 * this repo, mirroring qrwegn's and wegn-store-app's own versions). This
 * is what makes a business appear in WEGN Home's portfolio.
 *
 * PHASE C PLACEHOLDER - see register-business-with-identity's own
 * header comment: this is currently called automatically from
 * RegisterPage.tsx, immediately after linkIdentityAccount() resolves a
 * wegnAccountId - not from any explicit owner-confirmation UI, because
 * none exists yet. Move the call site behind such a UI if a future
 * decision requires it.
 */
export async function registerBusinessWithIdentity(businessId: string): Promise<{ ok: boolean; wegnBusinessId: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("register-business-with-identity", {
      body: { businessId },
    });
    if (error) {
      console.error("[registerBusinessWithIdentity] link failed (non-blocking):", error);
      return { ok: false, wegnBusinessId: null };
    }
    return { ok: !!data?.ok, wegnBusinessId: data?.wegnBusinessId ?? null };
  } catch (err) {
    console.error("[registerBusinessWithIdentity] link failed (non-blocking):", err);
    return { ok: false, wegnBusinessId: null };
  }
}
