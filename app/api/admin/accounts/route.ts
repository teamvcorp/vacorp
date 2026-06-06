import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await stripe.accounts.list({ limit: 100 });

    const data = accounts.data.map((acct) => ({
      id: acct.id,
      label:
        acct.business_profile?.name ||
        acct.settings?.dashboard?.display_name ||
        acct.email ||
        acct.id,
      email: acct.email ?? null,
      country: acct.country ?? null,
      currency: acct.default_currency ?? null,
      payoutsEnabled: acct.payouts_enabled,
      chargesEnabled: acct.charges_enabled,
      transfersActive:
        acct.capabilities?.transfers === "active",
    }));

    return NextResponse.json({ accounts: data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load connected accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
