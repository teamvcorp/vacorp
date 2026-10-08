# Shop integration guide — charge tagging & customer service fee

**Who this is for:** the developer of a shop that takes payments on the VA Corp
platform Stripe account. Follow this and your shop's revenue is attributed
correctly, you get paid the right amount, and your customers can cover the
platform fee at checkout.

---

## How your money flows

1. Your checkout charges the customer on the **platform's** Stripe account. The money
   settles into the platform balance — not your connected account.
2. The platform reads the metadata you stamp on each charge to work out your revenue:
   gross, Stripe's actual fees, and net, straight from Stripe's balance transactions.
3. The platform pays you by transfer to your connected account:
   **owed to you = gross − the platform service fee** (currently **5%** of gross —
   confirm the current rate with the platform operator). The platform pays Stripe's
   processing fees out of that 5%.
4. If you want your customers to cover that fee instead of absorbing it, add a
   **service fee line at checkout** (see below).

**Nothing you don't tag can be paid.** A charge without `shop_id` lands in the
platform's "unattributed" bucket, and historical charges can never be back-filled —
Stripe keeps no record of which shop they came from. Tag from your first deployed
charge onward.

---

## 1. The metadata contract (required)

Stamp these keys on the **PaymentIntent** of every charge you create:

| Key | Required? | Value |
|---|---|---|
| `shop_id` | **Always** | Your shop's permanent id, agreed with the platform operator. Never change it. |
| `source` | **Always** | One of: `register`, `combined`, `terminal`, `shipping`, `partner`, `online` |
| `surcharge_usd` | When charging a service fee | String, exactly 2 decimals, e.g. `"1.45"`. `"0.00"` when the fee is off. |
| `connected_account` | Strongly recommended | Your `acct_…` id — lets the platform route your payouts automatically. |
| `partner_id` | Partner charges only | The referring partner site's id. |

All metadata values are **strings** — numbers must be quoted.

### Stripe Checkout

```js
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: cartLineItems,
  // payment_intent_data.metadata lands on the PaymentIntent — that's where
  // the platform's reporting looks.
  payment_intent_data: {
    metadata: {
      shop_id: process.env.SHOP_ID,            // e.g. "edynsgate-main"
      source: "online",
      surcharge_usd: serviceFeeUsd,            // e.g. "1.45" or "0.00"
      connected_account: process.env.CONNECTED_ACCOUNT_ID, // "acct_..."
    },
  },
  success_url: `${SITE}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${SITE}/checkout/cancel`,
});
```

### Direct PaymentIntent (registers, terminals, custom flows)

```js
const intent = await stripe.paymentIntents.create({
  amount: subtotalCents + serviceFeeCents, // integer cents, fee included
  currency: "usd",
  metadata: {
    shop_id: process.env.SHOP_ID,
    source: "register",
    surcharge_usd: (serviceFeeCents / 100).toFixed(2),
    connected_account: process.env.CONNECTED_ACCOUNT_ID,
  },
});
```

---

## 2. The customer service fee ("leg 1")

The platform withholds its service fee from your payout either way. This section is
how you pass that cost to the customer instead of absorbing it.

### The compliant structure — read this first

Charge it as a **platform service fee on ALL payment methods equally**, named that way
at checkout. Do **not** implement it as a *card surcharge*: card-network rules cap
surcharges around 3% and at your actual processing cost, prohibit them on debit and
prepaid cards entirely, and add disclosure requirements — and 5% breaks those caps.
A flat service fee on every payment method is a different legal structure and is
generally permitted. Same money, different basis. Disclose it clearly at checkout
regardless.

### Implementation

```js
// Gate behind an env flag so the fee can be switched on per deployment.
const SERVICE_FEE_ENABLED = process.env.SERVICE_FEE_ENABLED === "true";
const SERVICE_FEE_RATE = 0.05; // confirm the current rate with the platform operator

/** Integer cents in, integer cents out — never float dollars. */
function computeServiceFeeCents(subtotalCents) {
  if (!SERVICE_FEE_ENABLED) return 0;
  return Math.round(subtotalCents * SERVICE_FEE_RATE);
}
```

Show it to the customer as its own line (Checkout example):

```js
const serviceFeeCents = computeServiceFeeCents(subtotalCents);

const lineItems = [
  ...cartLineItems,
  ...(serviceFeeCents > 0
    ? [{
        price_data: {
          currency: "usd",
          product_data: { name: "Platform service fee" },
          unit_amount: serviceFeeCents,
        },
        quantity: 1,
      }]
    : []),
];
// ...and stamp surcharge_usd: (serviceFeeCents / 100).toFixed(2) in
// payment_intent_data.metadata as shown above.
```

### The pass-through math (worth 15 seconds)

The platform's fee is a percentage of **gross — which includes your service fee**. If
you charge the customer exactly 5% of the subtotal, the platform takes 5% of
subtotal × 1.05, so you under-recover by 0.25% of subtotal. Usually that's fine.
For exact pass-through, gross up instead:

```js
// Fee such that (subtotal + fee) × 5% === fee  →  fee = subtotal × r ÷ (1 − r)
return Math.round(subtotalCents * (SERVICE_FEE_RATE / (1 - SERVICE_FEE_RATE)));
```

Pick one deliberately; either is acceptable to the platform.

---

## 3. Go-live checklist

1. Agree your permanent `shop_id` and confirm your `acct_…` id with the platform
   operator (teamvcorp@thevacorp.com).
2. Deploy tagging. Make one **test-mode** charge; open it in the Stripe Dashboard and
   confirm all metadata keys appear on the PaymentIntent.
3. Ask the operator to confirm the charge shows under your `shop_id` in the platform
   Revenue console — not in "unattributed".
4. Make a test **refund** and confirm your shop's total goes down (refunds are traced
   back through the original payment — your metadata makes that possible).
5. Record your go-live date with the operator. Charges before it can never be
   attributed, so that date explains the boundary in every historical report.
6. Switching the service fee on later? Deploy with `SERVICE_FEE_ENABLED=true` and tell
   the operator the date.

## Gotchas

- **Integer cents everywhere.** Compute money in cents; convert to dollars only for
  display and for the `surcharge_usd` string.
- **`surcharge_usd` is a string with exactly 2 decimals** — `"1.45"`, never `1.45`.
  Malformed values are ignored by the platform's reporting, not fixed up.
- **Don't rename or repurpose keys.** The platform reads these exact names from
  independent shop deployments; partial rollout is expected, renames are not.
- **Metadata belongs on the PaymentIntent.** Refunds carry no metadata of their own —
  the platform resolves them through your PaymentIntent, so that's where the truth
  must live.
