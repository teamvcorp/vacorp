import type { LedgerEntry } from "./ledger";

type Totals = { payments: number; debts: number; balance: number };

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ledger report as a standalone HTML fragment (used for email + print). */
export function ledgerReportHtml(
  ownerName: string,
  label: string,
  accountId: string,
  entries: LedgerEntry[],
  totals: Totals
): string {
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

  return `
      <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 4px">Ledger report — ${escapeHtml(ownerName)}</h2>
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
        <p style="margin-top:24px;font-size:12px;color:#94a3b8">VA Corp admin · ${escapeHtml(accountId)}</p>
      </div>`;
}

/** Plain-text version of the ledger report (email fallback). */
export function ledgerReportText(
  ownerName: string,
  label: string,
  entries: LedgerEntry[],
  totals: Totals
): string {
  return (
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
    `Balance: ${money(totals.balance)}`
  );
}
