# Instant payouts on Connect — fees and integration notes

Source: https://docs.stripe.com/connect/instant-payouts (fetched 2026-10-08).
Why this file exists: these facts shape `/api/admin/instant/*` and cost real money
if forgotten.

## Who pays what

- **Stripe charges the PLATFORM 1% of every instant payout, no matter what** —
  "irrespective of your monetization decisions… assessed as part of your overall
  Connect fees." Standard (non-instant) payouts are free.
- Per-payout limits in the US: minimum $0.50, maximum $9,999 (these are payout
  amount limits, not fees).
- To pass the cost to the shop, the platform charges an **application fee** on each
  instant payout. This is configured in the Dashboard — **Settings → Connect →
  Platform pricing → Instant Payouts** (fixed or variable, with min/max). There is
  no API parameter for it on `payouts.create`.
- The alternative (account debits via the Charge API) costs extra, needs legal
  consent and same-region accounts — not used here.

## The integration contract (what our code does)

- With platform pricing configured, the connected account's instantly payable
  balance is `balance.instant_available[].net_available[]` (**must be expanded**),
  which is gross minus the application fee, computed **per eligible external
  account**. Stripe's docs warn that monetizing without reading `net_available`
  breaks the integration.
- `/api/admin/instant/status` expands `instant_available.net_available` and
  returns `instantNetAvailable` + `instantFeeConfigured`.
- `/api/admin/instant/payout` validates the amount against `net_available` and
  passes that entry's `destination` on `payouts.create` (required when pricing is
  configured). With no pricing configured it falls back to the gross instant
  balance, and the admin UI shows a warning that the platform is absorbing
  Stripe's 1%.

## Operator setup checklist (one-time, Dashboard)

1. Open **Settings → Connect → Platform pricing → Instant Payouts**
   (test mode: https://dashboard.stripe.com/test/settings/connect/platform_pricing/instant_payouts).
2. Set the application fee to **at least 1%** (e.g. 1.5% with a $0.50 minimum) so
   Stripe's 1% platform charge is covered with margin.
3. The admin Instant payout panel then shows "Instantly payable" net of that fee,
   and the warning banner disappears.
4. Marketing/compliance note from Stripe: any fee you charge for instant payouts
   must be clearly disclosed to the connected accounts.

## Related

- A failed instant payout automatically returns the application fee.
- Funds from card charges are instantly available; ACH funds only after settling.
- Collected fees are visible in Dashboard → Payments → application fees, and each
  fee is paired to its Payout object for reconciliation.
