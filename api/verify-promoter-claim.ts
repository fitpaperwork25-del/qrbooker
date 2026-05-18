import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = "fitpaperwork25@gmail.com";
const FROM = "QRServe <onboarding@qrserve.app>";

const COMMISSION: Record<string, number> = {
  starter:    49,
  pro:        99,
  enterprise: 199,
};

async function hasActiveStripeSubscription(email: string): Promise<boolean> {
  const customers = await stripe.customers.list({ email, limit: 5 });
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1,
    });
    if (subs.data.length > 0) return true;
  }
  return false;
}

const TALLY_LABEL_MAP: Record<string, string> = {
  "full name":          "promoter_name",
  "email address":      "promoter_email",
  "restaurant email":   "restaurant_email",
  "plan signed up for": "plan",
  "payment method":     "payment_method",
  "payment details":    "payment_details",
  "date of sale":       "date_of_sale",
};

// Fields with null labels identified by their Tally key
const TALLY_KEY_MAP: Record<string, string> = {
  "question_dPZDlo": "restaurant_email",
};

interface TallyField {
  label: string | null;
  key:   string;
  type:  string;
  value: any;
  options?: { id: string; text: string }[];
}

function parseTallyFields(body: any): Record<string, string> {
  const fields: TallyField[] = body?.data?.fields ?? [];
  const result: Record<string, string> = {};

  for (const field of fields) {
    const internalKey =
      (field.key && TALLY_KEY_MAP[field.key]) ||
      (field.label && TALLY_LABEL_MAP[field.label.toLowerCase().trim()]);

    if (!internalKey) continue;

    let value = field.value;
    if (value == null || value === "") continue;

    // Resolve DROPDOWN UUID array to the matching option text
    if (field.type === "DROPDOWN" && Array.isArray(value) && field.options) {
      const matched = field.options.find((o) => value.includes(o.id));
      value = matched?.text ?? "";
    }

    if (!value) continue;

    // For plan, keep only the name before " - " and lowercase (e.g. "Starter - $49/mo" → "starter")
    if (internalKey === "plan") {
      value = String(value).split(" - ")[0].trim().toLowerCase();
    }

    result[internalKey] = String(value);
  }

  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const raw = req.body as Record<string, any>;
  console.log("RAW BODY:", JSON.stringify(raw, null, 2));

  // Prefer direct fields; fall back to Tally array format if they're missing
  const tally = (
    !raw.promoter_name && !raw.promoter_email && !raw.restaurant_email
  ) ? parseTallyFields(raw) : {};

  const promoter_name    = raw.promoter_name    || tally.promoter_name    || "";
  const promoter_email   = raw.promoter_email   || tally.promoter_email   || "";
  const restaurant_email = raw.restaurant_email || tally.restaurant_email || "";
  const plan             = raw.plan             || tally.plan             || "";
  const payment_method   = raw.payment_method   || tally.payment_method   || undefined;
  const payment_details  = raw.payment_details  || tally.payment_details  || undefined;
  const date_of_sale     = raw.date_of_sale     || tally.date_of_sale     || undefined;

  if (!promoter_name || !promoter_email || !restaurant_email || !plan) {
    return res.status(400).json({ error: "promoter_name, promoter_email, restaurant_email, and plan are required" });
  }

  const planKey = plan.toLowerCase();
  const commission_amount = COMMISSION[planKey] ?? 0;

  let verified = false;
  try {
    verified = await hasActiveStripeSubscription(restaurant_email);
  } catch (err: any) {
    console.error("Stripe lookup error:", err.message);
  }

  const status = verified ? "approved" : "pending";

  try {
    const { error: dbError } = await supabase.from("promoter_claims").insert({
      promoter_name,
      promoter_email,
      restaurant_email,
      plan,
      commission_amount,
      status,
      payment_method:  payment_method  ?? null,
      payment_details: payment_details ?? null,
      date_of_sale:    date_of_sale    ?? null,
    });

    if (dbError) {
      console.error("Supabase insert error:", dbError.message);
      return res.status(500).json({ error: dbError.message });
    }
  } catch (err: any) {
    console.error("DB error:", err.message);
    return res.status(500).json({ error: err.message });
  }

  if (verified) {
    // Notify admin
    await resend.emails.send({
      from:    FROM,
      to:      ADMIN_EMAIL,
      subject: "New Verified Promoter Claim",
      html: `
        <p><strong>New verified promoter claim has been submitted and approved.</strong></p>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td><strong>Promoter Name</strong></td><td>${promoter_name}</td></tr>
          <tr><td><strong>Promoter Email</strong></td><td>${promoter_email}</td></tr>
          <tr><td><strong>Restaurant Email</strong></td><td>${restaurant_email}</td></tr>
          <tr><td><strong>Plan</strong></td><td>${plan}</td></tr>
          <tr><td><strong>Commission</strong></td><td>$${commission_amount}</td></tr>
          <tr><td><strong>Payment Method</strong></td><td>${payment_method ?? "—"}</td></tr>
          <tr><td><strong>Payment Details</strong></td><td>${payment_details ?? "—"}</td></tr>
          <tr><td><strong>Date of Sale</strong></td><td>${date_of_sale ?? "—"}</td></tr>
        </table>
      `,
    });

    // Notify promoter
    await resend.emails.send({
      from:    FROM,
      to:      promoter_email,
      subject: "Your QRServe Promoter Claim is Approved",
      html: `
        <p>Hi ${promoter_name},</p>
        <p>Great news — your promoter claim for <strong>${restaurant_email}</strong> (${plan} plan) has been <strong>verified and approved</strong>.</p>
        <p>Your commission of <strong>$${commission_amount}</strong> will be sent to you within <strong>10 days</strong> via ${payment_method ?? "your specified payment method"}.</p>
        <p>Payment details on file: ${payment_details ?? "—"}</p>
        <p>Thank you for growing QRServe!</p>
        <p style="color:#888;font-size:12px;">— The QRServe Team</p>
      `,
    });
  } else {
    // Notify promoter — pending
    await resend.emails.send({
      from:    FROM,
      to:      promoter_email,
      subject: "Your QRServe Promoter Claim is Pending",
      html: `
        <p>Hi ${promoter_name},</p>
        <p>We received your promoter claim for <strong>${restaurant_email}</strong>, but we weren't able to verify an active subscription for that restaurant yet.</p>
        <p>This usually means the restaurant's payment hasn't cleared yet. Please <strong>resubmit your claim in a few days</strong> once their subscription is active.</p>
        <p>If you believe this is an error, feel free to reply to this email.</p>
        <p style="color:#888;font-size:12px;">— The QRServe Team</p>
      `,
    });
  }

  return res.json({ success: true, status });
}
