"use client";

import { useCallback, useEffect, useState } from "react";

type Flags = {
  payoutsEnabled: boolean;
  hasDebitCard: boolean;
  instantEligible: boolean;
};

type PayoutResult = {
  id: string;
  amount: number;
  currency: string;
  arrivalDate: number | null;
  status: string;
};

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(minor / 100);
  } catch {
    return `$${(minor / 100).toFixed(2)}`;
  }
}

export default function InstantPayoutPanel({
  accountId,
  email,
  label,
}: {
  accountId: string;
  email: string;
  label: string;
}) {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [sendingLink, setSendingLink] = useState(false);

  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<PayoutResult | null>(null);

  const loadStatus = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/instant/status?accountId=${encodeURIComponent(accountId)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to check status.");
      setFlags(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check status.");
      setFlags(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Reset + reload whenever the selected account changes.
  useEffect(() => {
    setFlags(null);
    setLinkUrl(null);
    setNotice(null);
    setResult(null);
    setAmount("");
    setConfirming(false);
    loadStatus();
  }, [loadStatus]);

  async function sendDebitLink() {
    setSendingLink(true);
    setError(null);
    setNotice(null);
    setLinkUrl(null);
    try {
      const res = await fetch("/api/admin/instant/send-debit-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, email: email || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create link.");
      setLinkUrl(json.url);
      const kind =
        json.mode === "onboarding"
          ? "Onboarding link (owner needs to finish payout setup)"
          : "Debit-card link";
      setNotice(
        json.emailed
          ? `${kind} emailed to ${json.to}.`
          : `${kind} created — email not sent (no address or RESEND_API_KEY). Copy it below.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link.");
    } finally {
      setSendingLink(false);
    }
  }

  async function sendPayout() {
    setPaying(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/instant/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          amount: Number(amount),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Payout failed.");
      setResult(json);
      setConfirming(false);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payout failed.");
      setConfirming(false);
    } finally {
      setPaying(false);
    }
  }

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Instant payout
        </h2>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="text-xs text-slate-400 underline-offset-2 transition hover:text-white hover:underline disabled:opacity-50"
        >
          {loading ? "Checking…" : "Re-check"}
        </button>
      </div>

      {/* Eligibility badge */}
      <div className="mb-4">
        {loading && !flags ? (
          <span className="text-sm text-slate-500">Checking eligibility…</span>
        ) : flags?.instantEligible ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-300">
            ✅ Eligible for instant payout
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-300">
            ⚠️ Debit card not added yet
          </span>
        )}
        {flags && !flags.payoutsEnabled && (
          <p className="mt-2 text-xs text-amber-400">
            Payouts aren&apos;t enabled on this account yet — the owner may need
            to finish Stripe onboarding.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      {/* Not eligible → send setup link */}
      {flags && !flags.instantEligible && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Send {label || "the account owner"}
            {email ? ` (${email})` : ""} a secure link to add their debit card.
          </p>
          <button
            onClick={sendDebitLink}
            disabled={sendingLink}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {sendingLink ? "Sending…" : "Send debit-card setup link"}
          </button>
          {linkUrl && (
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
              <p className="mb-1 text-xs text-slate-500">
                Shareable link (expires soon):
              </p>
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-xs text-blue-300 hover:underline"
              >
                {linkUrl}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Eligible → payout form */}
      {flags?.instantEligible && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">
                Amount (to debit card)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setError(null);
                  setResult(null);
                  setConfirming(true);
                }}
                disabled={!amountValid}
                className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send instant payout
              </button>
            </div>
          </div>

          {confirming && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-sm text-slate-200">
                Send{" "}
                <span className="font-bold">
                  {formatMoney(Math.round(amountNum * 100), "usd")}
                </span>{" "}
                instantly to {label || "this account"}&apos;s debit card?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={paying}
                  className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={sendPayout}
                  disabled={paying}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {paying ? "Sending…" : "Confirm & send"}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              ✓ Instant payout of {formatMoney(result.amount, result.currency)}{" "}
              created ({result.status}).<br />
              <span className="text-xs text-emerald-400/80">{result.id}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
