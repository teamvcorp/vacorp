import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripeReporting, isStripeTestMode } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/revenue/payouts — recent platform payouts, for the
 * payout-based reconciliation selector. A payout is what actually hit the
 * bank, so it's the only figure checkable against a statement.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payouts = await stripeReporting.payouts.list({ limit: 20 });
    return NextResponse.json({
      testMode: isStripeTestMode,
      payouts: payouts.data.map((p) => ({
        id: p.id,
        amountCents: p.amount,
        currency: p.currency,
        status: p.status,
        arrivalDate: p.arrival_date,
        created: p.created,
        automatic: p.automatic,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load payouts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
