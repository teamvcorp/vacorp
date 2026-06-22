import type { Employee, Paycheck, PaycheckBreakdown } from "./payroll";
import { computePaycheckTotals } from "./payroll";

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

export const EMPLOYER_NAME = "VA Corp";

/** Last (family) name from a full-name string. */
export function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : fullName;
}

/** Masked SSN display from the stored last 4 digits, e.g. •••-••-1234. */
export function ssnDisplay(last4: string): string {
  return last4 ? `•••-••-${last4}` : "—";
}

/** A single paycheck stub as a standalone HTML fragment (used for email + print). */
export function stubHtml(p: Paycheck, employee?: Employee | null): string {
  const line = (label: string, value: string, negative = false) => `
    <tr>
      <td style="padding:6px 8px;color:#475569">${escapeHtml(label)}</td>
      <td style="padding:6px 8px;text-align:right;color:${
        negative ? "#b91c1c" : "#0f172a"
      }">${negative ? "−" : ""}${value}</td>
    </tr>`;

  const detail = (label: string, value: string) =>
    value
      ? `<div><span style="color:#94a3b8">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>`
      : "";

  const employeeDetails = `
    <div style="margin:0 0 16px;font-size:13px;color:#334155;line-height:1.5">
      <div style="font-weight:600;color:#0f172a">${escapeHtml(p.employeeName)}</div>
      ${detail("SSN", ssnDisplay(employee?.ssnLast4 ?? ""))}
      ${detail("DOB", employee?.dob ?? "")}
      ${employee?.address ? `<div><span style="color:#94a3b8">Address:</span> ${escapeHtml(employee.address).replace(/\n/g, "<br/>")}</div>` : ""}
      <div><span style="color:#94a3b8">Pay date:</span> ${escapeHtml(p.payDate)}</div>
    </div>`;

  return `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
    <h2 style="margin:0 0 12px">${escapeHtml(EMPLOYER_NAME)} — Paycheck stub</h2>
    ${employeeDetails}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${line("Gross pay", money(p.grossCents))}
      <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:2px"></td></tr>
      ${line("Federal withholding", money(p.federalCents), true)}
      ${line("Social Security (6.2%)", money(p.ssCents), true)}
      ${line("Medicare (1.45%)", money(p.medicareCents), true)}
      ${line("Iowa state (3.8%)", money(p.stateCents), true)}
      <tr>
        <td style="padding:8px;font-weight:700;border-top:2px solid #0f172a">Net pay</td>
        <td style="padding:8px;text-align:right;font-weight:700;border-top:2px solid #0f172a">${money(p.netCents)}</td>
      </tr>
    </table>
    ${
      p.hours != null
        ? `<p style="margin-top:12px;font-size:12px;color:#94a3b8">${p.hours} hours</p>`
        : ""
    }
  </div>`;
}

