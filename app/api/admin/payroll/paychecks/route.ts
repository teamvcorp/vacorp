import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listPaychecks,
  addPaycheck,
  deletePaycheck,
  getEmployee,
  ytdGrossCents,
  computePaycheck,
  payrollPeriodRange,
  type ReportPeriod,
} from "@/lib/payroll";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId")?.trim() || undefined;
  const month = searchParams.get("month")?.trim() || undefined;
  const periodParam = searchParams.get("period")?.trim();
  const yearParam = searchParams.get("year")?.trim();
  const quarterParam = searchParams.get("quarter")?.trim();

  try {
    let start: string | undefined;
    let end: string | undefined;
    if (periodParam === "quarter" || periodParam === "year") {
      const now = new Date();
      const period = periodParam as ReportPeriod;
      const year =
        yearParam && /^\d{4}$/.test(yearParam)
          ? Number(yearParam)
          : now.getFullYear();
      const quarter = quarterParam ? Number(quarterParam) : 1;
      const range = payrollPeriodRange(period, { year, quarter });
      start = range.start;
      end = range.end;
    } else if (month && MONTH_RE.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const range = payrollPeriodRange("month", { year: y, month: m });
      start = range.start;
      end = range.end;
    }

    const paychecks = await listPaychecks({ employeeId, start, end });
    return NextResponse.json({ paychecks });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load paychecks.";
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

  const employeeId =
    typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const payDate = typeof body.payDate === "string" ? body.payDate.trim() : "";
  const hoursRaw =
    typeof body.hours === "number"
      ? body.hours
      : typeof body.hours === "string" && body.hours.trim() !== ""
        ? Number(body.hours)
        : null;

  if (!employeeId) {
    return NextResponse.json(
      { error: "Select an employee." },
      { status: 400 }
    );
  }
  if (!DATE_RE.test(payDate)) {
    return NextResponse.json(
      { error: "Please provide a valid pay date." },
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

    let hours: number | null = null;
    if (employee.payType === "hourly") {
      if (hoursRaw === null || !Number.isFinite(hoursRaw) || hoursRaw <= 0) {
        return NextResponse.json(
          { error: "Hours worked must be a positive number." },
          { status: 400 }
        );
      }
      hours = hoursRaw;
    }

    const year = Number(payDate.slice(0, 4));
    const ytd = await ytdGrossCents(employeeId, year);
    const breakdown = computePaycheck(employee, { hours, ytdGrossCents: ytd });

    const paycheck = await addPaycheck({
      employeeId,
      employeeName: employee.name,
      payDate,
      hours,
      breakdown,
    });
    return NextResponse.json({ paycheck });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate paycheck.";
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
  if (!id) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const ok = await deletePaycheck(id);
    if (!ok) {
      return NextResponse.json(
        { error: "Paycheck not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete paycheck.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
