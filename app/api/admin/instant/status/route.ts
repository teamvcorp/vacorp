import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { refreshAccountEligibility } from "@/lib/connectedAccounts";

function usd(arr: Array<{ amount: number; currency: string }> | undefined) {
  return arr?.find((b) => b.currency === "usd")?.amount ?? 0;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId")?.trim() ?? "";

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }

  try {
    const flags = await refreshAccountEligibility(accountId);

    // Connected account's own balance — instant payouts draw from this account,
    // and specifically from instant_available (separate from `available`).
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: accountId }
    );

    // Describe the instant-eligible payout destination (for "To: …" clarity).
    const externals = await stripe.accounts.listExternalAccounts(accountId, {
      limit: 100,
    });
    const instantEa = externals.data.find((ea) =>
      ea.available_payout_methods?.includes("instant")
    );
    let destination: { type: "card" | "bank"; label: string } | null = null;
    if (instantEa) {
      if (instantEa.object === "card") {
        destination = {
          type: "card",
          label: `${instantEa.brand ?? "Card"} ••${instantEa.last4}`,
        };
      } else if (instantEa.object === "bank_account") {
        destination = {
          type: "bank",
          label: `${instantEa.bank_name ?? "Bank"} ••${instantEa.last4}`,
        };
      }
    }

    return NextResponse.json({
      ...flags,
      balance: {
        available: usd(balance.available),
        instantAvailable: usd(balance.instant_available),
        pending: usd(balance.pending),
      },
      destination,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to check eligibility.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