/** Payroll report table (all paychecks for a period) as a standalone HTML fragment. */
export function monthlyReportHtml(
  periodLabel: string,
  paychecks: Paycheck[],
  employees: Employee[] = []
): string {
  const totals: PaycheckBreakdown = computePaycheckTotals(paychecks);
  const byId = new Map(employees.map((e) => [e.id, e]));

  const rows = paychecks.length
    ? paychecks
        .map((p) => {
          const emp = byId.get(p.employeeId);
          const lastName = lastNameOf(emp?.name ?? p.employeeName);
          return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(p.payDate)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(lastName)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(ssnDisplay(emp?.ssnLast4 ?? ""))}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${money(p.grossCents)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">${money(p.federalCents)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">${money(p.ssCents)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">${money(p.medicareCents)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">${money(p.stateCents)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${money(p.netCents)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#1d4ed8">${money(p.ssCents)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#1d4ed8">${money(p.medicareCents)}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="11" style="padding:16px;text-align:center;color:#64748b">No paychecks for this period.</td></tr>`;

  // Employer (company) match: Social Security 6.2% + Medicare 1.45%, matched 1:1
  // with the employee withholding, so the company amounts equal the employee
  // SS/Medicare totals. State income tax is employee-only (no employer match).
  const employerSsCents = totals.ssCents;
  const employerMedicareCents = totals.medicareCents;
  const employerTotalCents = employerSsCents + employerMedicareCents;
  const totalPayrollCostCents = totals.grossCents + employerTotalCents;

  return `
  <div style="font-family:system-ui,sans-serif;max-width:820px;margin:0 auto;color:#0f172a">
    <h2 style="margin:0 0 4px">${escapeHtml(EMPLOYER_NAME)} — Payroll report</h2>
    <p style="margin:0 0 16px;color:#475569">${escapeHtml(periodLabel)} · ${paychecks.length} paycheck${paychecks.length === 1 ? "" : "s"}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="text-align:left;background:#f1f5f9">
          <th style="padding:8px" colspan="3"></th>
          <th style="padding:8px;text-align:center" colspan="6">Employee</th>
          <th style="padding:8px;text-align:center;background:#eff6ff;color:#1d4ed8" colspan="2">Company match</th>
        </tr>
        <tr style="text-align:left;background:#f1f5f9">
          <th style="padding:8px">Pay date</th>
          <th style="padding:8px">Last name</th>
          <th style="padding:8px">SSN</th>
          <th style="padding:8px;text-align:right">Gross</th>
          <th style="padding:8px;text-align:right">Federal</th>
          <th style="padding:8px;text-align:right">Soc. Sec.</th>
          <th style="padding:8px;text-align:right">Medicare</th>
          <th style="padding:8px;text-align:right">State</th>
          <th style="padding:8px;text-align:right">Net</th>
          <th style="padding:8px;text-align:right;background:#eff6ff;color:#1d4ed8">Co. SS</th>
          <th style="padding:8px;text-align:right;background:#eff6ff;color:#1d4ed8">Co. Med.</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="font-weight:700;border-top:2px solid #0f172a">
          <td style="padding:8px" colspan="3">Totals</td>
          <td style="padding:8px;text-align:right">${money(totals.grossCents)}</td>
          <td style="padding:8px;text-align:right">${money(totals.federalCents)}</td>
          <td style="padding:8px;text-align:right">${money(totals.ssCents)}</td>
          <td style="padding:8px;text-align:right">${money(totals.medicareCents)}</td>
          <td style="padding:8px;text-align:right">${money(totals.stateCents)}</td>
          <td style="padding:8px;text-align:right">${money(totals.netCents)}</td>
          <td style="padding:8px;text-align:right;background:#eff6ff;color:#1d4ed8">${money(employerSsCents)}</td>
          <td style="padding:8px;text-align:right;background:#eff6ff;color:#1d4ed8">${money(employerMedicareCents)}</td>
        </tr>
      </tfoot>
    </table>

    <table style="width:100%;max-width:360px;margin-top:20px;font-size:13px;border-collapse:collapse">
      <tr><td colspan="2" style="padding:6px 8px;font-weight:700;border-bottom:1px solid #e2e8f0">Company payroll taxes (employer portion)</td></tr>
      <tr><td style="padding:4px 8px;color:#475569">Social Security match (6.2%)</td><td style="padding:4px 8px;text-align:right">${money(employerSsCents)}</td></tr>
      <tr><td style="padding:4px 8px;color:#475569">Medicare match (1.45%)</td><td style="padding:4px 8px;text-align:right">${money(employerMedicareCents)}</td></tr>
      <tr><td style="padding:6px 8px;font-weight:700;border-top:1px solid #0f172a">Total employer tax</td><td style="padding:6px 8px;text-align:right;font-weight:700;border-top:1px solid #0f172a">${money(employerTotalCents)}</td></tr>
      <tr><td style="padding:6px 8px;font-weight:700;border-top:2px solid #0f172a">Total payroll cost (gross + employer tax)</td><td style="padding:6px 8px;text-align:right;font-weight:700;border-top:2px solid #0f172a">${money(totalPayrollCostCents)}</td></tr>
    </table>

    <p style="margin-top:24px;font-size:12px;color:#94a3b8">Sent from ${escapeHtml(EMPLOYER_NAME)} admin · withholding estimates, not tax advice. State income tax is employee-only (no employer match); FUTA/SUTA unemployment taxes are not included.</p>
  </div>`;
}
