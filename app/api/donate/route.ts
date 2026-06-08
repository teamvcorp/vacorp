import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

type DonateBody = {
  amount?: unknown; // major units (dollars)
  recurring?: unknown; // boolean -> monthly
  name?: unknown;
  email?: unknown;
};

// Reasonable guardrails for a public donation endpoint.
const MIN_DOLLARS = 1;
const MAX_DOLLARS = 100000;

function getOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const origin = request.headers.get("origin");
  if (origin) return origin;

  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export async function POST(request: Request) {
  let body: DonateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const recurring = body.recurring === true;
  const amountMajor =
    typeof body.amount === "number"
      ? body.amount
      : typeof body.amount === "string"
        ? Number(body.amount)
        : NaN;

  if (!Number.isFinite(amountMajor) || amountMajor < MIN_DOLLARS) {
    return NextResponse.json(
      { error: `Please enter an amount of at least $${MIN_DOLLARS}.` },
      { status: 400 }
    );
  }
  if (amountMajor > MAX_DOLLARS) {
    return NextResponse.json(
      { error: "For gifts this large, please contact us directly." },
      { status: 400 }
    );
  }

  const amountMinor = Math.round(amountMajor * 100);
  if (Math.abs(amountMajor * 100 - amountMinor) > 1e-6) {
    return NextResponse.json(
      { error: "Amount can have at most 2 decimal places." },
      { status: 400 }
    );
  }

  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : undefined;
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : undefined;

  const origin = getOrigin(request);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: recurring ? "subscription" : "payment",
      // "donate" tweaks the Checkout button copy; only valid in payment mode.
      ...(recurring ? {} : { submit_type: "donate" as const }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountMinor,
            product_data: {
              name: recurring
                ? "Monthly donation to VA Corp"
                : "Donation to VA Corp",
              description:
                "Supporting equality & sustainability in housing, education, and healthcare.",
            },
            ...(recurring
              ? { recurring: { interval: "month" as const } }
              : {}),
          },
        },
      ],
      ...(email ? { customer_email: email } : {}),
      metadata: {
        kind: "donation",
        recurring: String(recurring),
        donor_name: name ?? "",
      },
      success_url: `${origin}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/donate?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
