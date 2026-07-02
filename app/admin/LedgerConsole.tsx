"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Account = {
  id: string;
  label: string;
  email: string | null;
};

type Entry = {
  id: string;
  type: "payment" | "debt";
  amountCents: number;
  description: string;
  date: string;
};

type Totals = { payments: number; debts: number; balance: number };
type Period = "month" | "ytd";

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

export default function LedgerConsole() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [month, setMonth] = useState(thisMonth());
  const [label, setLabel] = useState("");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<Totals>({
    payments: 0,
    debts: 0,
    balance: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-entry form
  const [type, setType] = useState<"payment" | "debt">("payment");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [emailReceipt, setEmailReceipt] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [cashDeposit, setCashDeposit] = useState(false);
  const [adding, setAdding] = useState(false);

  // Report
  const [reporting, setReporting] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId]
  );

  // Load connected accounts once.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/accounts");
        const json = await res.json();
        if (res.ok) setAccounts(json.accounts);
      } catch {
        /* handled below on ledger load */
      }
    })();
  }, []);

  // Query string for the selected range, shared by load, email, and print.
  const rangeQuery = useMemo(
    () => (period === "ytd" ? "period=ytd" : `month=${month}`),
    [period, month]
  );

  const loadLedger = useCallback(async () => {
    if (!accountId) {
      setEntries([]);
      setTotals({ payments: 0, debts: 0, balance: 0 });
      setLabel("");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/ledger?accountId=${encodeURIComponent(accountId)}&${rangeQuery}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load ledger.");
      setEntries(json.entries);
      setTotals(json.totals);
      setLabel(json.label ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ledger.");
    } finally {
      setLoading(false);
    }
  }, [accountId, rangeQuery]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReportMsg(null);
    if (!accountId) {
      setError("Select an account first.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          type,
          amount,
          description,
          date,
          emailReceipt: type === "payment" && emailReceipt,
          receiptEmail,
          cashDeposit: type === "debt" && cashDeposit,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save entry.");
      if (json.receipt) {
        setReportMsg(
          json.receipt.sent
            ? `Entry saved · receipt emailed to ${(json.receipt.recipients || []).join(", ")}.`
            : `Entry saved · receipt not sent: ${json.receipt.error}`
        );
      }
      setAmount("");
      setDescription("");
      setDate(todayISO());
      setEmailReceipt(false);
      setReceiptEmail("");
      setCashDeposit(false);
      loadLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry.");
    } finally {
      setAdding(false);
    }
  }

  async function removeEntry(id: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/ledger?id=${id}&accountId=${encodeURIComponent(accountId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete.");
      }
      loadLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  async function sendReport() {
    setReportMsg(null);
    setError(null);
    setReporting(true);
    try {
      const res = await fetch("/api/admin/ledger/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          period === "ytd" ? { accountId, period: "ytd" } : { accountId, month }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send report.");
      setReportMsg(
        `Report emailed to ${(json.recipients || []).join(", ") || "recipients"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send report.");
    } finally {
      setReporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Account + period controls */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Account ledger
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
            >
              <option value="">Select a connected account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.email ? ` — ${a.email}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Period
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setPeriod("month")}
                className={`rounded-md py-1.5 text-sm font-semibold transition ${
                  period === "month"
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setPeriod("ytd")}
                className={`rounded-md py-1.5 text-sm font-semibold transition ${
                  period === "ytd"
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Year to date
              </button>
            </div>
            {period === "month" && (
              <input
                type="month"
                value={month}
                max={thisMonth()}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
              />
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {accountId && (
        <>
          {/* Add entry */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Add entry
            </h3>
            <form onSubmit={addEntry} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-950 p-1 sm:w-64">
                <button
                  type="button"
                  onClick={() => setType("payment")}
                  className={`rounded-md py-1.5 text-sm font-semibold transition ${
                    type === "payment"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Payment
                </button>
                <button
                  type="button"
                  onClick={() => setType("debt")}
                  className={`rounded-md py-1.5 text-sm font-semibold transition ${
                    type === "debt"
                      ? "bg-rose-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Debt
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={adding}
                    className="w-full rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60 sm:w-auto"
                  >
                    {adding ? "Adding…" : "Add"}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Note (what it was for)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Rent contribution, supplies, reimbursement…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>

              {type === "payment" && (
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={emailReceipt}
                      onChange={(e) => setEmailReceipt(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600 focus:ring-blue-500"
                    />
                    Email a receipt to the account holder
                  </label>
                  {emailReceipt && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs text-slate-400">
                        Payer email (optional) — also send the receipt to whoever paid
                      </label>
                      <input
                        type="email"
                        value={receiptEmail}
                        onChange={(e) => setReceiptEmail(e.target.value)}
                        placeholder="payer@example.com"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500 sm:max-w-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {type === "debt" && (
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={cashDeposit}
                      onChange={(e) => setCashDeposit(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600 focus:ring-blue-500"
                    />
                    Cash deposit — email a receipt to the account owner
                  </label>
                </div>
              )}
            </form>
          </section>

          {/* Ledger table */}
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                {label || (period === "month" ? "This month" : "Year to date")}
              </h3>
              <span className="text-xs text-slate-500">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 font-medium">Note</th>
                    <th className="px-5 py-2 font-medium">Type</th>
                    <th className="px-5 py-2 text-right font-medium">Amount</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                        No entries yet for this period.
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => (
                      <tr
                        key={e.id}
                        className="border-t border-slate-800/60 hover:bg-slate-800/30"
                      >
                        <td className="whitespace-nowrap px-5 py-3 text-slate-300">
                          {e.date}
                        </td>
                        <td className="px-5 py-3 text-slate-200">
                          {e.description}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              e.type === "payment"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {e.type}
                          </span>
                        </td>
                        <td
                          className={`whitespace-nowrap px-5 py-3 text-right font-semibold ${
                            e.type === "payment"
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {e.type === "payment" ? "+" : "−"}
                          {money(e.amountCents)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => removeEntry(e.id)}
                            className="text-xs text-slate-500 transition hover:text-rose-400"
                            title="Delete entry"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t border-slate-800 bg-slate-950/40 px-5 py-4">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total payments</span>
                  <span className="font-medium text-emerald-300">
                    +{money(totals.payments)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total debts</span>
                  <span className="font-medium text-rose-300">
                    −{money(totals.debts)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-1.5 text-base">
                  <span className="font-semibold text-white">Balance</span>
                  <span
                    className={`font-bold ${
                      totals.balance >= 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {money(totals.balance)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Report actions */}
          <section className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:flex-row sm:items-center">
            <div className="text-sm text-slate-400">
              The{" "}
              <span className="font-medium text-slate-200">
                {label || (period === "month" ? "this month" : "year-to-date")}
              </span>{" "}
              report. Email goes to{" "}
              <span className="text-slate-200">
                {selectedAccount?.email ?? "the account owner"}
              </span>{" "}
              and you.
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`/admin/ledger/report?accountId=${encodeURIComponent(
                  accountId
                )}&${rangeQuery}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Print report
              </a>
              <button
                onClick={sendReport}
                disabled={reporting}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
              >
                {reporting ? "Sending…" : "Email report"}
              </button>
            </div>
          </section>

          {reportMsg && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {reportMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
}
