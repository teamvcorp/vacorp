import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshAccountEligibility } from "@/lib/connectedAccounts";

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
    return NextResponse.json(flags);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to check eligibility.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
