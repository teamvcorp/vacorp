import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";

type TransferBody = {
  destination?: unknown;
  amount?: unknown; // amount in major units (e.g. dollars)
  currency?: unknown;
  description?: unknown;
  idempotencyKey?: unknown;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TransferBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const destination =
    typeof body.destination === "string" ? body.destination.trim() : "";
  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toLowerCase()
      : "usd";
  const description =
    typeof body.description === "string" ? body.description.trim() : undefined;
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : undefined;

  // amount comes in as major units (dollars); convert to the smallest unit.
  const amountMajor =
    typeof body.amount === "number"
      ? body.amount
      : typeof body.amount === "string"
        ? Number(body.amount)
        : NaN;

  if (!destination.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A valid connected account id (acct_...) is required." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return NextResponse.json(
      { error: "Amount must be a positive number." },
      { status: 400 }
    );
  }

  // Guard against floating-point dust; only allow 2 decimal places.
  const amountMinor = Math.round(amountMajor * 100);
  if (Math.abs(amountMajor * 100 - amountMinor) > 1e-6) {
    return NextResponse.json(
      { error: "Amount can have at most 2 decimal places." },
      { status: 400 }
    );
  }

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: amountMinor,
        currency,
        destination,
        ...(description ? { description } : {}),
      },
      // Idempotency key prevents an accidental double-submit from sending twice.
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return NextResponse.json({
      id: transfer.id,
      amount: transfer.amount,
      currency: transfer.currency,
      destination: transfer.destination,
      created: transfer.created,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transfer failed.";
    // Stripe surfaces actionable messages (insufficient funds, capability, etc.)
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
