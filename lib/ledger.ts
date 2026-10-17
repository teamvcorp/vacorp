import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

export type LedgerType = "payment" | "debt";
export type Period = "month" | "ytd";

type LedgerDoc = {
  _id?: ObjectId;
  accountId: string; // Stripe connected account id (acct_...)
  type: LedgerType;
  amountCents: number; // stored as integer minor units
  description: string;
  date: string; // YYYY-MM-DD — the day it occurred
  createdAt: Date;
  // Set on entries auto-logged from a Stripe transfer (tr_...). Unique when
  // present, so a retried/idempotent transfer can never double-log the debt.
  transferId?: string;
};

export type LedgerEntry = {
  id: string;
  accountId: string;
  type: LedgerType;
  amountCents: number;
  description: string;
  date: string;
  createdAt: string;
  transferId?: string;
};

async function collection() {
  const db = await getDb();
  return db.collection<LedgerDoc>("ledger");
}

function serialize(doc: LedgerDoc): LedgerEntry {
  return {
    id: doc._id!.toString(),
    accountId: doc.accountId,
    type: doc.type,
    amountCents: doc.amountCents,
    description: doc.description,
    date: doc.date,
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : String(doc.createdAt),
    ...(doc.transferId ? { transferId: doc.transferId } : {}),
  };
}

/**
 * Lexicographic [start, end) bounds for a period, based on the server's "now".
 * Works because dates are zero-padded YYYY-MM-DD (so string order = date order).
 */
export function periodRange(period: Period, now = new Date()) {
  const y = now.getFullYear();
  if (period === "ytd") {
    return { start: `${y}-01-01`, end: `${y + 1}-01-01`, label: `${y} year to date` };
  }
  const m = now.getMonth(); // 0-based
  const mm = String(m + 1).padStart(2, "0");
  const next = m === 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, "0")}-01`;
  const label = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { start: `${y}-${mm}-01`, end: next, label };
}

/**
 * Lexicographic [start, end) bounds + label for a specific calendar month
 * (`YYYY-MM`). Returns null if the string isn't a valid month.
 */
export function monthRange(
  month: string
): { start: string; end: string; label: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end =
    m >= 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const label = new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  return { start, end, label };
}

export async function listEntries(
  accountId: string,
  period: Period
): Promise<LedgerEntry[]> {
  const { start, end } = periodRange(period);
  return listEntriesInRange(accountId, start, end);
}

export async function listEntriesInRange(
  accountId: string,
  start: string,
  end: string
): Promise<LedgerEntry[]> {
  const col = await collection();
  const docs = await col
    .find({ accountId, date: { $gte: start, $lt: end } })
    .sort({ date: -1, createdAt: -1 })
    .toArray();
  return docs.map(serialize);
}

export async function addEntry(input: {
  accountId: string;
  type: LedgerType;
  amountCents: number;
  description: string;
  date: string;
}): Promise<LedgerEntry> {
  const col = await collection();
  const doc: LedgerDoc = { ...input, createdAt: new Date() };
  const res = await col.insertOne(doc);
  return serialize({ ...doc, _id: res.insertedId });
}

// Unique sparse index on transferId — created once per process, idempotent on
// Mongo's side. Sparse so the manual entries (no transferId) are unaffected.
let transferIndexReady: Promise<unknown> | null = null;
async function ensureTransferIndex(col: Awaited<ReturnType<typeof collection>>) {
  transferIndexReady ??= col
    .createIndex({ transferId: 1 }, { unique: true, sparse: true })
    .catch(() => {
      transferIndexReady = null; // retry on next call rather than caching a failure
    });
  await transferIndexReady;
}

/** YYYY-MM-DD for "now" in server-local time (ledger dates are calendar days). */
export function todayLocalISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Auto-log a Stripe transfer to a connected account as a ledger DEBT entry
 * (money disbursed to the account counts against its balance: payments − debts).
 *
 * Idempotent on transferId: Stripe's idempotency can hand the same transfer
 * back for a retried request, and the money only moved once — so the debt must
 * only be logged once. The unique index makes this hold even for concurrent
 * retries; on a duplicate insert the existing entry is returned instead.
 */
export async function recordTransferDebt(input: {
  accountId: string;
  amountCents: number;
  description: string;
  transferId: string;
}): Promise<{ entry: LedgerEntry; created: boolean }> {
  const col = await collection();
  await ensureTransferIndex(col);

  const existing = await col.findOne({ transferId: input.transferId });
  if (existing) return { entry: serialize(existing), created: false };

  const doc: LedgerDoc = {
    accountId: input.accountId,
    type: "debt",
    amountCents: input.amountCents,
    description: input.description.slice(0, 500),
    date: todayLocalISO(),
    createdAt: new Date(),
    transferId: input.transferId,
  };
  try {
    const res = await col.insertOne(doc);
    return { entry: serialize({ ...doc, _id: res.insertedId }), created: true };
  } catch (err) {
    // Duplicate key → a concurrent request logged it first; return that one.
    if (err && typeof err === "object" && (err as { code?: number }).code === 11000) {
      const winner = await col.findOne({ transferId: input.transferId });
      if (winner) return { entry: serialize(winner), created: false };
    }
    throw err;
  }
}

export async function deleteEntry(
  accountId: string,
  id: string
): Promise<boolean> {
  let _id: ObjectId;
  try {
    _id = new ObjectId(id);
  } catch {
    return false;
  }
  const col = await collection();
  const res = await col.deleteOne({ _id, accountId });
  return res.deletedCount === 1;
}

export function computeTotals(entries: LedgerEntry[]) {
  let payments = 0;
  let debts = 0;
  for (const e of entries) {
    if (e.type === "payment") payments += e.amountCents;
    else debts += e.amountCents;
  }
  return { payments, debts, balance: payments - debts };
}
