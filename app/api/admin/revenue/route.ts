import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripeReporting, isStripeTestMode } from "@/lib/stripe";
import { buildRevenueReport } from "@/lib/shopRevenue";

export const dynamic = "force-dynamic";

/** Cap the window so one request can't walk an unbounded history. */
const MAX_RANGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * GET /api/admin/revenue?start=<unix>&end=<unix>
 * GET /api/admin/revenue?payout=po_...
 *
 * Per-shop revenue from balance transactions (see TRANSFER_APP_INTEGRATION.md).
 *
 * Time boundaries are computed by the CLIENT in its local timezone and sent
 * as unix seconds — the server never guesses day boundaries. (UTC windows
 * once made "today" start at 19:00 local, reading revenue as zero after 7pm.)
 *
 * Payout mode is the reconcilable one: Σ net of a payout's rows equals the
 * actual bank deposit, so that split is defensible against a statement.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const payoutId = sp.get("payout");

  try {
    if (payoutId) {
      if (!/^po_[A-Za-z0-9]+$/.test(payoutId)) {
        return NextResponse.json({ error: "Invalid payout id." }, { status: 400 });
      }
      const payout = await stripeReporting.payouts.retrieve(payoutId);
      const report = await buildRevenueReport(stripeReporting, {
        mode: "payout",
        payoutId,
      });

      // Reconciliation: Σ net of the payout's revenue + platform rows
      // (excluding the payout's own negative row, if Stripe includes it)
      // should equal payout.amount exactly.
      const payoutOwnNet = report.platform
        .filter((p) => p.type.startsWith("payout"))
        .reduce((sum, p) => sum + p.netCents, 0);
      const reconciledNetCents = report.totals.allRowsNetCents - payoutOwnNet;

      return NextResponse.json({
        testMode: isStripeTestMode,
        mode: "payout",
        payout: {
          id: payout.id,
          amountCents: payout.amount,
          currency: payout.currency,
          status: payout.status,
          arrivalDate: payout.arrival_date,
          created: payout.created,
        },
        reconciliation: {
          reconciledNetCents,
          payoutAmountCents: payout.amount,
          deltaCents: reconciledNetCents - payout.amount,
          ties: reconciledNetCents === payout.amount,
        },
        report,
      });
    }

    const start = Number(sp.get("start"));
    const end = Number(sp.get("end"));
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= start) {
      return NextResponse.json(
        { error: "Provide start and end as unix seconds (start < end), or a payout id." },
        { status: 400 }
      );
    }
    if (end - start > MAX_RANGE_SECONDS) {
      return NextResponse.json(
        { error: "Range too large — maximum 400 days per report." },
        { status: 400 }
      );
    }

    const report = await buildRevenueReport(stripeReporting, {
      mode: "range",
      startUnix: start,
      endUnix: end,
    });

    return NextResponse.json({
      testMode: isStripeTestMode,
      mode: "range",
      period: { startUnix: start, endUnix: end },
      report,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build revenue report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
