import { stripe } from "@/lib/stripe";
import {
  listEntriesInRange,
  computeTotals,
  periodRange,
  monthRange,
  type Period,
} from "@/lib/ledger";
import { ledgerReportHtml } from "@/lib/ledgerHtml";
import PrintOnLoad from "../../PrintOnLoad";

export const metadata = {
  title: "Ledger report",
  robots: { index: false, follow: false },
};

export default async function LedgerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; month?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const accountId = sp.accountId?.trim() ?? "";
  const month = sp.month?.trim() ?? "";

  if (!accountId.startsWith("acct_")) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        A connected account must be selected.
      </div>
    );
  }

  const range = month
    ? monthRange(month)
    : periodRange(sp.period === "ytd" ? "ytd" : ("month" as Period));
  if (!range) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        Invalid month.
      </div>
    );
  }

  const account = await stripe.accounts.retrieve(accountId);
  const ownerName = String(
    account.business_profile?.name ||
      account.settings?.dashboard?.display_name ||
      account.email ||
      accountId
  );

  const entries = await listEntriesInRange(accountId, range.start, range.end);
  const totals = computeTotals(entries);

  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: "32px 16px" }}>
      <PrintOnLoad />
      <div
        dangerouslySetInnerHTML={{
          __html: ledgerReportHtml(
            ownerName,
            range.label,
            accountId,
            entries,
            totals
          ),
        }}
      />
    </div>
  );
}
