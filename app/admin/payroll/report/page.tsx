import {
  listPaychecks,
  listEmployees,
  payrollPeriodRange,
  type ReportPeriod,
} from "@/lib/payroll";
import { monthlyReportHtml } from "@/lib/payrollHtml";
import PrintOnLoad from "../../PrintOnLoad";

export const metadata = {
  title: "Payroll report",
  robots: { index: false, follow: false },
};

function resolveRange(sp: {
  period?: string;
  year?: string;
  quarter?: string;
  month?: string;
}) {
  const now = new Date();

  // Legacy / month picker support: ?month=YYYY-MM
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split("-").map(Number);
    return payrollPeriodRange("month", { year: y, month: m });
  }

  const period: ReportPeriod =
    sp.period === "quarter" || sp.period === "year" ? sp.period : "month";
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : now.getFullYear();
  const quarter = sp.quarter ? Number(sp.quarter) : Math.floor(now.getMonth() / 3) + 1;
  const month = now.getMonth() + 1;

  return payrollPeriodRange(period, { year, month, quarter });
}

export default async function PayrollReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    year?: string;
    quarter?: string;
    month?: string;
  }>;
}) {
  const sp = await searchParams;
  const { start, end, label } = resolveRange(sp);
  const [paychecks, employees] = await Promise.all([
    listPaychecks({ start, end }),
    listEmployees(),
  ]);

  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: "32px 16px" }}>
      <PrintOnLoad />
      <div
        dangerouslySetInnerHTML={{
          __html: monthlyReportHtml(label, paychecks, employees),
        }}
      />
    </div>
  );
}
