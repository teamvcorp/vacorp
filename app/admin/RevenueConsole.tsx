"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Per-shop revenue console (see TRANSFER_APP_INTEGRATION.md).
 *
 * Reads balance transactions — gross / fee / net — grouped by the shop_id
 * each shop stamps into charge metadata. Two modes:
 *  - Date range: day boundaries computed HERE, in the browser's local
 *    timezone, then sent as unix seconds (UTC windows once made "today"
 *    start at 19:00 local).
 *  - Payout: groups the rows of one actual bank deposit, the only figure
 *    that can be checked against a statement.
 */

type ShopSummary = {
  shopId: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  surchargeCents: number;
  platformFeeCents: number;
  spreadCents: number;
  owedCents: number;
  saleCount: number;
  refundCount: number;
  bySource: Record<string, number>;
  connectedAccounts: string[];
};

type Account = {
  id: string;
  label: string;
  transfersActive: boolean;
};

type TransferResult = { id: string; amountCents: number };

type UnattributedTxn = {
  id: string;
  type: string;
  created: number;
  amountCents: number;
  netCents: number;
  description: string | null;
  reason: string;
};

type PlatformRow = {
  type: string;
  count: number;
  amountCents: number;
  feeCents: number;
  netCents: number;
};

type Report = {
  shops: ShopSummary[];
  unattributed: ShopSummary & { sample: UnattributedTxn[] };
  platform: PlatformRow[];
  totals: {
    grossCents: number;
    feeCents: number;
    netCents: number;
    allRowsNetCents: number;
    rowCount: number;
  };
  currency: string | null;
  mixedCurrencies: boolean;
  platformFeePercent: number;
};

type ReportResponse = {
  testMode: boolean;
  mode: "range" | "payout";
  period?: { startUnix: number; endUnix: number };
  payout?: {
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    arrivalDate: number;
    created: number;
  };
  reconciliation?: {
    reconciledNetCents: number;
    payoutAmountCents: number;
    deltaCents: number;
    ties: boolean;
  };
  report: Report;
};

type Payout = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  arrivalDate: number;
  created: number;
  automatic: boolean;
};

