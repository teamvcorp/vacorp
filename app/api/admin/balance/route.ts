import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, isStripeTestMode } from "@/lib/stripe";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const balance = await stripe.balance.retrieve();

    return NextResponse.json({
      testMode: isStripeTestMode,
      available: balance.available.map((b) => ({
        amount: b.amount,
        currency: b.currency,
      })),
      pending: balance.pending.map((b) => ({
        amount: b.amount,
        currency: b.currency,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load balance.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
