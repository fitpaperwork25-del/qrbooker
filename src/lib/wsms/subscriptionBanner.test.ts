import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSubscriptionBanner } from "./subscriptionBanner.ts";

const NOW = new Date("2026-07-20T00:00:00Z").getTime();

test("unknown result never shows a banner", () => {
  assert.equal(deriveSubscriptionBanner({ known: false, active: null, status: null }, NOW), null);
});

test("active shows no banner", () => {
  assert.equal(deriveSubscriptionBanner({ known: true, active: true, status: "active" }, NOW), null);
});

test("trialing shows an info banner with days remaining", () => {
  const banner = deriveSubscriptionBanner({ known: true, active: true, status: "trialing", currentPeriodEnd: "2026-07-25T00:00:00Z" }, NOW);
  assert.equal(banner?.tone, "info");
  assert.match(banner!.message, /5 days/);
});

test("grace period before its own end date shows a warning, not danger", () => {
  const banner = deriveSubscriptionBanner({ known: true, active: true, status: "grace_period", gracePeriodEndsAt: "2026-07-23T00:00:00Z" }, NOW);
  assert.equal(banner?.tone, "warning");
  assert.match(banner!.message, /3 days/);
});

test("grace period past its own end date shows danger (display-only expired)", () => {
  const banner = deriveSubscriptionBanner({ known: true, active: true, status: "grace_period", gracePeriodEndsAt: "2026-07-18T00:00:00Z" }, NOW);
  assert.equal(banner?.tone, "danger");
  assert.match(banner!.message, /expired/i);
});

test("suspended is informational, not blocking language", () => {
  const banner = deriveSubscriptionBanner({ known: true, active: false, status: "suspended" }, NOW);
  assert.equal(banner?.tone, "danger");
  assert.match(banner!.message, /informational only/i);
  assert.match(banner!.message, /fully operational/i);
});

test("cancelled is also informational, not blocking language", () => {
  const banner = deriveSubscriptionBanner({ known: true, active: false, status: "cancelled" }, NOW);
  assert.equal(banner?.tone, "danger");
  assert.match(banner!.message, /informational only/i);
});
