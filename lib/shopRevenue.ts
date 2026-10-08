import Stripe from "stripe";

/**
 * Per-shop revenue from the platform account's balance transactions.
 *
 * Implements TRANSFER_APP_INTEGRATION.md. The load-bearing rules from that doc:
 *
 * 1. Read BALANCE TRANSACTIONS, never charges + an estimated fee. Each row
 *    carries `amount` (gross), `fee` (what Stripe actually took) and `net`
 *    (what landed in the balance). Net is the only honest basis for a
 *    transfer, and these rows tie exactly to the bank deposit.
 * 2. Shops are identified ONLY by `shop_id` in charge metadata. Refund rows
 *    carry no metadata of their own and must be resolved through the parent
 *    PaymentIntent (or charge).
 * 3. Anything that can't be attributed goes in an explicit `unattributed`
 *    bucket that stays visible — never a default shop, never dropped.
 * 4. Rows that aren't shop revenue (payouts, stripe_fee, adjustments,
 *    transfers, chargebacks) are platform-level: reported in their own
 *    section so totals still tie to the bank.
 * 5. Integer cents end to end; a non-finite money value throws instead of
 *    quietly becoming 0 ("wrong money is worse than a crash").
 */

/** Balance-transaction types that represent shop sales. */
const SALE_TYPES = new Set(["charge", "payment"]);
/** Types that represent money given back for a shop sale. */
const REFUND_TYPES = new Set(["refund", "payment_refund"]);

/**
 * Safety valve for runaway periods: auto-pagination is mandatory (a silently
 * truncated list is a quietly wrong total), so instead of truncating we fail
 * loudly and ask for a narrower window.
 */
const MAX_ROWS = 10_000;

/** How many unattributed rows we return for inspection in the UI. */
const UNATTRIBUTED_SAMPLE_LIMIT = 100;

export type ShopSummary = {
  shopId: string;
  /** Σ amount — gross collected, in cents. */
  grossCents: number;
  /** Σ fee — what Stripe actually took, in cents. */
  feeCents: number;
  /** Σ net — what actually landed in the balance, in cents. */
  netCents: number;
  /** Σ metadata.surcharge_usd across sale rows, in cents. */
  surchargeCents: number;
  /** surcharge − Stripe fees. Negative while the surcharge is switched off. */
  spreadCents: number;
  /** net − platform spread: the figure a transfer should be based on. */
  owedCents: number;
  saleCount: number;
  refundCount: number;
  /** Gross cents per metadata.source (register, online, …) for sale rows. */
  bySource: Record<string, number>;
};

export type UnattributedTxn = {
  id: string;
  type: string;
  created: number;
  amountCents: number;
  netCents: number;
  description: string | null;
  /** Why attribution failed — makes the bucket explainable, not just visible. */
  reason: string;
};

export type PlatformRow = {
  /** Balance-transaction type: payout, stripe_fee, adjustment, transfer, … */
  type: string;
  count: number;
  amountCents: number;
  feeCents: number;
  netCents: number;
};

export type RevenueReport = {
  shops: ShopSummary[];
  /** The mandatory bucket — same columns so it renders alongside the shops. */
  unattributed: ShopSummary & { sample: UnattributedTxn[] };
  platform: PlatformRow[];
  totals: {
    /** Across shop-revenue rows only (sales + refunds), attributed or not. */
    grossCents: number;
    feeCents: number;
    netCents: number;
    /** Σ net across EVERY row in the window, platform rows included. */
    allRowsNetCents: number;
    rowCount: number;
  };
  currency: string | null;
  /** More than one currency in the window — totals mix units; surface it. */
  mixedCurrencies: boolean;
};

/**
 * Guard every money value before it enters a total. `Number(null)` is 0,
 * which quietly produces a wrong total instead of an error — so a missing or
 * non-finite value fails the whole report with the offending row named.
 */
function cents(value: unknown, field: string, txnId: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(
      `Balance transaction ${txnId}: ${field} is ${String(value)} — refusing to total unverifiable money.`
    );
  }
  return value;
}

