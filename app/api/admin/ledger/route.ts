import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { getResend, CONTACT_FROM } from "@/lib/resend";
import {
  listEntriesInRange,
  addEntry,
  deleteEntry,
  computeTotals,
  periodRange,
  monthRange,
  type Period,
  type LedgerType,
} from "@/lib/ledger";
import { paymentReceiptHtml, paymentReceiptText } from "@/lib/ledgerHtml";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePeriod(value: string | null): Period {
  return value === "ytd" ? "ytd" : "month";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId")?.trim() ?? "";
  const month = searchParams.get("month")?.trim() ?? "";

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }

  // A specific month takes precedence; otherwise fall back to the period toggle.
  const period = parsePeriod(searchParams.get("period"));
  const range = month ? monthRange(month) : periodRange(period);
  if (!range) {
    return NextResponse.json(
      { error: "Please provide a valid month (YYYY-MM)." },
      { status: 400 }
    );
  }

  try {
    const entries = await listEntriesInRange(accountId, range.start, range.end);
    return NextResponse.json({
      entries,
      totals: computeTotals(entries),
      period: month ? "month" : period,
      label: range.label,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load ledger.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
  const type = body.type === "debt" ? "debt" : ("payment" as LedgerType);
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const emailReceipt = body.emailReceipt === true;
  const receiptEmail =
    typeof body.receiptEmail === "string" ? body.receiptEmail.trim() : "";
  const amountMajor =
    typeof body.amount === "number"
      ? body.amount
      : typeof body.amount === "string"
        ? Number(body.amount)
        : NaN;

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }
  if (!description) {
    return NextResponse.json(
      { error: "Please add a note describing the entry." },
      { status: 400 }
    );
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "Please provide a valid date." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return NextResponse.json(
      { error: "Amount must be a positive number." },
      { status: 400 }
    );
  }

  const amountCents = Math.round(amountMajor * 100);
  if (Math.abs(amountMajor * 100 - amountCents) > 1e-6) {
    return NextResponse.json(
      { error: "Amount can have at most 2 decimal places." },
      { status: 400 }
    );
  }

  let entry;
  try {
    entry = await addEntry({
      accountId,
      type,
      amountCents,
      description: description.slice(0, 500),
      date,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Receipts are payments-only and opt-in. Best-effort: the entry is already
  // saved, so any email failure is reported but never fails the request.
  if (type !== "payment" || !emailReceipt) {
    return NextResponse.json({ entry });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      entry,
      receipt: { sent: false, error: "Email is not configured." },
    });
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const ownerEmail = account.email ?? null;
    const ownerName = String(
      account.business_profile?.name ||
        account.settings?.dashboard?.display_name ||
        ownerEmail ||
        accountId
    );

    const payerEmail =
      receiptEmail && EMAIL_RE.test(receiptEmail) ? receiptEmail : null;
    const recipients = Array.from(
      new Set(
        [ownerEmail, payerEmail].filter((e): e is string => !!e)
      )
    );

    if (recipients.length === 0) {
      return NextResponse.json({
        entry,
        receipt: {
          sent: false,
          error: "No recipient email available for this account.",
        },
      });
    }

    const { error } = await getResend().emails.send({
      from: CONTACT_FROM,
      to: recipients,
      subject: `Payment receipt — ${ownerName}`,
      text: paymentReceiptText(ownerName, entry),
      html: paymentReceiptHtml(ownerName, entry, accountId),
    });

    if (error) {
      return NextResponse.json({
        entry,
        receipt: { sent: false, error: error.message || "Failed to send receipt." },
      });
    }

    return NextResponse.json({ entry, receipt: { sent: true, recipients } });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send receipt.";
    return NextResponse.json({ entry, receipt: { sent: false, error: message } });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  const accountId = searchParams.get("accountId")?.trim() ?? "";

  if (!id || !accountId.startsWith("acct_")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const ok = await deleteEntry(accountId, id);
    if (!ok) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
