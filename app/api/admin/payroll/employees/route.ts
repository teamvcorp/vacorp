import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listEmployees,
  addEmployee,
  deleteEmployee,
  PERIODS_PER_YEAR,
  type PayType,
  type PayFrequency,
  type FilingStatus,
} from "@/lib/payroll";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const employees = await listEmployees();
    return NextResponse.json({ employees });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load employees.";
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw || null;
  const payType: PayType = body.payType === "salary" ? "salary" : "hourly";
  const payFrequency =
    typeof body.payFrequency === "string" &&
    body.payFrequency in PERIODS_PER_YEAR
      ? (body.payFrequency as PayFrequency)
      : "biweekly";
  const filingStatus: FilingStatus =
    body.filingStatus === "married" ? "married" : "single";
  const startDate =
    typeof body.startDate === "string" ? body.startDate.trim() : "";
  const rateMajor =
    typeof body.rate === "number"
      ? body.rate
      : typeof body.rate === "string"
        ? Number(body.rate)
        : NaN;

  if (!name) {
    return NextResponse.json(
      { error: "Employee name is required." },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json(
      { error: "Please provide a valid start date." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(rateMajor) || rateMajor <= 0) {
    return NextResponse.json(
      {
        error:
          payType === "salary"
            ? "Annual salary must be a positive number."
            : "Hourly rate must be a positive number.",
      },
      { status: 400 }
    );
  }

  const rateCents = Math.round(rateMajor * 100);
  if (Math.abs(rateMajor * 100 - rateCents) > 1e-6) {
    return NextResponse.json(
      { error: "Rate can have at most 2 decimal places." },
      { status: 400 }
    );
  }

  try {
    const employee = await addEmployee({
      name: name.slice(0, 200),
      email,
      payType,
      rateCents,
      payFrequency,
      filingStatus,
      startDate,
    });
    return NextResponse.json({ employee });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save employee.";
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
    const ok = await deleteEmployee(id);
    if (!ok) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete employee.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
