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
};

export type LedgerEntry = {
  id: string;
  accountId: string;
  type: LedgerType;
  amountCents: number;
  description: string;
  date: string;
  createdAt: string;
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

export async function listEntries(
  accountId: string,
  period: Period
): Promise<LedgerEntry[]> {
  const col = await collection();
  const { start, end } = periodRange(period);
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
