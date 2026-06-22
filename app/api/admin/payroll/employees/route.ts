import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  PERIODS_PER_YEAR,
  type EmployeeInput,
  type PayType,
  type PayFrequency,
  type FilingStatus,
} from "@/lib/payroll";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + normalize an employee payload. Returns the input or an error. */
function parseEmployee(
  body: Record<string, unknown>
): { input: EmployeeInput } | { error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw || null;
  const payType: PayType = body.payType === "salary" ? "salary" : "hourly";
  const payFrequency =
    typeof body.payFrequency === "string" && body.payFrequency in PERIODS_PER_YEAR
      ? (body.payFrequency as PayFrequency)
      : "biweekly";
  const filingStatus: FilingStatus =
    body.filingStatus === "married" ? "married" : "single";
  const startDate =
    typeof body.startDate === "string" ? body.startDate.trim() : "";
  const dob = typeof body.dob === "string" ? body.dob.trim() : "";
  const address =
    typeof body.address === "string" ? body.address.trim().slice(0, 300) : "";
  const ssnLast4 = (
    typeof body.ssnLast4 === "string" ? body.ssnLast4 : ""
  ).replace(/\D/g, "");
  const rateMajor =
    typeof body.rate === "number"
      ? body.rate
      : typeof body.rate === "string"
        ? Number(body.rate)
        : NaN;

  if (!name) return { error: "Employee name is required." };
  if (!DATE_RE.test(startDate)) {
    return { error: "Please provide a valid start date." };
  }
  if (dob && !DATE_RE.test(dob)) {
    return { error: "Please provide a valid date of birth." };
  }
  if (ssnLast4 && ssnLast4.length !== 4) {
    return { error: "SSN must be the last 4 digits only." };
  }
  if (!Number.isFinite(rateMajor) || rateMajor <= 0) {
    return {
      error:
        payType === "salary"
          ? "Annual salary must be a positive number."
          : "Hourly rate must be a positive number.",
    };
  }
  const rateCents = Math.round(rateMajor * 100);
  if (Math.abs(rateMajor * 100 - rateCents) > 1e-6) {
    return { error: "Rate can have at most 2 decimal places." };
  }

  return {
    input: {
      name: name.slice(0, 200),
      email,
      payType,
      rateCents,
      payFrequency,
      filingStatus,
      startDate,
      ssnLast4,
      dob,
      address,
    },
  };
}

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

  const parsed = parseEmployee(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const employee = await addEmployee(parsed.input);
    return NextResponse.json({ employee });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save employee.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Missing employee id." }, { status: 400 });
  }

  const parsed = parseEmployee(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const employee = await updateEmployee(id, parsed.input);
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ employee });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update employee.";
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
