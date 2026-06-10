import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { getResend, CONTACT_FROM } from "@/lib/resend";
import {
  listEntries,
  computeTotals,
  periodRange,
  type Period,
} from "@/lib/ledger";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  const period: Period = body.period === "ytd" ? "ytd" : "month";

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }

  try {
    // The only Stripe touch: pull the owner's name + email for the report.
    const account = await stripe.accounts.retrieve(accountId);
    const ownerEmail = account.email ?? null;
    const ownerName =
      account.business_profile?.name ||
      account.settings?.dashboard?.display_name ||
      ownerEmail ||
      accountId;

    const { label } = periodRange(period);
    const entries = await listEntries(accountId, period);
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

    const rows = entries.length
      ? entries
          .map(
            (e) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${e.date}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(e.description)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-transform:capitalize">${e.type}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:${
            e.type === "payment" ? "#047857" : "#b91c1c"
          }">${e.type === "payment" ? "+" : "−"}${money(e.amountCents)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b">No entries for this period.</td></tr>`;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 4px">Ledger report — ${escapeHtml(String(ownerName))}</h2>
        <p style="margin:0 0 16px;color:#475569">${escapeHtml(label)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="text-align:left;background:#f1f5f9">
              <th style="padding:8px">Date</th>
              <th style="padding:8px">Note</th>
              <th style="padding:8px">Type</th>
              <th style="padding:8px;text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <table style="width:100%;margin-top:16px;font-size:14px">
          <tr><td style="padding:4px 8px;color:#475569">Total payments</td><td style="padding:4px 8px;text-align:right;color:#047857">+${money(totals.payments)}</td></tr>
          <tr><td style="padding:4px 8px;color:#475569">Total debts</td><td style="padding:4px 8px;text-align:right;color:#b91c1c">−${money(totals.debts)}</td></tr>
          <tr><td style="padding:8px;font-weight:700;border-top:2px solid #0f172a">Balance</td><td style="padding:8px;text-align:right;font-weight:700;border-top:2px solid #0f172a">${money(totals.balance)}</td></tr>
        </table>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8">Sent from VA Corp admin · ${escapeHtml(accountId)}</p>
      </div>`;

    const text =
      `Ledger report — ${ownerName} (${label})\n\n` +
      entries
        .map(
          (e) =>
            `${e.date}  ${e.type === "payment" ? "+" : "−"}${money(
              e.amountCents
            )}  ${e.description}`
        )
        .join("\n") +
      `\n\nTotal payments: +${money(totals.payments)}\n` +
      `Total debts: −${money(totals.debts)}\n` +
      `Balance: ${money(totals.balance)}`;

    const { error } = await getResend().emails.send({
      from: CONTACT_FROM,
      to: recipients,
      subject: `Ledger report — ${ownerName} (${label})`,
      text,
      html,
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
