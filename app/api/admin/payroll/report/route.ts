import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getResend, CONTACT_FROM } from "@/lib/resend";
import {
  listPaychecks,
  listEmployees,
  getPaycheck,
  getEmployee,
  payrollPeriodRange,
  type ReportPeriod,
} from "@/lib/payroll";
import {
  stubHtml,
  monthlyReportHtml,
  money,
  EMPLOYER_NAME,
} from "@/lib/payrollHtml";

const MONTH_RE = /^\d{4}-\d{2}$/;

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

  const adminEmail = session.user?.email ?? null;
  const paycheckId =
    typeof body.paycheckId === "string" ? body.paycheckId.trim() : "";
  const month = typeof body.month === "string" ? body.month.trim() : "";

  try {
    // ---- Single paycheck stub email ----
    if (paycheckId) {
      const paycheck = await getPaycheck(paycheckId);
      if (!paycheck) {
        return NextResponse.json(
          { error: "Paycheck not found." },
          { status: 404 }
        );
      }
      const employee = await getEmployee(paycheck.employeeId);
      const recipients = Array.from(
        new Set(
          [employee?.email ?? null, adminEmail].filter(
            (e): e is string => !!e
          )
        )
      );
      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "No recipient email available." },
          { status: 400 }
        );
      }

      const { error } = await getResend().emails.send({
        from: CONTACT_FROM,
        to: recipients,
        subject: `Paycheck stub — ${paycheck.employeeName} (${paycheck.payDate})`,
        text: `${EMPLOYER_NAME} paycheck stub for ${paycheck.employeeName}\nPay date: ${paycheck.payDate}\nGross: ${money(paycheck.grossCents)}\nNet: ${money(paycheck.netCents)}`,
        html: stubHtml(paycheck, employee),
      });
      if (error) {
        return NextResponse.json(
          { error: error.message || "Failed to send stub." },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, recipients });
    }

    // ---- Period report email (month / quarter / year) ----
    if (!adminEmail) {
      return NextResponse.json(
        { error: "No admin email available to send the report." },
        { status: 400 }
      );
    }

    const now = new Date();
    let range: { start: string; end: string; label: string };

    if (MONTH_RE.test(month)) {
      const [y, m] = month.split("-").map(Number);
      range = payrollPeriodRange("month", { year: y, month: m });
    } else {
      const period: ReportPeriod =
        body.period === "quarter" || body.period === "year"
          ? (body.period as ReportPeriod)
          : "month";
      const year =
        typeof body.year === "number"
          ? body.year
          : typeof body.year === "string" && /^\d{4}$/.test(body.year)
            ? Number(body.year)
            : now.getFullYear();
      const quarter =
        typeof body.quarter === "number"
          ? body.quarter
          : typeof body.quarter === "string"
            ? Number(body.quarter)
            : Math.floor(now.getMonth() / 3) + 1;
      range = payrollPeriodRange(period, {
        year,
        month: now.getMonth() + 1,
        quarter,
      });
    }

    const [paychecks, employees] = await Promise.all([
      listPaychecks({ start: range.start, end: range.end }),
      listEmployees(),
    ]);
    const { error } = await getResend().emails.send({
      from: CONTACT_FROM,
      to: [adminEmail],
      subject: `Payroll report — ${range.label}`,
      text: `${EMPLOYER_NAME} payroll report for ${range.label}: ${paychecks.length} paycheck(s).`,
      html: monthlyReportHtml(range.label, paychecks, employees),
    });
    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to send report." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, recipients: [adminEmail] });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
