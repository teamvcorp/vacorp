import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { getResend, CONTACT_FROM } from "@/lib/resend";
import {
  listEntriesInRange,
  computeTotals,
  periodRange,
  monthRange,
  type Period,
} from "@/lib/ledger";
import { ledgerReportHtml, ledgerReportText } from "@/lib/ledgerHtml";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email is not configured (missing RESEND_API_KEY)." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const accountId =
    typeof body.accountId === "string" ? body.accountId.trim() : "";
  const month = typeof body.month === "string" ? body.month.trim() : "";

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }

  // A specific month takes precedence; otherwise fall back to the period toggle.
  const range = month
    ? monthRange(month)
    : periodRange(body.period === "ytd" ? "ytd" : ("month" as Period));
  if (!range) {
    return NextResponse.json(
      { error: "Please provide a valid month (YYYY-MM)." },
      { status: 400 }
    );
  }

  try {
    // The only Stripe touch: pull the owner's name + email for the report.
    const account = await stripe.accounts.retrieve(accountId);
    const ownerEmail = account.email ?? null;
    const ownerName = String(
      account.business_profile?.name ||
        account.settings?.dashboard?.display_name ||
        ownerEmail ||
        accountId
    );

    const entries = await listEntriesInRange(accountId, range.start, range.end);
    const totals = computeTotals(entries);

    const adminEmail = session.user?.email ?? null;
    const recipients = Array.from(
      new Set([ownerEmail, adminEmail].filter((e): e is string => !!e))
    );

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No recipient email available for this account." },
        { status: 400 }
      );
    }

    const { error } = await getResend().emails.send({
      from: CONTACT_FROM,
      to: recipients,
      subject: `Ledger report — ${ownerName} (${range.label})`,
      text: ledgerReportText(ownerName, range.label, entries, totals),
      html: ledgerReportHtml(ownerName, range.label, accountId, entries, totals),
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to send report." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, recipients });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
