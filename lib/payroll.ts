import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

/* -------------------------------------------------------------------------- */
/*  Tax constants — 2026                                                       */
/*  Update annually against IRS Publication 15-T and Iowa DOR withholding.     */
/*  All amounts here are in DOLLARS (the bracket tables) except where noted.   */
/* -------------------------------------------------------------------------- */

// IRS Pub 15-T Annual Percentage Method, Standard Withholding Rate Schedules
// (Form W-4 from 2020 or later, Step 2 checkbox NOT checked). The standard
// deduction is already baked into these schedules (note the $0 first bracket).
// Each row: [annualWageOver, baseTax, marginalRate]. Amounts in dollars.
type FedBracket = [over: number, base: number, rate: number];

const FED_BRACKETS_2026_SINGLE: FedBracket[] = [
  [0, 0, 0],
  [6400, 0, 0.1],
  [18325, 1192.5, 0.12],
  [54875, 5578.5, 0.22],
  [109750, 17651.5, 0.24],
  [203700, 40199.5, 0.32],
  [256925, 57231.5, 0.35],
  [632750, 188769.25, 0.37],
];

const FED_BRACKETS_2026_MARRIED: FedBracket[] = [
  [0, 0, 0],
  [17100, 0, 0.1],
  [40950, 2385, 0.12],
  [114050, 11157, 0.22],
  [223800, 35302, 0.24],
  [411700, 80398, 0.32],
  [518150, 114456, 0.35],
  [768700, 202113.5, 0.37],
];

// Social Security wage base for 2026 (in dollars). 6.2% applies up to this.
const SS_WAGE_BASE_2026 = 184500;
const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145; // +0.9% additional Medicare over $200k is out of scope.

// Iowa moved to a flat individual income tax of 3.8% effective 2025.
export const IOWA_RATE = 0.038;

export const PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
} as const;

export type PayFrequency = keyof typeof PERIODS_PER_YEAR;
export type PayType = "hourly" | "salary";
export type FilingStatus = "single" | "married";

/* -------------------------------------------------------------------------- */
/*  Documents & serialized shapes                                              */
/* -------------------------------------------------------------------------- */

type EmployeeDoc = {
  _id?: ObjectId;
  name: string;
  email: string | null;
  payType: PayType;
  rateCents: number; // hourly: cents/hour. salary: cents/year.
  payFrequency: PayFrequency;
  filingStatus: FilingStatus;
  startDate: string; // YYYY-MM-DD — hire/effective date (backdateable)
  active: boolean;
  createdAt: Date;
};

export type Employee = {
  id: string;
  name: string;
  email: string | null;
  payType: PayType;
  rateCents: number;
  payFrequency: PayFrequency;
  filingStatus: FilingStatus;
  startDate: string;
  active: boolean;
  createdAt: string;
};

type PaycheckDoc = {
  _id?: ObjectId;
  employeeId: string;
  employeeName: string;
  payDate: string; // YYYY-MM-DD
  hours: number | null;
  grossCents: number;
  federalCents: number;
  ssCents: number;
  medicareCents: number;
  stateCents: number;
  netCents: number;
  createdAt: Date;
};

export type Paycheck = {
  id: string;
  employeeId: string;
  employeeName: string;
  payDate: string;
  hours: number | null;
  grossCents: number;
  federalCents: number;
  ssCents: number;
  medicareCents: number;
  stateCents: number;
  netCents: number;
  createdAt: string;
};

export type PaycheckBreakdown = {
  grossCents: number;
  federalCents: number;
  ssCents: number;
  medicareCents: number;
  stateCents: number;
  netCents: number;
};

/* -------------------------------------------------------------------------- */
/*  Collections + serializers                                                  */
/* -------------------------------------------------------------------------- */

async function employeesCol() {
  const db = await getDb();
  return db.collection<EmployeeDoc>("employees");
}

async function paychecksCol() {
  const db = await getDb();
  return db.collection<PaycheckDoc>("paychecks");
}

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function serializeEmployee(doc: EmployeeDoc): Employee {
  return {
    id: doc._id!.toString(),
    name: doc.name,
    email: doc.email,
    payType: doc.payType,
    rateCents: doc.rateCents,
    payFrequency: doc.payFrequency,
    filingStatus: doc.filingStatus,
    startDate: doc.startDate ?? "",
    active: doc.active,
    createdAt: iso(doc.createdAt),
  };
}

function serializePaycheck(doc: PaycheckDoc): Paycheck {
  return {
    id: doc._id!.toString(),
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    payDate: doc.payDate,
    hours: doc.hours,
    grossCents: doc.grossCents,
    federalCents: doc.federalCents,
    ssCents: doc.ssCents,
    medicareCents: doc.medicareCents,
    stateCents: doc.stateCents,
    netCents: doc.netCents,
    createdAt: iso(doc.createdAt),
  };
}

/* -------------------------------------------------------------------------- */
/*  Tax engine (pure functions, all cents in / cents out)                      */
/* -------------------------------------------------------------------------- */