/** Parse metadata.surcharge_usd ("1.45") into integer cents; 0 when absent. */
function surchargeCentsFrom(metadata: Stripe.Metadata | null | undefined): number {
  const raw = metadata?.surcharge_usd;
  if (raw === undefined || raw === null || raw === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 0; // malformed stamp — ignore, don't guess
  return Math.round(parseFloat(raw) * 100);
}

function emptySummary(shopId: string): ShopSummary {
  return {
    shopId,
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    surchargeCents: 0,
    spreadCents: 0,
    owedCents: 0,
    saleCount: 0,
    refundCount: 0,
    bySource: {},
  };
}

/** Per-run caches so refund resolution costs one round trip per parent, not per row. */
type ResolveContext = {
  stripe: Stripe;
  paymentIntentCache: Map<string, Stripe.PaymentIntent | null>;
  chargeCache: Map<string, Stripe.Charge | null>;
};

async function cachedPaymentIntent(
  ctx: ResolveContext,
  id: string
): Promise<Stripe.PaymentIntent | null> {
  const hit = ctx.paymentIntentCache.get(id);
  if (hit !== undefined) return hit;
  let pi: Stripe.PaymentIntent | null = null;
  try {
    pi = await ctx.stripe.paymentIntents.retrieve(id);
  } catch {
    // Attribution failure routes the row to `unattributed` — never crashes the report.
  }
  ctx.paymentIntentCache.set(id, pi);
  return pi;
}

async function cachedCharge(ctx: ResolveContext, id: string): Promise<Stripe.Charge | null> {
  const hit = ctx.chargeCache.get(id);
  if (hit !== undefined) return hit;
  let ch: Stripe.Charge | null = null;
  try {
    ch = await ctx.stripe.charges.retrieve(id);
  } catch {
    // Same deal: an unreadable parent means "unattributed", not a crash.
  }
  ctx.chargeCache.set(id, ch);
  return ch;
}

type Attribution =
  | { kind: "sale"; shopId: string | null; reason?: string; charge: Stripe.Charge | null }
  | { kind: "refund"; shopId: string | null; reason?: string }
  | { kind: "platform" };

/**
 * Attribute one balance transaction.
 *
 * Sales: the expanded source is a Charge — read `metadata.shop_id`, falling
 * back to the parent PaymentIntent's metadata (shops stamp on their own
 * schedules; partial stamping is the normal state, not an error).
 *
 * Refunds: the Refund object carries NO metadata of its own. Resolve through
 * the original PaymentIntent, then the original charge. Skipping this would
 * leave the refunded sale counted as revenue — the shop would be paid for
 * money that was given back.
 */
async function attribute(ctx: ResolveContext, txn: Stripe.BalanceTransaction): Promise<Attribution> {
  const source = typeof txn.source === "object" ? txn.source : null;

  if (SALE_TYPES.has(txn.type)) {
    const charge = source && source.object === "charge" ? (source as Stripe.Charge) : null;
    if (!charge) {
      return { kind: "sale", shopId: null, reason: "source is not an expanded charge", charge: null };
    }
    let shopId = charge.metadata?.shop_id || null;
    if (!shopId && typeof charge.payment_intent === "string") {
      const pi = await cachedPaymentIntent(ctx, charge.payment_intent);
      shopId = pi?.metadata?.shop_id || null;
    }
    return {
      kind: "sale",
      shopId,
      reason: shopId ? undefined : "no shop_id on charge or payment intent",
      charge,
    };
  }

  if (REFUND_TYPES.has(txn.type)) {
    const refund = source && source.object === "refund" ? (source as Stripe.Refund) : null;
    if (!refund) {
      return { kind: "refund", shopId: null, reason: "source is not an expanded refund" };
    }
    const piId =
      typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : refund.payment_intent?.id ?? null;
    if (piId) {
      const pi = await cachedPaymentIntent(ctx, piId);
      const shopId = pi?.metadata?.shop_id || null;
      if (shopId) return { kind: "refund", shopId };
    }
    const chargeId =
      typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null;
    if (chargeId) {
      const ch = await cachedCharge(ctx, chargeId);
      const shopId = ch?.metadata?.shop_id || null;
      if (shopId) return { kind: "refund", shopId };
    }
    return { kind: "refund", shopId: null, reason: "refund's parent payment has no shop_id" };
  }

  // Everything else — stripe_fee, payout, adjustment, transfer, chargeback
  // types — is platform-level, not shop revenue. Reported separately, never
  // folded into a shop, never dropped (a vanished payout row makes the totals
  // stop tying to the bank).
  return { kind: "platform" };
}

export type RevenueQuery =
  | { mode: "range"; startUnix: number; endUnix: number }
  | { mode: "payout"; payoutId: string };

/**
 * Build the per-shop revenue report for a created-time window or for the rows
 * belonging to one payout (the reconcilable case: Σ net of a payout's rows
 * equals what actually hit the bank).
 */
export async function buildRevenueReport(
  stripe: Stripe,
  query: RevenueQuery
): Promise<RevenueReport> {
  const params: Stripe.BalanceTransactionListParams =
    query.mode === "range"
      ? {
          created: { gte: query.startUnix, lt: query.endUnix },
          expand: ["data.source"],
          limit: 100,
        }
      : { payout: query.payoutId, expand: ["data.source"], limit: 100 };

  const ctx: ResolveContext = {
    stripe,
    paymentIntentCache: new Map(),
    chargeCache: new Map(),
  };

  const shops = new Map<string, ShopSummary>();
  const unattributed: RevenueReport["unattributed"] = {
    ...emptySummary("unattributed"),
    sample: [],
  };
  const platform = new Map<string, PlatformRow>();

  let rowCount = 0;
  let allRowsNetCents = 0;
  let currency: string | null = null;
  let mixedCurrencies = false;

  const addRevenueRow = (
    target: ShopSummary,
    txn: Stripe.BalanceTransaction,
    attribution: Attribution
  ) => {
    const amount = cents(txn.amount, "amount", txn.id);
    const fee = cents(txn.fee, "fee", txn.id);
    const net = cents(txn.net, "net", txn.id);
    target.grossCents += amount;
    target.feeCents += fee;
    target.netCents += net;
    if (attribution.kind === "sale") {
      target.saleCount += 1;
      // Surcharge is only summed from sale rows. (A refund row would re-read
      // the parent's surcharge_usd and double-count it; partial refunds make
      // apportioning it guesswork, so we deliberately don't.)
      target.surchargeCents += surchargeCentsFrom(attribution.charge?.metadata);
      const src = attribution.charge?.metadata?.source || "unknown";
      target.bySource[src] = (target.bySource[src] ?? 0) + amount;
    } else {
      target.refundCount += 1;
    }
  };

  // Always auto-paginate: a silently truncated list is a quietly wrong total.
  for await (const txn of stripe.balanceTransactions.list(params)) {
    rowCount += 1;
    if (rowCount > MAX_ROWS) {
      throw new Error(
        `More than ${MAX_ROWS} balance transactions in this window — narrow the period.`
      );
    }

    if (currency === null) currency = txn.currency;
    else if (txn.currency !== currency) mixedCurrencies = true;

    allRowsNetCents += cents(txn.net, "net", txn.id);

    const isRevenueRow = SALE_TYPES.has(txn.type) || REFUND_TYPES.has(txn.type);
    if (!isRevenueRow) {
      const row = platform.get(txn.type) ?? {
        type: txn.type,
        count: 0,
        amountCents: 0,
        feeCents: 0,
        netCents: 0,
      };
      row.count += 1;
      row.amountCents += cents(txn.amount, "amount", txn.id);
      row.feeCents += cents(txn.fee, "fee", txn.id);
      row.netCents += cents(txn.net, "net", txn.id);
      platform.set(txn.type, row);
      continue;
    }

    const attribution = await attribute(ctx, txn);
    if (attribution.kind === "platform") continue; // unreachable, keeps TS honest

    if (attribution.shopId) {
      let summary = shops.get(attribution.shopId);
      if (!summary) {
        summary = emptySummary(attribution.shopId);
        shops.set(attribution.shopId, summary);
      }
      addRevenueRow(summary, txn, attribution);
    } else {
      addRevenueRow(unattributed, txn, attribution);
      if (unattributed.sample.length < UNATTRIBUTED_SAMPLE_LIMIT) {
        unattributed.sample.push({
          id: txn.id,
          type: txn.type,
          created: txn.created,
          amountCents: txn.amount,
          netCents: txn.net,
          description: txn.description,
          reason: attribution.reason ?? "no shop_id",
        });
      }
    }
  }

  // Derived columns. The intended model: the customer pays a processing
  // surcharge and the platform keeps the spread over Stripe's real cost.
  // While the surcharge is switched off (surcharge_usd stamped as "0.00"),
  // spread is negative by exactly the Stripe fees and owed equals gross —
  // the platform absorbs processing costs. The columns are built either way.
  const finalize = (s: ShopSummary) => {
    s.spreadCents = s.surchargeCents - s.feeCents;
    s.owedCents = s.netCents - s.spreadCents;
  };
  shops.forEach(finalize);
  finalize(unattributed);

  const shopList = [...shops.values()].sort((a, b) => b.netCents - a.netCents);

  const totals = { grossCents: 0, feeCents: 0, netCents: 0, allRowsNetCents, rowCount };
  for (const s of [...shopList, unattributed]) {
    totals.grossCents += s.grossCents;
    totals.feeCents += s.feeCents;
    totals.netCents += s.netCents;
  }

  return {
    shops: shopList,
    unattributed,
    platform: [...platform.values()].sort((a, b) => a.type.localeCompare(b.type)),
    totals,
    currency,
    mixedCurrencies,
  };
}
