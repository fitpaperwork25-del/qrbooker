import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"] as string;
  const rawBody = await getRawBody(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { businessId, plan } = session.metadata ?? {};
        if (!businessId || !plan) break;

        const sub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        await supabase.from("businesses").update({
          plan,
          subscription_status:    "active",
          stripe_customer_id:     session.customer as string,
          stripe_subscription_id: session.subscription as string,
          current_period_end:     new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
        }).eq("id", businessId);

        // Auto-populate onboarding tracker
        const { data: bizData } = await supabase
          .from("businesses")
          .select("name")
          .eq("id", businessId)
          .single();

        await supabase.from("onboarding_clients").insert({
          business_name: bizData?.name ?? "Unknown",
          owner_email:   session.customer_details?.email ?? "",
          plan,
          status:        "registered",
          progress:      0,
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.parent?.subscription_details?.subscription as string;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        await supabase.from("businesses").update({
          subscription_status: "active",
          current_period_end:  new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
        }).eq("stripe_subscription_id", subId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.parent?.subscription_details?.subscription as string;
        if (!subId) break;
        await supabase.from("businesses")
          .update({ subscription_status: "past_due" })
          .eq("stripe_subscription_id", subId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from("businesses")
          .update({ subscription_status: "cancelled" })
          .eq("stripe_subscription_id", sub.id);
        break;
      }
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.json({ received: true });
}
