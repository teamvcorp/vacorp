"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PayType = "hourly" | "salary";
type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
type FilingStatus = "single" | "married";
type ReportPeriod = "month" | "quarter" | "year";

type Employee = {
  id: string;
  name: string;
  email: string | null;
  payType: PayType;
  rateCents: number;
  payFrequency: PayFrequency;
  filingStatus: FilingStatus;
  startDate: string;
  ssnLast4: string;
  dob: string;
  address: string;
  active: boolean;
};

type Paycheck = {
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
};

const FREQ_LABEL: Record<PayFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  semimonthly: "Semi-monthly",
  monthly: "Monthly",
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function thisYear() {
  return String(new Date().getFullYear());
}

function thisQuarter() {
  return String(Math.floor(new Date().getMonth() / 3) + 1);
}

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500";
const labelCls = "mb-1 block text-xs text-slate-400";

export default function PayrollConsole() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Report period controls (drives both the on-screen table and the report)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("month");
  const [reportMonth, setReportMonth] = useState(thisMonth());
  const [reportYear, setReportYear] = useState(thisYear());
  const [reportQuarter, setReportQuarter] = useState(thisQuarter());

  // Add/edit-employee form (most staff are salaried + monthly)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [payType, setPayType] = useState<PayType>("salary");
  const [rate, setRate] = useState("");
  const [payFrequency, setPayFrequency] = useState<PayFrequency>("monthly");
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [startDate, setStartDate] = useState(todayISO());
  const [ssnLast4, setSsnLast4] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [savingEmp, setSavingEmp] = useState(false);

  function resetEmployeeForm() {
    setEditingId(null);
    setName("");
    setEmail("");
    setPayType("salary");
    setRate("");
    setPayFrequency("monthly");
    setFilingStatus("single");
    setStartDate(todayISO());
    setSsnLast4("");
    setDob("");
    setAddress("");
  }

  function startEdit(emp: Employee) {
    setEditingId(emp.id);
    setName(emp.name);
    setEmail(emp.email ?? "");
    setPayType(emp.payType);
    setRate((emp.rateCents / 100).toString());
    setPayFrequency(emp.payFrequency);
    setFilingStatus(emp.filingStatus);
    setStartDate(emp.startDate || todayISO());
    setSsnLast4(emp.ssnLast4 ?? "");
    setDob(emp.dob ?? "");
    setAddress(emp.address ?? "");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Run-paycheck form
  const [runEmployeeId, setRunEmployeeId] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [hours, setHours] = useState("");
  const [running, setRunning] = useState(false);

  // Back-pay (catch-up) form
  const [backThrough, setBackThrough] = useState(todayISO());
  const [backfilling, setBackfilling] = useState(false);

  const runEmployee = useMemo(
    () => employees.find((e) => e.id === runEmployeeId) ?? null,
    [employees, runEmployeeId]
  );

  // Query params for the selected report period, shared by the table fetch,
  // the print-report link, and the email-report request.
  const reportParams = useCallback(() => {
    const p = new URLSearchParams();
    if (reportPeriod === "month") {
      p.set("month", reportMonth);
    } else if (reportPeriod === "quarter") {
      p.set("period", "quarter");
      p.set("year", reportYear);
      p.set("quarter", reportQuarter);
    } else {
      p.set("period", "year");
      p.set("year", reportYear);
    }
    return p;
  }, [reportPeriod, reportMonth, reportYear, reportQuarter]);

  const reportLabel = useMemo(() => {
    if (reportPeriod === "month") {
      const [y, m] = reportMonth.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
    if (reportPeriod === "quarter") return `Q${reportQuarter} ${reportYear}`;
    return reportYear;
  }, [reportPeriod, reportMonth, reportYear, reportQuarter]);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payroll/employees");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load employees.");
      setEmployees(json.employees);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees.");
    }
  }, []);

  const loadPaychecks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/payroll/paychecks?${reportParams().toString()}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load paychecks.");
      setPaychecks(json.paychecks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load paychecks.");
    }
  }, [reportParams]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadPaychecks();
  }, [loadPaychecks]);

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setSavingEmp(true);
    const payload = {
      name,
      email,
      payType,
      rate,
      payFrequency,
      filingStatus,
      startDate,
      ssnLast4,
      dob,
      address,
      ...(editingId ? { id: editingId } : {}),
    };
    try {
      const res = await fetch("/api/admin/payroll/employees", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save employee.");
      setMsg(editingId ? "Employee updated." : "Employee added.");
      resetEmployeeForm();
      loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save employee.");
    } finally {
      setSavingEmp(false);
    }
  }

  async function removeEmployee(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll/employees?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete employee.");
      }
      loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete employee.");
    }
  }

  async function runPaycheck(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!runEmployeeId) {
      setError("Select an employee.");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/admin/payroll/paychecks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: runEmployeeId, payDate, hours }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate paycheck.");
      setHours("");
      const p: Paycheck = json.paycheck;
      setMsg(
        `Paycheck for ${p.employeeName}: gross ${money(p.grossCents)}, net ${money(
          p.netCents
        )}.`
      );
      loadPaychecks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate paycheck.");
    } finally {
      setRunning(false);
    }
  }

  async function generateBackPay() {
    setError(null);
    setMsg(null);
    if (!runEmployeeId) {
      setError("Select an employee first.");
      return;
    }
    setBackfilling(true);
    try {
      const res = await fetch("/api/admin/payroll/paychecks/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: runEmployeeId,
          through: backThrough,
          hours,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate back pay.");
      setMsg(
        `Back pay: created ${json.created} paycheck(s)${
          json.skipped ? `, skipped ${json.skipped} already existing` : ""
        }.`
      );
      loadPaychecks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate back pay.");
    } finally {
      setBackfilling(false);
    }
  }

  async function removePaycheck(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll/paychecks?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete paycheck.");
      }
      loadPaychecks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete paycheck.");
    }
  }

  async function emailStub(id: string) {
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/payroll/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paycheckId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to email stub.");
      setMsg(`Stub emailed to ${(json.recipients || []).join(", ")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to email stub.");
    }
  }

  async function emailReport() {
    setError(null);
    setMsg(null);
    try {
      const body: Record<string, string> = {};
      reportParams().forEach((v, k) => {
        body[k] = v;
      });
      const res = await fetch("/api/admin/payroll/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to email report.");
      setMsg(`Report emailed to ${(json.recipients || []).join(", ")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to email report.");
    }
  }

  const totals = useMemo(
    () =>
      paychecks.reduce(
        (t, p) => ({
          gross: t.gross + p.grossCents,
          federal: t.federal + p.federalCents,
          ss: t.ss + p.ssCents,
          medicare: t.medicare + p.medicareCents,
          state: t.state + p.stateCents,
          net: t.net + p.netCents,
        }),
        { gross: 0, federal: 0, ss: 0, medicare: 0, state: 0, net: 0 }
      ),
    [paychecks]
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {msg}
        </div>
      )}

      {/* Add / edit employee */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          {editingId ? "Edit employee" : "Add employee"}
        </h3>
        <form onSubmit={saveEmployee} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-950 p-1 sm:w-64">
            <button
              type="button"
              onClick={() => setPayType("hourly")}
              className={`rounded-md py-1.5 text-sm font-semibold transition ${
                payType === "hourly"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Hourly
            </button>
            <button
              type="button"
              onClick={() => setPayType("salary")}
              className={`rounded-md py-1.5 text-sm font-semibold transition ${
                payType === "salary"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Salary
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>
                {payType === "salary" ? "Annual salary ($)" : "Hourly rate ($/hr)"}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={payType === "salary" ? "60000.00" : "20.00"}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Pay frequency</label>
              <select
                value={payFrequency}
                onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}
                className={inputCls}
              >
                {(Object.keys(FREQ_LABEL) as PayFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Filing status</label>
              <select
                value={filingStatus}
                onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
                className={inputCls}
              >
                <option value="single">Single</option>
                <option value="married">Married filing jointly</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Start date (hire / effective)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Date of birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>SSN (last 4)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={ssnLast4}
                onChange={(e) =>
                  setSsnLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="1234"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="123 Main St, City, IA 50000"
              className={inputCls}
            />
          </div>

          <p className="text-xs text-slate-500">
            Start date can be backdated for existing staff (e.g. 2026-01-01) to
            enable catch-up back pay. We store only the last 4 SSN digits.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingEmp}
              className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {savingEmp
                ? "Saving…"
                : editingId
                  ? "Update employee"
                  : "Add employee"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetEmployeeForm}
                className="rounded-lg border border-slate-600 px-5 py-2 font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {employees.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Rate</th>
                  <th className="py-2 pr-4 font-medium">Frequency</th>
                  <th className="py-2 pr-4 font-medium">Filing</th>
                  <th className="py-2 pr-4 font-medium">Start</th>
                  <th className="py-2 pr-4 font-medium">SSN</th>
                  <th className="py-2 pr-4 font-medium">DOB</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-t border-slate-800/60">
                    <td className="py-2 pr-4 text-slate-200">{emp.name}</td>
                    <td className="py-2 pr-4 capitalize text-slate-400">
                      {emp.payType}
                    </td>
                    <td className="py-2 pr-4 text-slate-300">
                      {money(emp.rateCents)}
                      {emp.payType === "hourly" ? "/hr" : "/yr"}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {FREQ_LABEL[emp.payFrequency]}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {emp.filingStatus === "married" ? "Married" : "Single"}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {emp.startDate || "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {emp.ssnLast4 ? `•••-••-${emp.ssnLast4}` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">{emp.dob || "—"}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(emp)}
                        className="mr-3 text-xs text-blue-400 transition hover:text-blue-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeEmployee(emp.id)}
                        className="text-xs text-slate-500 transition hover:text-rose-400"
                        title="Delete employee"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Run paycheck */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Generate paycheck
        </h3>
        <form
          onSubmit={runPaycheck}
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        >
          <div>
            <label className={labelCls}>Employee</label>
            <select
              value={runEmployeeId}
              onChange={(e) => setRunEmployeeId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select an employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.payType})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Pay date</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Hours</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder={runEmployee?.payType === "salary" ? "n/a" : "80"}
              disabled={runEmployee?.payType === "salary"}
              className={`${inputCls} disabled:opacity-50`}
            />
          </div>
          <button
            type="submit"
            disabled={running}
            className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {running ? "Generating…" : "Generate"}
          </button>
        </form>

        {/* Back pay (catch-up) */}
        <div className="mt-5 border-t border-slate-800 pt-5">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Generate back pay (catch-up)
          </h4>
          <p className="mb-3 text-xs text-slate-500">
            Creates one paycheck per pay period from the selected employee&apos;s
            start date through the date below, skipping any that already exist.
            {runEmployee?.payType === "hourly"
              ? " Uses the Hours value above for each period."
              : ""}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Through date</label>
              <input
                type="date"
                value={backThrough}
                onChange={(e) => setBackThrough(e.target.value)}
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={generateBackPay}
              disabled={backfilling}
              className="rounded-lg border border-slate-600 px-5 py-2 font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
            >
              {backfilling ? "Generating…" : "Generate back pay"}
            </button>
          </div>
        </div>
      </section>

      {/* Paychecks + monthly report */}
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Paychecks · {reportLabel}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Annual</option>
            </select>

            {reportPeriod === "month" && (
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
              />
            )}
            {reportPeriod === "quarter" && (
              <>
                <select
                  value={reportQuarter}
                  onChange={(e) => setReportQuarter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="1">Q1 (Jan–Mar)</option>
                  <option value="2">Q2 (Apr–Jun)</option>
                  <option value="3">Q3 (Jul–Sep)</option>
                  <option value="4">Q4 (Oct–Dec)</option>
                </select>
                <input
                  type="number"
                  value={reportYear}
                  onChange={(e) => setReportYear(e.target.value)}
                  className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </>
            )}
            {reportPeriod === "year" && (
              <input
                type="number"
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
                className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
              />
            )}

            <a
              href={`/admin/payroll/report?${reportParams().toString()}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Print report
            </a>
            <button
              onClick={emailReport}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Email report
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2 font-medium">Pay date</th>
                <th className="px-5 py-2 font-medium">Employee</th>
                <th className="px-5 py-2 text-right font-medium">Gross</th>
                <th className="px-5 py-2 text-right font-medium">Federal</th>
                <th className="px-5 py-2 text-right font-medium">SS</th>
                <th className="px-5 py-2 text-right font-medium">Medicare</th>
                <th className="px-5 py-2 text-right font-medium">State</th>
                <th className="px-5 py-2 text-right font-medium">Net</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {paychecks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
                    No paychecks for this period.
                  </td>
                </tr>
              ) : (
                paychecks.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-800/60 hover:bg-slate-800/30"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-slate-300">
                      {p.payDate}
                    </td>
                    <td className="px-5 py-3 text-slate-200">{p.employeeName}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-slate-200">
                      {money(p.grossCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-rose-300">
                      {money(p.federalCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-rose-300">
                      {money(p.ssCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-rose-300">
                      {money(p.medicareCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-rose-300">
                      {money(p.stateCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-emerald-300">
                      {money(p.netCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <a
                        href={`/admin/payroll/stub/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-xs text-blue-400 transition hover:text-blue-300"
                      >
                        Print
                      </a>
                      <button
                        onClick={() => emailStub(p.id)}
                        className="mr-3 text-xs text-blue-400 transition hover:text-blue-300"
                      >
                        Email
                      </button>
                      <button
                        onClick={() => removePaycheck(p.id)}
                        className="text-xs text-slate-500 transition hover:text-rose-400"
                        title="Delete paycheck"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {paychecks.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-700 bg-slate-950/40 font-semibold text-slate-200">
                  <td className="px-5 py-3" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-5 py-3 text-right">{money(totals.gross)}</td>
                  <td className="px-5 py-3 text-right">{money(totals.federal)}</td>
                  <td className="px-5 py-3 text-right">{money(totals.ss)}</td>
                  <td className="px-5 py-3 text-right">{money(totals.medicare)}</td>
                  <td className="px-5 py-3 text-right">{money(totals.state)}</td>
                  <td className="px-5 py-3 text-right text-emerald-300">
                    {money(totals.net)}
                  </td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {paychecks.length > 0 && (
          <div className="border-t border-slate-800 bg-slate-950/40 px-5 py-4">
            <div className="ml-auto max-w-sm space-y-1.5 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Company payroll taxes (employer match)
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Social Security match (6.2%)</span>
                <span className="font-medium text-blue-300">{money(totals.ss)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Medicare match (1.45%)</span>
                <span className="font-medium text-blue-300">
                  {money(totals.medicare)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-1.5">
                <span className="font-semibold text-white">Total employer tax</span>
                <span className="font-bold text-blue-300">
                  {money(totals.ss + totals.medicare)}
                </span>
              </div>
              <div className="flex justify-between text-base">
                <span className="font-semibold text-white">Total payroll cost</span>
                <span className="font-bold text-white">
                  {money(totals.gross + totals.ss + totals.medicare)}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
