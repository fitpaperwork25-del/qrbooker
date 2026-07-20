import type { SubscriptionCheckResult } from "./subscriptionClient";

/**
 * Pure derivation from a WSMS check result to what the owner sees.
 * Ported directly from wegn-store-app's version (same logic, same
 * tests) per docs/WSMS_PRODUCT_INTEGRATION_PATTERN.md - banner
 * derivation is a "reusable exactly" component, not something to
 * redesign per product.
 *
 * Phase 1 policy: every banner here is informational only - nothing
 * blocks any action, for any status, including suspended/cancelled.
 * QRBooker's own subscription_status (Stripe-driven) already enforces
 * nothing today either (verified directly in
 * docs/QRBOOKER_WSMS_INTEGRATION_DESIGN.md) - this doesn't change that.
 * "Expired" is not a real WSMS status - it's grace_period past its own
 * gracePeriodEndsAt, computed here for display only; the actual
 * grace->suspended transition is handled automatically by WSMS's own
 * scheduled job, not by this check.
 */
export type SubscriptionBannerTone = "info" | "warning" | "danger";
export type SubscriptionBanner = { tone: SubscriptionBannerTone; message: string };

function daysUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / (24 * 60 * 60 * 1000)));
}

export function deriveSubscriptionBanner(result: SubscriptionCheckResult, now: number = Date.now()): SubscriptionBanner | null {
  if (!result.known) return null;

  switch (result.status) {
    case "trialing": {
      if (!result.currentPeriodEnd) return null;
      const days = daysUntil(result.currentPeriodEnd, now);
      return { tone: "info", message: `Your free trial ends in ${days} day${days === 1 ? "" : "s"}.` };
    }

    case "active":
      return null;

    case "grace_period": {
      const graceEnd = result.gracePeriodEndsAt ? new Date(result.gracePeriodEndsAt).getTime() : null;
      if (graceEnd !== null && now > graceEnd) {
        return { tone: "danger", message: "Your QRBooker subscription has expired. Your account remains fully operational — please contact us to renew." };
      }
      if (graceEnd === null) {
        return { tone: "warning", message: "Payment is needed soon to avoid interruption. Please contact us to renew." };
      }
      const days = daysUntil(result.gracePeriodEndsAt!, now);
      return { tone: "warning", message: `Payment is needed within ${days} day${days === 1 ? "" : "s"} to avoid interruption. Please contact us to renew.` };
    }

    case "suspended":
      return { tone: "danger", message: "Your QRBooker subscription is suspended due to non-payment. This is informational only — your account remains fully operational. Please contact us to renew." };

    case "cancelled":
      return { tone: "danger", message: "Your QRBooker subscription has been cancelled. This is informational only — your account remains fully operational. Contact us if you'd like to reactivate." };

    default:
      return null;
  }
}