function formatMoney(minor: number, currency: string | null) {
  const cur = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${cur}`;
  }
}

/** yyyy-mm-dd for a Date, in the browser's local timezone. */
function localISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local-midnight unix seconds for a yyyy-mm-dd input, offset by `plusDays`. */
function localDateToUnix(iso: string, plusDays = 0) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, d + plusDays).getTime() / 1000);
}

export default function RevenueConsole() {
  const today = useMemo(() => localISODate(new Date()), []);

  const [mode, setMode] = useState<"range" | "payout">("range");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [payoutId, setPayoutId] = useState("");
  const [payoutsError, setPayoutsError] = useState<string | null>(null);

  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leg-2 collection: pay each shop its computed "owed" figure. The amount is
  // never typed — it goes from the report straight into the transfer.
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [transferShop, setTransferShop] = useState<ShopSummary | null>(null);
  const [transferDestination, setTransferDestination] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferResults, setTransferResults] = useState<Record<string, TransferResult>>({});

  // Lazy-load the payout list the first time payout mode is opened.
  useEffect(() => {
    if (mode !== "payout" || payouts !== null) return;
    (async () => {
      setPayoutsError(null);
      try {
        const res = await fetch("/api/admin/revenue/payouts");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load payouts");
        setPayouts(json.payouts);
      } catch (err) {
        setPayoutsError(err instanceof Error ? err.message : "Failed to load payouts.");
        setPayouts([]);
      }
    })();
  }, [mode, payouts]);

  const openTransfer = useCallback(
    async (shop: ShopSummary) => {
      setTransferError(null);
      setTransferShop(shop);
      // Preselect only when the shop's charges name exactly one payee —
      // zero or several means a human picks, never a guess.
      setTransferDestination(shop.connectedAccounts.length === 1 ? shop.connectedAccounts[0] : "");
      if (accounts === null) {
        try {
          const res = await fetch("/api/admin/accounts");
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to load accounts");
          setAccounts(json.accounts);
        } catch (err) {
          setAccounts([]);
          setTransferError(
            err instanceof Error ? err.message : "Failed to load connected accounts."
          );
        }
      }
    },
    [accounts]
  );

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTransferResults({}); // results belong to the report they were sent from
    try {
      let url: string;
      if (mode === "payout") {
        if (!payoutId) throw new Error("Select a payout first.");
        url = `/api/admin/revenue?payout=${encodeURIComponent(payoutId)}`;
      } else {
        const start = localDateToUnix(startDate);
        const end = localDateToUnix(endDate, 1); // end date inclusive
        if (end <= start) throw new Error("End date must not be before start date.");
        url = `/api/admin/revenue?start=${start}&end=${end}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to build report.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build report.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mode, payoutId, startDate, endDate]);

  function preset(days: number) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - (days - 1));
    setStartDate(localISODate(start));
    setEndDate(localISODate(now));
  }

  function presetThisMonth() {
    const now = new Date();
    setStartDate(localISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(localISODate(now));
  }

  const report = data?.report ?? null;
  const currency = report?.currency ?? "usd";

  // Stable identifier for the reported period — used in the transfer's
  // idempotency key and audit metadata.
  const periodKey = data
    ? data.mode === "payout"
      ? data.payout?.id ?? "payout"
      : `${data.period?.startUnix}-${data.period?.endUnix}`
    : "";
  const periodLabel = data
    ? data.mode === "payout"
      ? `payout ${data.payout?.id}`
      : `${new Date((data.period?.startUnix ?? 0) * 1000).toLocaleDateString()} – ${new Date(
          ((data.period?.endUnix ?? 0) - 1) * 1000
        ).toLocaleDateString()}`
    : "";

  async function doTransferOwed() {
    if (!transferShop || !data) return;
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const res = await fetch("/api/admin/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: transferDestination,
          amountCents: transferShop.owedCents,
          currency,
          description: `Revenue share ${transferShop.shopId} — ${periodLabel}`,
          // Deterministic key: re-sending the same shop + period + amount
          // within Stripe's 24h idempotency window is a no-op, so a
          // double-click or a re-run of the same report can't pay twice.
          idempotencyKey: `rev:${transferShop.shopId}:${periodKey}:${transferShop.owedCents}`,
          metadata: {
            basis: "revenue_report",
            shop_id: transferShop.shopId,
            period: periodKey,
            gross_cents: String(transferShop.grossCents),
            stripe_fee_cents: String(transferShop.feeCents),
            platform_fee_cents: String(transferShop.platformFeeCents),
            owed_cents: String(transferShop.owedCents),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transfer failed.");
      setTransferResults((prev) => ({
        ...prev,
        [transferShop.shopId]: { id: json.id, amountCents: json.amount },
      }));
      setTransferShop(null);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Transfer failed.");
    } finally {
      setTransferSubmitting(false);
    }
  }
  const hasUnattributed =
    report !== null &&
    (report.unattributed.saleCount > 0 || report.unattributed.refundCount > 0);
  const shopRows: ShopSummary[] = report
    ? [...report.shops, ...(hasUnattributed ? [report.unattributed] : [])]
    : [];
  const totalSurcharge = report
    ? report.shops.reduce((n, s) => n + s.surchargeCents, 0) +
      report.unattributed.surchargeCents
    : 0;

  const cellRight = "px-3 py-2 text-right tabular-nums";

  return (
    <div className="space-y-6">
      {/* Query controls */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Per-shop revenue
          </h2>
          {data?.testMode && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
              TEST MODE
            </span>
          )}
        </div>

        <div className="mb-4 inline-flex gap-1 rounded-full border border-slate-800 bg-slate-950 p-1">
          {(
            [
              { id: "range", label: "Date range" },
              { id: "payout", label: "Payout reconciliation" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                mode === m.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "range" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  To <span className="text-slate-500">(inclusive)</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2">
                {(
                  [
                    ["Today", () => preset(1)],
                    ["7 days", () => preset(7)],
                    ["30 days", () => preset(30)],
                    ["This month", presetThisMonth],
                  ] as const
                ).map(([label, fn]) => (
                  <button
                    key={label}
                    onClick={fn}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Day boundaries use this browser&apos;s local timezone.
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Payout</label>
            <select
              value={payoutId}
              onChange={(e) => setPayoutId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
            >
              <option value="">
                {payouts === null ? "Loading payouts…" : "Select a payout…"}
              </option>
              {(payouts ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {new Date(p.arrivalDate * 1000).toLocaleDateString()} —{" "}
                  {formatMoney(p.amountCents, p.currency)} ({p.status}) — {p.id}
                </option>
              ))}
            </select>
            {payoutsError && <p className="mt-2 text-xs text-red-400">{payoutsError}</p>}
            {payouts !== null && payouts.length === 0 && !payoutsError && (
              <p className="mt-2 text-xs text-slate-500">No payouts found yet.</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Groups the rows of one actual bank deposit — the split that can be checked
              against a statement.
            </p>
          </div>
        )}

        <button
          onClick={run}
          disabled={loading || (mode === "payout" && !payoutId)}
          className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Building report…" : "Run report"}
        </button>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </section>

      {report && (
        <>
          {/* Reconciliation badge (payout mode) */}
          {data?.reconciliation && (
            <section
              className={`rounded-2xl border p-5 ${
                data.reconciliation.ties
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-red-500/40 bg-red-500/10"
              }`}
            >
              {data.reconciliation.ties ? (
                <p className="text-sm font-semibold text-emerald-300">
                  ✓ Ties to the bank: Σ net of this payout&apos;s rows ={" "}
                  {formatMoney(data.reconciliation.payoutAmountCents, currency)} deposited.
                </p>
              ) : (
                <p className="text-sm font-semibold text-red-300">
                  ✗ Does not tie: rows sum to{" "}
                  {formatMoney(data.reconciliation.reconciledNetCents, currency)} but the
                  payout was {formatMoney(data.reconciliation.payoutAmountCents, currency)}{" "}
                  (off by {formatMoney(data.reconciliation.deltaCents, currency)}).
                </p>
              )}
            </section>
          )}

          {/* Totals — step 1 of the build order: confirm these match the Dashboard */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Totals · {report.totals.rowCount} balance transactions
            </h2>
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-xs text-slate-500">Gross collected</p>
                <p className="text-2xl font-bold">
                  {formatMoney(report.totals.grossCents, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Stripe fees (actual)</p>
                <p className="text-2xl font-bold text-slate-400">
                  {formatMoney(report.totals.feeCents, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Net received</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {formatMoney(report.totals.netCents, currency)}
                </p>
              </div>
            </div>
            {report.mixedCurrencies && (
              <p className="mt-3 text-xs text-amber-400">
                ⚠ Multiple currencies in this window — totals mix units. Narrow the period
                or treat per-row currency carefully.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Owed to shop = gross − platform fee ({report.platformFeePercent}% of gross).
              Spread = platform fee − Stripe&apos;s actual fees; negative spread means
              Stripe cost more than the fee on those charges and the platform absorbed
              the difference.
            </p>
          </section>

          {/* Per-shop table */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              By shop
            </h2>
            {shopRows.length === 0 ? (
              <p className="text-sm text-slate-500">No shop revenue rows in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Shop</th>
                      <th className={cellRight}>Gross</th>
                      <th className={cellRight}>Stripe fees</th>
                      <th className={cellRight}>Net</th>
                      <th className={cellRight}>
                        Platform fee ({report.platformFeePercent}%)
                      </th>
                      {totalSurcharge > 0 && <th className={cellRight}>Surcharge</th>}
                      <th className={cellRight}>Spread</th>
                      <th className={cellRight}>Owed to shop</th>
                      <th className={cellRight}>Sales / refunds</th>
                      <th className={cellRight}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopRows.map((s) => {
                      const isUnattributed = s.shopId === "unattributed";
                      return (
                        <tr
                          key={s.shopId}
                          className={`border-b border-slate-800/60 ${
                            isUnattributed ? "bg-amber-500/10 text-amber-200" : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-medium">
                            {isUnattributed ? "⚠ Unattributed" : s.shopId}
                          </td>
                          <td className={cellRight}>{formatMoney(s.grossCents, currency)}</td>
                          <td className={cellRight}>{formatMoney(s.feeCents, currency)}</td>
                          <td className={cellRight}>{formatMoney(s.netCents, currency)}</td>
                          <td className={cellRight}>
                            {formatMoney(s.platformFeeCents, currency)}
                          </td>
                          {totalSurcharge > 0 && (
                            <td className={cellRight}>
                              {formatMoney(s.surchargeCents, currency)}
                            </td>
                          )}
                          <td
                            className={`${cellRight} ${
                              s.spreadCents < 0 ? "text-red-400" : ""
                            }`}
                          >
                            {formatMoney(s.spreadCents, currency)}
                          </td>
                          <td className={`${cellRight} font-semibold`}>
                            {formatMoney(s.owedCents, currency)}
                          </td>
                          <td className={cellRight}>
                            {s.saleCount} / {s.refundCount}
                          </td>
                          <td className={cellRight}>
                            {isUnattributed ? null : transferResults[s.shopId] ? (
                              <span className="text-xs font-medium text-emerald-400">
                                ✓ Sent {formatMoney(transferResults[s.shopId].amountCents, currency)}
                              </span>
                            ) : (
                              <button
                                onClick={() => openTransfer(s)}
                                disabled={s.owedCents <= 0 || report.mixedCurrencies}
                                title={
                                  report.mixedCurrencies
                                    ? "Mixed currencies in this window — split the period first."
                                    : s.owedCents <= 0
                                      ? "Nothing owed for this period."
                                      : "Transfer the computed owed amount to this shop's connected account"
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Transfer owed
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {hasUnattributed && (
              <details className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <summary className="cursor-pointer font-medium text-amber-300">
                  Unattributed rows ({report.unattributed.sample.length} shown)
                </summary>
                <p className="mt-2 text-xs text-slate-400">
                  Rows with no resolvable shop_id. Expect this while shops roll out tagging
                  — historical charges can never be back-filled, so the boundary is each
                  shop&apos;s go-live date. These are never assigned to a default shop.
                </p>
                <ul className="mt-3 space-y-1 font-mono text-xs text-slate-300">
                  {report.unattributed.sample.map((t) => (
                    <li key={t.id}>
                      {new Date(t.created * 1000).toLocaleString()} · {t.type} ·{" "}
                      {formatMoney(t.amountCents, currency)} · {t.id}
                      {t.description ? ` · ${t.description}` : ""}{" "}
                      <span className="text-slate-500">({t.reason})</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* Platform-level rows — kept separate so totals still tie to the bank */}
          {report.platform.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Platform-level rows (not shop revenue)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Type</th>
                      <th className={cellRight}>Count</th>
                      <th className={cellRight}>Amount</th>
                      <th className={cellRight}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.platform.map((p) => (
                      <tr key={p.type} className="border-b border-slate-800/60">
                        <td className="px-3 py-2 font-mono text-xs">{p.type}</td>
                        <td className={cellRight}>{p.count}</td>
                        <td className={cellRight}>{formatMoney(p.amountCents, currency)}</td>
                        <td className={cellRight}>{formatMoney(p.netCents, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Payouts, Stripe fee rows, adjustments, transfers and chargebacks — reported
                here rather than folded into any shop, so period totals keep tying to the
                bank. Net across every row in this window:{" "}
                {formatMoney(report.totals.allRowsNetCents, currency)}.
              </p>
            </section>
          )}
        </>
      )}

      {/* Transfer-owed confirmation modal */}
      {transferShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white">Pay {transferShop.shopId}</h3>
            <p className="mb-4 text-sm text-slate-400">
              Transfers the computed &ldquo;owed to shop&rdquo; figure for {periodLabel}. The
              platform fee stays behind — that withholding is how the fee is collected.
            </p>
            <dl className="mb-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Gross · Stripe fees</dt>
                <dd className="text-white">
                  {formatMoney(transferShop.grossCents, currency)} ·{" "}
                  {formatMoney(transferShop.feeCents, currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">
                  Platform fee ({report?.platformFeePercent}%)
                </dt>
                <dd className="text-white">
                  {formatMoney(transferShop.platformFeeCents, currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Owed to shop</dt>
                <dd className="font-semibold text-emerald-400">
                  {formatMoney(transferShop.owedCents, currency)}
                </dd>
              </div>
            </dl>

            <label className="mb-1 block text-sm font-medium text-slate-300">
              Destination connected account
            </label>
            <select
              value={transferDestination}
              onChange={(e) => setTransferDestination(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
            >
              <option value="">
                {accounts === null ? "Loading accounts…" : "Select an account…"}
              </option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.id}
                  {a.transfersActive ? "" : " (transfers not active)"}
                </option>
              ))}
            </select>
            {transferShop.connectedAccounts.length === 1 && (
              <p className="mb-2 text-xs text-slate-500">
                Pre-selected from this shop&apos;s charge metadata (connected_account).
              </p>
            )}
            {transferShop.connectedAccounts.length > 1 && (
              <p className="mb-2 text-xs text-amber-400">
                ⚠ This shop&apos;s charges name {transferShop.connectedAccounts.length}{" "}
                different connected accounts ({transferShop.connectedAccounts.join(", ")}).
                Pick the right one deliberately.
              </p>
            )}
            {transferShop.connectedAccounts.length === 0 && (
              <p className="mb-2 text-xs text-slate-500">
                This shop&apos;s charges don&apos;t carry connected_account metadata — pick
                the payee manually.
              </p>
            )}

            {transferError && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {transferError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setTransferShop(null)}
                disabled={transferSubmitting}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={doTransferOwed}
                disabled={transferSubmitting || !transferDestination.startsWith("acct_")}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {transferSubmitting
                  ? "Sending…"
                  : `Send ${formatMoney(transferShop.owedCents, currency)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
