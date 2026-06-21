import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const accountId =
    typeof body.accountId === "string" ? body.accountId.trim() : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : undefined;
  const amountMajor =
    typeof body.amount === "number"
      ? body.amount
      : typeof body.amount === "string"
        ? Number(body.amount)
        : NaN;

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return NextResponse.json(
      { error: "Amount must be a positive number." },
      { status: 400 }
    );
  }

  const amountCents = Math.round(amountMajor * 100);
  if (Math.abs(amountMajor * 100 - amountCents) > 1e-6) {
    return NextResponse.json(
      { error: "Amount can have at most 2 decimal places." },
      { status: 400 }
    );
  }

  try {
    // Instant payouts draw from the connected account's *instant_available*
    // balance, not the regular available balance.
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: accountId }
    );
    const instant = (balance.instant_available ?? []).find(
      (b) => b.currency === "usd"
    );

    if (!instant || instant.amount < amountCents) {
      const have = instant ? (instant.amount / 100).toFixed(2) : "0.00";
      const standard = (
        ((balance.available ?? []).find((b) => b.currency === "usd")?.amount ??
          0) / 100
      ).toFixed(2);
      return NextResponse.json(
        {
          error: `This connected account's instant-available balance is $${have} (standard available: $${standard}). Instant payouts can only use the instant-available balance — funds transferred in are not instantly payable.`,
        },
        { status: 400 }
      );
    }

    const payout = await stripe.payouts.create(
      {
        amount: amountCents,
        currency: "usd",
        method: "instant",
      },
      {
        stripeAccount: accountId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }
    );

    return NextResponse.json({
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      arrivalDate: payout.arrival_date,
      status: payout.status,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Instant payout failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
