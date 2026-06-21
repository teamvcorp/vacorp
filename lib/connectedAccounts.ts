import { getDb } from "./mongodb";
import { stripe } from "./stripe";

export type AccountFlags = {
  payoutsEnabled: boolean;
  hasDebitCard: boolean;
  hasInstantDestination: boolean;
  instantVia: "card" | "bank" | null;
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
    hasInstantDestination: doc.hasInstantDestination,
    instantVia: doc.instantVia,
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

  // Instant payouts can go to an instant-eligible debit card OR bank account, so
  // list all external accounts and inspect available_payout_methods (present on
  // both Card and BankAccount objects).
  const externals = await stripe.accounts.listExternalAccounts(accountId, {
    limit: 100,
  });

  let hasDebitCard = false;
  let instantCard = false;
  let instantBank = false;
  for (const ea of externals.data) {
    const methods = ea.available_payout_methods ?? [];
    const isInstant = methods.includes("instant");
    if (ea.object === "card") {
      hasDebitCard = true;
      if (isInstant) instantCard = true;
    } else if (ea.object === "bank_account" && isInstant) {
      instantBank = true;
    }
  }

  const hasInstantDestination = instantCard || instantBank;
  const instantVia: AccountFlags["instantVia"] = instantCard
    ? "card"
    : instantBank
      ? "bank"
      : null;

  const flags: AccountFlags = {
    payoutsEnabled,
    hasDebitCard,
    hasInstantDestination,
    instantVia,
    instantEligible: payoutsEnabled && hasInstantDestination,
  };

  await setAccountFlags(accountId, flags);
  return flags;
}
