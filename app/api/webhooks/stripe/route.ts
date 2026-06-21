import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { refreshAccountEligibility } from "@/lib/connectedAccounts";

// Stripe needs the raw request body to verify the signature.
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return NextResponse.json(
      { error: `Webhook error: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    try {
      // Recompute eligibility (payouts enabled + debit card) and cache to Mongo.
      const flags = await refreshAccountEligibility(
        account.id,
        account.payouts_enabled ?? undefined
      );
      if (flags.instantEligible) {
        console.log(`✅ ${account.id} is eligible for instant payouts`);
      }
    } catch (err) {
      console.error("Failed to refresh eligibility for", account.id, err);
      // Still 200 so Stripe doesn't retry forever on a transient DB hiccup.
    }
  }

  return NextResponse.json({ received: true });
}
