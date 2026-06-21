import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { getResend, CONTACT_FROM } from "@/lib/resend";
import { SITE_URL, SITE_NAME } from "@/lib/site";

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
  const overrideEmail =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : "";

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }

  try {
    // Retrieve the account first: its onboarding state decides which link type
    // Stripe will accept, and it gives us the fallback email recipient.
    const account = await stripe.accounts.retrieve(accountId);

    // `account_update` is only valid once onboarding is complete
    // (details_submitted). Before that, Stripe only allows `account_onboarding`,
    // which RESUMES the hosted flow and — with collection_options currently_due —
    // collects just the outstanding requirements (e.g. the debit card) without
    // restarting or discarding anything the owner already entered.
    const onboarded = account.details_submitted === true;
    const mode = onboarded ? "update" : "onboarding";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: onboarded ? "account_update" : "account_onboarding",
      collection_options: { fields: "currently_due" },
      refresh_url: `${SITE_URL}/payout-setup?reauth=true`,
      return_url: `${SITE_URL}/payout-setup?success=true`,
    });

    // Figure out who to email: explicit override, else the account's email.
    const to = overrideEmail || account.email || "";

    const action = onboarded
      ? "add your debit card"
      : "finish setting up payouts (including your debit card)";
    const cta = onboarded ? "Add my debit card" : "Finish payout setup";

    let emailed = false;
    if (to && process.env.RESEND_API_KEY) {
      const { error } = await getResend().emails.send({
        from: CONTACT_FROM,
        to,
        subject: `Set up instant payouts with ${SITE_NAME}`,
        text:
          `Hi,\n\n${SITE_NAME} can send you instant payouts to a debit card. ` +
          `Please ${action} here (link expires soon):\n\n${accountLink.url}\n\n` +
          `If the link has expired, ask us to send a new one.`,
        html: `
          <div style="font-family:system-ui,sans-serif;line-height:1.6;color:#0f172a">
            <h2 style="margin:0 0 8px">Set up instant payouts</h2>
            <p>${SITE_NAME} can send you <strong>instant payouts</strong> to a debit card.
            Please ${action} using the secure Stripe link below.</p>
            <p style="margin:24px 0">
              <a href="${accountLink.url}"
                 style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:9999px;text-decoration:none;font-weight:600">
                ${cta}
              </a>
            </p>
            <p style="font-size:13px;color:#64748b">This link expires shortly. If it
            no longer works, ask us to send a new one.</p>
          </div>`,
      });
      emailed = !error;
    }

    return NextResponse.json({
      url: accountLink.url,
      mode,
      emailed,
      to: to || null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create setup link.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