export function grossForPeriod(
  employee: Pick<Employee, "payType" | "rateCents" | "payFrequency">,
  hours: number | null
): number {
  if (employee.payType === "salary") {
    return Math.round(employee.rateCents / PERIODS_PER_YEAR[employee.payFrequency]);
  }
  const h = hours ?? 0;
  return Math.round(employee.rateCents * h);
}

/**
 * Annual federal withholding via the IRS Pub 15-T percentage method, then
 * divided down to a single pay period. `annualWagesCents` is the period gross
 * annualized by the number of pay periods in the year.
 */
export function federalWithholding(
  annualWagesCents: number,
  filingStatus: FilingStatus,
  periodsPerYear: number
): number {
  const brackets =
    filingStatus === "married"
      ? FED_BRACKETS_2026_MARRIED
      : FED_BRACKETS_2026_SINGLE;
  const annualWages = annualWagesCents / 100;

  let row = brackets[0];
  for (const b of brackets) {
    if (annualWages >= b[0]) row = b;
    else break;
  }
  const [over, base, rate] = row;
  const annualTax = base + (annualWages - over) * rate;
  const perPeriod = (annualTax * 100) / periodsPerYear;
  return Math.max(0, Math.round(perPeriod));
}

export function socialSecurity(grossCents: number, ytdGrossCents: number): number {
  const capCents = SS_WAGE_BASE_2026 * 100;
  const remaining = Math.max(0, capCents - ytdGrossCents);
  const taxable = Math.min(grossCents, remaining);
  return Math.round(taxable * SS_RATE);
}

export function medicare(grossCents: number): number {
  return Math.round(grossCents * MEDICARE_RATE);
}

export function stateWithholding(grossCents: number): number {
  return Math.round(grossCents * IOWA_RATE);
}

export function computePaycheck(
  employee: Pick<
    Employee,
    "payType" | "rateCents" | "payFrequency" | "filingStatus"
  >,
  opts: { hours: number | null; ytdGrossCents: number }
): PaycheckBreakdown {
  const periodsPerYear = PERIODS_PER_YEAR[employee.payFrequency];
  const grossCents = grossForPeriod(employee, opts.hours);
  const annualWagesCents = grossCents * periodsPerYear;

  const federalCents = federalWithholding(
    annualWagesCents,
    employee.filingStatus,
    periodsPerYear
  );
  const ssCents = socialSecurity(grossCents, opts.ytdGrossCents);
  const medicareCents = medicare(grossCents);
  const stateCents = stateWithholding(grossCents);
  const netCents =
    grossCents - federalCents - ssCents - medicareCents - stateCents;

  return { grossCents, federalCents, ssCents, medicareCents, stateCents, netCents };
}

/* -------------------------------------------------------------------------- */
/*  Employee CRUD                                                              */
/* -------------------------------------------------------------------------- */

export async function listEmployees(): Promise<Employee[]> {
  const col = await employeesCol();
  const docs = await col.find({}).sort({ name: 1 }).toArray();
  return docs.map(serializeEmployee);
}

export async function getEmployee(id: string): Promise<Employee | null> {
  let _id: ObjectId;
  try {
    _id = new ObjectId(id);
  } catch {
    return null;
  }
  const col = await employeesCol();
  const doc = await col.findOne({ _id });
  return doc ? serializeEmployee(doc) : null;
}

export async function addEmployee(input: {
  name: string;
  email: string | null;
  payType: PayType;
  rateCents: number;
  payFrequency: PayFrequency;
  filingStatus: FilingStatus;
  startDate: string;
}): Promise<Employee> {
  const col = await employeesCol();
  const doc: EmployeeDoc = { ...input, active: true, createdAt: new Date() };
  const res = await col.insertOne(doc);
  return serializeEmployee({ ...doc, _id: res.insertedId });
}

export async function deleteEmployee(id: string): Promise<boolean> {
  let _id: ObjectId;
  try {
    _id = new ObjectId(id);
  } catch {
    return false;
  }
  const col = await employeesCol();
  const res = await col.deleteOne({ _id });
  return res.deletedCount === 1;
}

/* -------------------------------------------------------------------------- */
/*  Paychecks                                                                  */
/* -------------------------------------------------------------------------- */

export async function listPaychecks(filter: {
  employeeId?: string;
  month?: string; // YYYY-MM
  start?: string; // YYYY-MM-DD inclusive
  end?: string; // YYYY-MM-DD exclusive
}): Promise<Paycheck[]> {
  const col = await paychecksCol();
  const query: Record<string, unknown> = {};
  if (filter.employeeId) query.employeeId = filter.employeeId;
  if (filter.start && filter.end) {
    query.payDate = { $gte: filter.start, $lt: filter.end };
  } else if (filter.month && /^\d{4}-\d{2}$/.test(filter.month)) {
    query.payDate = { $regex: `^${filter.month}` };
  }
  const docs = await col
    .find(query)
    .sort({ payDate: -1, createdAt: -1 })
    .toArray();
  return docs.map(serializePaycheck);
}

