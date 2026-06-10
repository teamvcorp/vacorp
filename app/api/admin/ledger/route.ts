import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listEntries,
  addEntry,
  deleteEntry,
  computeTotals,
  type Period,
  type LedgerType,
} from "@/lib/ledger";

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
  const period = parsePeriod(searchParams.get("period"));

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json(
      { error: "A connected account must be selected." },
      { status: 400 }
    );
  }

  try {
    const entries = await listEntries(accountId, period);
    return NextResponse.json({
      entries,
      totals: computeTotals(entries),
      period,
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

  try {
    const entry = await addEntry({
      accountId,
      type,
      amountCents,
      description: description.slice(0, 500),
      date,
    });
    return NextResponse.json({ entry });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save entry.";
    return NextResponse.json({ error: message }, { status: 500 });
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
