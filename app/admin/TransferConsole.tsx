"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Account = {
  id: string;
  label: string;
  email: string | null;
  country: string | null;
  currency: string | null;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  transfersActive: boolean;
};

type BalanceEntry = { amount: number; currency: string };
type Balance = {
  testMode: boolean;
  available: BalanceEntry[];
  pending: BalanceEntry[];
};

type TransferResult = {
  id: string;
  amount: number;
  currency: string;
  destination: string;
};

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function TransferConsole() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [description, setDescription] = useState("");

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setLoadError(null);
    try {
      const [accRes, balRes] = await Promise.all([
        fetch("/api/admin/accounts"),
        fetch("/api/admin/balance"),
      ]);

      const accJson = await accRes.json();
      const balJson = await balRes.json();

      if (!accRes.ok) throw new Error(accJson.error || "Failed to load accounts");
      if (!balRes.ok) throw new Error(balJson.error || "Failed to load balance");

      setAccounts(accJson.accounts);
      setBalance(balJson);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === destination) ?? null,
    [accounts, destination]
  );

  const amountNumber = Number(amount);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const canSubmit = destination.startsWith("acct_") && amountValid && !submitting;

  async function doTransfer() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          amount: amountNumber,
          currency,
          description: description || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transfer failed.");

      setResult(json);
      setConfirming(false);
      setAmount("");
      setDescription("");
      // Refresh balance to reflect the deduction.
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Platform balance
          </h2>
          {balance?.testMode && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
              TEST MODE
            </span>
          )}
        </div>
        {loadingData ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : balance ? (
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-slate-500">Available</p>
              <p className="text-2xl font-bold">
                {balance.available.length
                  ? balance.available
                      .map((b) => formatMoney(b.amount, b.currency))
                      .join(" · ")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Pending</p>
              <p className="text-2xl font-bold text-slate-400">
                {balance.pending.length
                  ? balance.pending
                      .map((b) => formatMoney(b.amount, b.currency))
                      .join(" · ")
                  : "—"}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {loadError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {loadError}{" "}
          <button onClick={loadData} className="underline">
            Retry
          </button>
        </div>
      )}

      {/* Transfer form */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          New transfer
        </h2>

        <label className="mb-1 block text-sm font-medium text-slate-300">
          Destination connected account
        </label>
        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={loadingData}
          className="mb-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
        >
          <option value="">
            {loadingData ? "Loading accounts…" : "Select an account…"}
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} — {a.id}
              {a.transfersActive ? "" : " (transfers not active)"}
            </option>
          ))}
        </select>
        {selectedAccount && !selectedAccount.transfersActive && (
          <p className="mb-3 text-xs text-amber-400">
            ⚠ This account does not have the transfers capability active — the
            transfer will likely be rejected by Stripe.
          </p>
        )}

        <div className="mb-4 mt-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-300">
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
          <div className="w-28">
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Currency
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toLowerCase())}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 uppercase text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-300">
          Description <span className="text-slate-500">(optional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. June payout"
          className="mb-5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
        />

        <button
          onClick={() => {
            setError(null);
            setResult(null);
            setConfirming(true);
          }}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Review transfer
        </button>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            ✓ Transferred {formatMoney(result.amount, result.currency)} to{" "}
            {result.destination}.<br />
            <span className="text-xs text-emerald-400/80">{result.id}</span>
          </div>
        )}
      </section>

      {/* Confirmation modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white">
              Confirm transfer
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              You are about to move real funds from your platform balance.
            </p>
            <dl className="mb-6 space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Amount</dt>
                <dd className="font-semibold text-white">
                  {formatMoney(Math.round(amountNumber * 100), currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">To</dt>
                <dd className="text-right font-mono text-xs text-white">
                  {selectedAccount?.label}
                  <br />
                  {destination}
                </dd>
              </div>
              {description && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Description</dt>
                  <dd className="text-white">{description}</dd>
                </div>
              )}
            </dl>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={doTransfer}
                disabled={submitting}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Confirm & send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
