import { getDb } from "./mongodb";
import { stripe } from "./stripe";

export type AccountFlags = {
  payoutsEnabled: boolean;
  hasDebitCard: boolean;
  instantEligible: boolean;
};

type AccountFlagsDoc = AccountFlags & {
  accountId: string;
  updatedAt: Date;
};

async function collection() {
  const db = await getDb();
  return db.collection<AccountFlagsDoc>("connected_accounts");
}

/** Upsert the cached instant-payout eligibility flags for a connected account. */
export async function setAccountFlags(
  accountId: string,
  flags: AccountFlags
): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { accountId },
    { $set: { ...flags, accountId, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function getAccountFlags(
  accountId: string
): Promise<AccountFlags | null> {
  const col = await collection();
  const doc = await col.findOne({ accountId });
  if (!doc) return null;
  return {
    payoutsEnabled: doc.payoutsEnabled,
    hasDebitCard: doc.hasDebitCard,
    instantEligible: doc.instantEligible,
  };
}

/**
 * Read the authoritative eligibility from Stripe (payouts enabled + a debit card
 * on file), cache it in Mongo, and return it. Shared by the status route and the
 * account.updated webhook so the logic lives in one place.
 */
export async function refreshAccountEligibility(
  accountId: string,
  payoutsEnabledHint?: boolean
): Promise<AccountFlags> {
  let payoutsEnabled = payoutsEnabledHint ?? false;
  if (payoutsEnabledHint === undefined) {
    const account = await stripe.accounts.retrieve(accountId);
    payoutsEnabled = account.payouts_enabled ?? false;
  }

  // A card external account on a connected account is always a debit card
  // (Stripe only allows debit cards as card payout destinations).
  const cards = await stripe.accounts.listExternalAccounts(accountId, {
    object: "card",
    limit: 1,
  });
  const hasDebitCard = cards.data.length > 0;

  const flags: AccountFlags = {
    payoutsEnabled,
    hasDebitCard,
    instantEligible: payoutsEnabled && hasDebitCard,
  };

  await setAccountFlags(accountId, flags);
  return flags;
}