export type ReportPeriod = "month" | "quarter" | "year";

/**
 * Resolve a report period to a lexicographic [start, end) date range plus a
 * display label. Works because payDate is zero-padded YYYY-MM-DD.
 */
export function payrollPeriodRange(
  period: ReportPeriod,
  opts: { year: number; month?: number; quarter?: number }
): { start: string; end: string; label: string } {
  const y = opts.year;
  if (period === "year") {
    return { start: `${y}-01-01`, end: `${y + 1}-01-01`, label: `${y}` };
  }
  if (period === "quarter") {
    const q = Math.min(4, Math.max(1, opts.quarter ?? 1));
    const startMonth = (q - 1) * 3 + 1; // 1, 4, 7, 10
    const endMonth = startMonth + 3; // 4, 7, 10, 13
    const start = `${y}-${String(startMonth).padStart(2, "0")}-01`;
    const end =
      endMonth > 12
        ? `${y + 1}-01-01`
        : `${y}-${String(endMonth).padStart(2, "0")}-01`;
    return { start, end, label: `Q${q} ${y}` };
  }
  const m = Math.min(12, Math.max(1, opts.month ?? 1));
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end =
    m >= 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const label = new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  return { start, end, label };
}

/**
 * The pay dates for a recurring schedule from `startDate` through `throughDate`
 * (both YYYY-MM-DD, inclusive). Used to back-fill catch-up paychecks.
 * - weekly/biweekly: every 7/14 days from the start date.
 * - semimonthly: the 15th and last day of each month.
 * - monthly: same day-of-month as the start date.
 */
export function payPeriodDates(
  frequency: PayFrequency,
  startDate: string,
  throughDate: string
): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const through = new Date(`${throughDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(through.getTime()) || start > through) {
    return out;
  }
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (frequency === "weekly" || frequency === "biweekly") {
    const step = frequency === "weekly" ? 7 : 14;
    const d = new Date(start);
    while (d <= through) {
      out.push(fmt(d));
      d.setUTCDate(d.getUTCDate() + step);
    }
  } else if (frequency === "monthly") {
    const d = new Date(start);
    while (d <= through) {
      out.push(fmt(d));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else {
    // semimonthly: 15th and last day of each month within range
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (;;) {
      const mid = new Date(Date.UTC(y, m, 15));
      const last = new Date(Date.UTC(y, m + 1, 0));
      for (const dt of [mid, last]) {
        if (dt >= start && dt <= through) out.push(fmt(dt));
      }
      if (
        y > through.getUTCFullYear() ||
        (y === through.getUTCFullYear() && m >= through.getUTCMonth())
      ) {
        break;
      }
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }
  return out;
}

export async function getPaycheck(id: string): Promise<Paycheck | null> {
  let _id: ObjectId;
  try {
    _id = new ObjectId(id);
  } catch {
    return null;
  }
  const col = await paychecksCol();
  const doc = await col.findOne({ _id });
  return doc ? serializePaycheck(doc) : null;
}

export async function addPaycheck(input: {
  employeeId: string;
  employeeName: string;
  payDate: string;
  hours: number | null;
  breakdown: PaycheckBreakdown;
}): Promise<Paycheck> {
  const col = await paychecksCol();
  const doc: PaycheckDoc = {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    payDate: input.payDate,
    hours: input.hours,
    ...input.breakdown,
    createdAt: new Date(),
  };
  const res = await col.insertOne(doc);
  return serializePaycheck({ ...doc, _id: res.insertedId });
}

export async function deletePaycheck(id: string): Promise<boolean> {
  let _id: ObjectId;
  try {
    _id = new ObjectId(id);
  } catch {
    return false;
  }
  const col = await paychecksCol();
  const res = await col.deleteOne({ _id });
  return res.deletedCount === 1;
}

/** Sum of gross pay already issued to an employee within a calendar year. */
export async function ytdGrossCents(
  employeeId: string,
  year: number
): Promise<number> {
  const col = await paychecksCol();
  const docs = await col
    .find({
      employeeId,
      payDate: { $gte: `${year}-01-01`, $lt: `${year + 1}-01-01` },
    })
    .toArray();
  return docs.reduce((sum, d) => sum + d.grossCents, 0);
}

export function computePaycheckTotals(paychecks: Paycheck[]) {
  return paychecks.reduce(
    (t, p) => ({
      grossCents: t.grossCents + p.grossCents,
      federalCents: t.federalCents + p.federalCents,
      ssCents: t.ssCents + p.ssCents,
      medicareCents: t.medicareCents + p.medicareCents,
      stateCents: t.stateCents + p.stateCents,
      netCents: t.netCents + p.netCents,
    }),
    {
      grossCents: 0,
      federalCents: 0,
      ssCents: 0,
      medicareCents: 0,
      stateCents: 0,
      netCents: 0,
    }
  );
}
