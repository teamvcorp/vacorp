import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";

type TransferBody = {
  destination?: unknown;
  amount?: unknown; // amount in major units (e.g. dollars)
  amountCents?: unknown; // exact integer cents — preferred for computed amounts
  currency?: unknown;
  description?: unknown;
  idempotencyKey?: unknown;
  metadata?: unknown; // audit trail (e.g. which revenue period a payout covers)
};

/**
 * Sanitize caller-supplied metadata to Stripe's limits (50 keys, 40-char
 * keys, 500-char values). Only flat string values pass through — metadata is
 * an audit trail, not a data store.
 */
function cleanMetadata(input: unknown): Record<string, string> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= 20) break;
    if (typeof value !== "string" && typeof value !== "number") continue;
    out[key.slice(0, 40)] = String(value).slice(0, 500);
    count += 1;
  }
  return count > 0 ? out : undefined;
}

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

  if (!destination.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A valid connected account id (acct_...) is required." },
      { status: 400 }
    );
  }

  // Two ways in: exact integer cents (computed amounts, e.g. the Revenue
  // tab's "owed" figure — no float round-trip), or major units from a form.
  let amountMinor: number;
  if (body.amountCents !== undefined) {
    if (
      typeof body.amountCents !== "number" ||
      !Number.isInteger(body.amountCents) ||
      body.amountCents <= 0
    ) {
      return NextResponse.json(
        { error: "amountCents must be a positive integer." },
        { status: 400 }
      );
    }
    amountMinor = body.amountCents;
  } else {
    const amountMajor =
      typeof body.amount === "number"
        ? body.amount
        : typeof body.amount === "string"
          ? Number(body.amount)
          : NaN;

    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number." },
        { status: 400 }
      );
    }

    // Guard against floating-point dust; only allow 2 decimal places.
    amountMinor = Math.round(amountMajor * 100);
    if (Math.abs(amountMajor * 100 - amountMinor) > 1e-6) {
      return NextResponse.json(
        { error: "Amount can have at most 2 decimal places." },
        { status: 400 }
      );
    }
  }

  const metadata = cleanMetadata(body.metadata);

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: amountMinor,
        currency,
        destination,
        ...(description ? { description } : {}),
        ...(metadata ? { metadata } : {}),
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
