import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getEmployee,
  listPaychecks,
  addPaycheck,
  ytdGrossCents,
  computePaycheck,
  payPeriodDates,
} from "@/lib/payroll";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Back-fill catch-up paychecks for an employee from their start date through a
 * given date, one per scheduled pay period. Skips any pay dates that already
 * have a paycheck, and processes chronologically so the Social Security
 * wage-base cap is applied correctly across the year.
 */
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

  const employeeId =
    typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const through = typeof body.through === "string" ? body.through.trim() : "";
  const hoursRaw =
    typeof body.hours === "number"
      ? body.hours
      : typeof body.hours === "string" && body.hours.trim() !== ""
        ? Number(body.hours)
        : null;

  if (!employeeId) {
    return NextResponse.json({ error: "Select an employee." }, { status: 400 });
  }
  if (!DATE_RE.test(through)) {
    return NextResponse.json(
      { error: "Provide a valid 'through' date." },
      { status: 400 }
    );
  }

  try {
    const employee = await getEmployee(employeeId);
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }
    if (!DATE_RE.test(employee.startDate)) {
      return NextResponse.json(
        { error: "Employee has no valid start date." },
        { status: 400 }
      );
    }

    let hours: number | null = null;
    if (employee.payType === "hourly") {
      if (hoursRaw === null || !Number.isFinite(hoursRaw) || hoursRaw <= 0) {
        return NextResponse.json(
          { error: "Hours per pay period are required for hourly employees." },
          { status: 400 }
        );
      }
      hours = hoursRaw;
    }

    const dates = payPeriodDates(
      employee.payFrequency,
      employee.startDate,
      through
    );

    // Skip pay dates that already have a paycheck for this employee.
    const existing = await listPaychecks({ employeeId });
    const existingDates = new Set(existing.map((p) => p.payDate));

    const created: string[] = [];
    for (const payDate of dates) {
      if (existingDates.has(payDate)) continue;
      const year = Number(payDate.slice(0, 4));
      const ytd = await ytdGrossCents(employeeId, year);
      const breakdown = computePaycheck(employee, {
        hours,
        ytdGrossCents: ytd,
      });
      await addPaycheck({
        employeeId,
        employeeName: employee.name,
        payDate,
        hours,
        breakdown,
      });
      created.push(payDate);
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      skipped: dates.length - created.length,
      dates: created,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate back pay.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
