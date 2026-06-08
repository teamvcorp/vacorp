# Stripe Treasury for Platforms — Admin Integration Guide

> **Stack:** Next.js (App Router) · TypeScript · Stripe Treasury for Platforms  
> **Goal:** Give each customer a real bank account (routing + account number), manage their funds, and issue bank verification letters — all from your admin panel.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Access](#2-prerequisites--access)
3. [Environment Variables](#3-environment-variables)
4. [Project File Structure](#4-project-file-structure)
5. [Step 1 — Stripe Dashboard Setup](#5-step-1--stripe-dashboard-setup)
6. [Step 2 — Create Connected Account with Treasury Capability](#6-step-2--create-connected-account-with-treasury-capability)
7. [Step 3 — KYC Onboarding](#7-step-3--kyc-onboarding)
8. [Step 4 — Webhook: Listen for Capability Activation](#8-step-4--webhook-listen-for-capability-activation)
9. [Step 5 — Create the Financial Account](#9-step-5--create-the-financial-account)
10. [Step 6 — Retrieve Account Details](#10-step-6--retrieve-account-details)
11. [Step 7 — Generate Bank Verification Letter (PDF)](#11-step-7--generate-bank-verification-letter-pdf)
12. [Step 8 — Move Money (Admin Funds Management)](#12-step-8--move-money-admin-funds-management)
13. [Step 9 — Admin Page API Routes Summary](#13-step-9--admin-page-api-routes-summary)
14. [Checks — What Stripe Supports](#14-checks--what-stripe-supports)
15. [Key Limitations & Caveats](#15-key-limitations--caveats)
16. [Stripe API Reference Links](#16-stripe-api-reference-links)

---

## 1. Architecture Overview

```
Your Platform (Next.js)
│
├── Admin Page
│   ├── View all connected accounts + balances
│   ├── Fund / withdraw from customer financial accounts
│   ├── Issue bank verification letter (PDF)
│   └── Trigger ACH / wire outbound payments
│
├── Stripe Connect (Custom Accounts)
│   └── One connected account per customer (acct_xxx)
│
└── Stripe Treasury for Platforms
    └── One financial account per connected account (fa_xxx)
        ├── Real routing number (ABA)
        ├── Real account number
        ├── Bank name (Goldman Sachs / Evolve Bank & Trust)
        ├── FDIC-eligible balance up to $250k
        └── Supports ACH in/out + wire transfers
```

**Fund flow:**
```
Third party pays customer → Customer's routing/acct number (ACH/wire)
                         → Stripe financial account (fa_xxx)
                         → Available balance for customer to spend/withdraw
```

---

## 2. Prerequisites & Access

| Requirement | Detail |
|---|---|
| Stripe account | Must be US-based business |
| Connect enabled | Required before Treasury |
| Treasury access (sandbox) | Free — activate in Dashboard |
| Treasury access (live) | Must apply via [Stripe's form](https://go.stripe.global/treasury-inquiry) |
| Account type | **Custom only** — Treasury does not support Standard or Express connected accounts |
| API version | Use latest (check [Stripe changelog](https://docs.stripe.com/changelog)) |

---

## 3. Environment Variables

```bash
# .env.local

STRIPE_SECRET_KEY=sk_test_...           # Stripe secret key (never expose client-side)
STRIPE_WEBHOOK_SECRET=whsec_...         # From Stripe Dashboard > Webhooks
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_PLATFORM_NAME="Your Platform Name"
```

---

## 4. Project File Structure

```
app/
  api/
    accounts/
      route.ts                  # Create connected account
    onboarding/
      route.ts                  # Generate KYC onboarding link
    financial-accounts/
      route.ts                  # Create financial account
      [id]/
        route.ts                # Get financial account details
    bank-letter/
      route.ts                  # Generate + return PDF letter
    funds/
      topup/route.ts            # Fund a customer's account
      payout/route.ts           # Pay out from a customer's account
    webhooks/
      stripe/route.ts           # Stripe webhook handler

lib/
  stripe/
    client.ts                   # Stripe singleton
    createTreasuryAccount.ts
    createOnboardingLink.ts
    createFinancialAccount.ts
    getFinancialAccount.ts
    moveMoney.ts
  pdf/
    bankLetter.ts               # PDF generation with pdf-lib

components/
  admin/
    AccountList.tsx
    AccountDetail.tsx
    FundsPanel.tsx
    BankLetterButton.tsx
```

---

## 5. Step 1 — Stripe Dashboard Setup

### Sandbox (for testing — free, instant)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) and switch to a **Sandbox** environment
2. Navigate to **Balances → Financial accounts**
3. Click **Activate Issuing and Treasury for platforms** — or use this direct link:  
   `https://dashboard.stripe.com/test/treasury`
4. Complete the short onboarding form for your platform account

### Live mode

1. Fill out [Stripe's Treasury inquiry form](https://go.stripe.global/treasury-inquiry)
2. Stripe reviews your business (typically a few days)
3. Once approved, repeat the activation in live mode

> ⚠️ **US only.** Treasury for Platforms is currently only available for US-based commercial businesses with US-based customers.

---

## 6. Step 2 — Create Connected Account with Treasury Capability

### Stripe client singleton

```typescript
// lib/stripe/client.ts
import Stripe from 'stripe'

/**
 * Singleton Stripe client.
 * Always import from here — never instantiate Stripe directly elsewhere.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil', // pin to latest stable version
})
```

### Create account function

```typescript
// lib/stripe/createTreasuryAccount.ts
import { stripe } from './client'

/**
 * Creates a Custom connected account with Treasury (and optionally Issuing) capabilities.
 *
 * Treasury only supports Custom connected accounts where:
 *  - The platform controls the dashboard (type: "none")
 *  - The platform owns loss liability
 *  - The platform collects requirements
 *
 * @param email - The customer's email address
 * @returns The created Stripe Account object (id = connectedAccountId)
 */
export async function createTreasuryConnectedAccount(email: string) {
  const account = await stripe.accounts.create({
    country: 'US',
    email,
    capabilities: {
      transfers:                    { requested: true }, // required for all connected accounts
      treasury:                     { requested: true }, // required for Treasury
      us_bank_account_ach_payments: { requested: true }, // required for ACH in/out
      card_issuing:                 { requested: true }, // optional: for debit cards
    },
    controller: {
      dashboard:              { type: 'none' },         // platform-controlled, no Stripe dashboard
      losses:                 { payments: 'application' }, // your platform absorbs losses
      requirement_collection: 'application',             // your platform collects KYC
      fees:                   { payer: 'application' },
    },
  })

  return account // save account.id to your database as connectedAccountId
}
```

### API route

```typescript
// app/api/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createTreasuryConnectedAccount } from '@/lib/stripe/createTreasuryAccount'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  const account = await createTreasuryConnectedAccount(email)
  return NextResponse.json({ accountId: account.id })
}
```

---

## 7. Step 3 — KYC Onboarding

After creating the connected account, the customer must complete Stripe's KYC form before Treasury capabilities go active.

### Required KYC fields

| Entity Type | Required at Onboarding |
|---|---|
| Individual / Sole proprietor | Legal name, DOB, SSN, business address, phone, MCC, Treasury TOS |
| Company (LLC, Corp, etc.) | EIN, legal entity type, business address, owner name/DOB/SSN, % ownership, Treasury TOS |

### Onboarding link function

```typescript
// lib/stripe/createOnboardingLink.ts
import { stripe } from './client'

/**
 * Generates a one-time Stripe-hosted KYC onboarding URL.
 *
 * SECURITY: Never email or expose this URL directly.
 * Always redirect the authenticated user from within your own app.
 * URLs expire after 5 minutes.
 *
 * @param connectedAccountId - The acct_xxx ID from Step 2
 * @returns A one-time onboarding URL to redirect the user to
 */
export async function createOnboardingLink(connectedAccountId: string) {
  const accountLink = await stripe.accountLinks.create({
    account:     connectedAccountId,
    refresh_url: `${process.env.NEXT_PUBLIC_BASE_URL}/onboarding/refresh`,
    return_url:  `${process.env.NEXT_PUBLIC_BASE_URL}/onboarding/complete`,
    type:        'account_onboarding',
  })

  return accountLink.url
}
```

### API route

```typescript
// app/api/onboarding/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createOnboardingLink } from '@/lib/stripe/createOnboardingLink'

export async function POST(req: NextRequest) {
  const { connectedAccountId } = await req.json()
  const url = await createOnboardingLink(connectedAccountId)
  // Redirect the user to this URL from your frontend — never send it via email
  return NextResponse.json({ url })
}
```

---

## 8. Step 4 — Webhook: Listen for Capability Activation

Onboarding is asynchronous. Listen for `account.updated` to know when Treasury is active and it's safe to create a financial account.

```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createFinancialAccount } from '@/lib/stripe/createFinancialAccount'

/**
 * Stripe sends this webhook when a connected account's capabilities change.
 * When treasury becomes "active", create the financial account for the customer.
 *
 * Set up in Stripe Dashboard → Developers → Webhooks → Add endpoint
 * URL: https://yourdomain.com/api/webhooks/stripe
 * Events to listen for: account.updated
 */
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    // Always verify the webhook signature — never skip this
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account

    const treasuryActive = account.capabilities?.treasury === 'active'

    if (treasuryActive) {
      // ✅ Safe to create the financial account now
      // In production: check your DB first to avoid creating duplicates
      await createFinancialAccount(account.id)
    }
  }

  return NextResponse.json({ received: true })
}
```

---

## 9. Step 5 — Create the Financial Account

Called automatically from your webhook handler once `treasury` capability is active.

```typescript
// lib/stripe/createFinancialAccount.ts
import { stripe } from './client'

/**
 * Creates a Treasury financial account for a connected account.
 *
 * This is the "bank account" — it provides:
 *  - Real routing number (ABA)
 *  - Real account number
 *  - FDIC-eligible balance up to $250,000
 *  - ACH inbound/outbound transfers
 *  - US domestic wire transfers
 *
 * @param connectedAccountId - The acct_xxx ID of the customer
 * @returns The created FinancialAccount object (id = fa_xxx)
 */
export async function createFinancialAccount(connectedAccountId: string) {
  const financialAccount = await stripe.treasury.financialAccounts.create(
    {
      supported_currencies: ['usd'],
      features: {
        card_issuing:        { requested: true },  // needed to issue debit cards later
        deposit_insurance:   { requested: true },  // FDIC insurance eligibility
        financial_addresses: {
          aba: { requested: true },                // gives real routing + account numbers
        },
        inbound_transfers: {
          ach: { requested: true },                // customer/third party can fund via ACH
        },
        intra_stripe_flows:  { requested: true },  // instant transfers between financial accounts
        outbound_payments: {
          ach:              { requested: true },   // send money to external accounts via ACH
          us_domestic_wire: { requested: true },   // send money via wire
        },
        outbound_transfers: {
          ach:              { requested: true },   // withdraw to connected account's own bank
          us_domestic_wire: { requested: true },
        },
      },
    },
    {
      stripeAccount: connectedAccountId, // scoped to this customer's account
    }
  )

  // Save financialAccount.id (fa_xxx) to your database linked to this customer
  return financialAccount
}
```

> **Note:** Features like `financial_addresses.aba` may take a few minutes to activate after the financial account is created. Poll or use webhooks (`treasury.financial_account.features_status_updated`) to confirm.

---

## 10. Step 6 — Retrieve Account Details

```typescript
// lib/stripe/getFinancialAccount.ts
import { stripe } from './client'

export interface FinancialAccountDetails {
  financialAccountId: string
  accountHolderName:  string | null
  accountNumber:      string | null   // full unmasked number — handle with care
  routingNumber:      string | null
  bankName:           string | null
  status:             string
  balance:            {
    cash:    { usd: number } // in cents
    inbound_pending:  { usd: number }
    outbound_pending: { usd: number }
  }
}

/**
 * Retrieves financial account details including the full account number.
 *
 * SECURITY: The account_number field is masked by default.
 * We use the expand[] parameter to retrieve the full number.
 * Never log this value or store it unencrypted.
 *
 * @param connectedAccountId  - The acct_xxx ID
 * @param financialAccountId  - The fa_xxx ID (stored in your DB from Step 5)
 */
export async function getFinancialAccountDetails(
  connectedAccountId: string,
  financialAccountId: string
): Promise<FinancialAccountDetails> {
  const [financialAccount, balance] = await Promise.all([
    stripe.treasury.financialAccounts.retrieve(
      financialAccountId,
      {
        // account_number is hidden by default — must explicitly expand
        expand: ['financial_addresses.aba.account_number'],
      },
      { stripeAccount: connectedAccountId }
    ),
    stripe.treasury.financialAccounts.retrieveBalance(
      financialAccountId,
      {},
      { stripeAccount: connectedAccountId }
    ),
  ])

  const aba = financialAccount.financial_addresses?.find(
    (addr) => addr.type === 'aba'
  )?.aba

  return {
    financialAccountId: financialAccount.id,
    accountHolderName:  aba?.account_holder_name  ?? null,
    accountNumber:      aba?.account_number        ?? null,
    routingNumber:      aba?.routing_number        ?? null,
    bankName:           aba?.bank_name             ?? null,
    status:             financialAccount.status,
    balance:            balance.cash
      ? { cash: balance.cash, inbound_pending: balance.inbound_pending, outbound_pending: balance.outbound_pending }
      : { cash: { usd: 0 }, inbound_pending: { usd: 0 }, outbound_pending: { usd: 0 } },
  }
}
```

### API route

```typescript
// app/api/financial-accounts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getFinancialAccountDetails } from '@/lib/stripe/getFinancialAccount'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const connectedAccountId = req.headers.get('x-connected-account-id')!
  const details = await getFinancialAccountDetails(connectedAccountId, params.id)
  return NextResponse.json(details)
}
```

---

## 11. Step 7 — Generate Bank Verification Letter (PDF)

> **Important:** Stripe does not generate bank letters natively.  
> You build it yourself using the real account data from Step 6.  
> The letter is legally meaningful because it contains a real ABA routing/account number backed by Stripe's banking partner (e.g. Goldman Sachs or Evolve Bank & Trust).

### Install dependency

```bash
npm install pdf-lib
```

### PDF generator

```typescript
// lib/pdf/bankLetter.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface BankLetterData {
  customerName:      string
  accountHolderName: string | null
  accountNumber:     string | null
  routingNumber:     string | null
  bankName:          string | null
  issuedDate:        string
  platformName:      string
  platformUrl:       string
}

/**
 * Generates a formatted bank account verification letter as a PDF.
 *
 * Used by customers to prove their bank account details to third-party
 * providers (payroll platforms, gig work apps, payment processors, etc.)
 * that pay them via ACH or wire transfer.
 *
 * The letter includes the real bank name from Stripe's banking partner,
 * routing number, full account number, and FDIC insurance notice.
 */
export async function generateBankLetterPdf(data: BankLetterData): Promise<Buffer> {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([612, 792]) // US Letter: 8.5" × 11"

  const font     = await doc.embedFont(StandardFonts.Helvetica)
  const bold     = await doc.embedFont(StandardFonts.HelveticaBold)
  const { width, height } = page.getSize()
  const margin   = 72     // 1 inch
  let   y        = height - margin

  // ── Layout helpers ────────────────────────────────────────────────
  const write = (
    text:    string,
    size:    number  = 11,
    isBold:  boolean = false,
    indent:  number  = 0,
    color                    = rgb(0.1, 0.1, 0.1)
  ) => {
    page.drawText(text, { x: margin + indent, y, size, font: isBold ? bold : font, color })
    y -= size * 1.7
  }

  const divider = () => {
    page.drawLine({
      start: { x: margin, y: y + 6 },
      end:   { x: width - margin, y: y + 6 },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    })
    y -= 18
  }

  // ── Header ────────────────────────────────────────────────────────
  write(data.platformName, 20, true)
  write('Bank Account Verification Letter', 13, false, 0, rgb(0.2, 0.2, 0.2))
  write(`Date Issued: ${data.issuedDate}`, 10)
  y -= 10
  divider()

  // ── Salutation ────────────────────────────────────────────────────
  write('To Whom It May Concern,', 11)
  y -= 6
  write(
    `This letter confirms that the individual or entity named below holds an active`,
    11
  )
  write(
    `financial account on the ${data.platformName} platform, as detailed below.`,
    11
  )
  y -= 14

  // ── Account details block ─────────────────────────────────────────
  const field = (label: string, value: string | null) => {
    write(label, 10, true)
    write(value ?? 'N/A', 11, false, 20)
    y -= 2
  }

  field('Account Holder Name:', data.accountHolderName)
  field('Customer Name:',       data.customerName)
  field('Bank Name:',           data.bankName)
  field('Routing Number (ABA):', data.routingNumber)
  field('Account Number:',      data.accountNumber)
  field('Account Type:',        'Checking (Financial Account)')
  field('Account Status:',      'Active')
  field('Supported Networks:',  'ACH, US Domestic Wire')

  y -= 10
  divider()

  // ── Legal footer ──────────────────────────────────────────────────
  const grey = rgb(0.4, 0.4, 0.4)
  write(
    `This account is held at ${data.bankName ?? 'our banking partner'} through`,
    9, false, 0, grey
  )
  write(
    `${data.platformName}, powered by Stripe Treasury for Platforms.`,
    9, false, 0, grey
  )
  write(
    `Funds in this account are eligible for FDIC pass-through deposit insurance`,
    9, false, 0, grey
  )
  write(
    `up to $250,000 USD per depositor, subject to FDIC requirements.`,
    9, false, 0, grey
  )
  y -= 8
  write(`${data.platformName} — ${data.platformUrl}`, 9, false, 0, grey)

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes)
}
```

### API route

```typescript
// app/api/bank-letter/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getFinancialAccountDetails } from '@/lib/stripe/getFinancialAccount'
import { generateBankLetterPdf }      from '@/lib/pdf/bankLetter'

/**
 * POST /api/bank-letter
 *
 * Fetches live financial account data from Stripe Treasury,
 * then generates and returns a formatted PDF verification letter.
 *
 * Body: { connectedAccountId, financialAccountId, customerName }
 */
export async function POST(req: NextRequest) {
  const { connectedAccountId, financialAccountId, customerName } =
    await req.json()

  // 1. Pull live account details from Stripe (includes full account number)
  const details = await getFinancialAccountDetails(
    connectedAccountId,
    financialAccountId
  )

  // 2. Verify the account is open before issuing a letter
  if (details.status !== 'open') {
    return NextResponse.json(
      { error: 'Financial account is not active' },
      { status: 400 }
    )
  }

  // 3. Generate the PDF
  const pdfBuffer = await generateBankLetterPdf({
    customerName,
    accountHolderName: details.accountHolderName,
    accountNumber:     details.accountNumber,
    routingNumber:     details.routingNumber,
    bankName:          details.bankName,
    issuedDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    platformName: process.env.NEXT_PUBLIC_PLATFORM_NAME!,
    platformUrl:  process.env.NEXT_PUBLIC_BASE_URL!,
  })

  // 4. Return as downloadable PDF
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="bank-verification-letter.pdf"',
    },
  })
}
```

### Admin UI component

```tsx
// components/admin/BankLetterButton.tsx
'use client'

interface Props {
  connectedAccountId:  string
  financialAccountId:  string
  customerName:        string
}

/**
 * Admin button that triggers PDF generation and downloads
 * the bank verification letter for the selected customer.
 */
export default function BankLetterButton({
  connectedAccountId,
  financialAccountId,
  customerName,
}: Props) {
  async function handleDownload() {
    const res = await fetch('/api/bank-letter', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ connectedAccountId, financialAccountId, customerName }),
    })

    if (!res.ok) {
      alert('Failed to generate letter. Check that the account is active.')
      return
    }

    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `bank-letter-${customerName.replace(/\s+/g, '-')}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button onClick={handleDownload}>
      Download Bank Verification Letter
    </button>
  )
}
```

---

## 12. Step 8 — Move Money (Admin Funds Management)

### Fund a customer's financial account (platform → customer)

```typescript
// lib/stripe/moveMoney.ts
import { stripe } from './client'

/**
 * Sends funds FROM your platform financial account
 * TO a connected account's financial account.
 *
 * Uses Stripe network (instant) when both accounts are on the same platform.
 *
 * @param connectedAccountId    - The customer's acct_xxx
 * @param financialAccountId    - The customer's fa_xxx
 * @param amountCents           - Amount in cents (e.g. 10000 = $100.00)
 * @param description           - Optional memo shown on statements
 */
export async function fundCustomerAccount(
  connectedAccountId: string,
  financialAccountId: string,
  amountCents:        number,
  description?:       string
) {
  // OutboundPayment: sends from YOUR platform financial account to a customer's
  const payment = await stripe.treasury.outboundPayments.create({
    financial_account: process.env.PLATFORM_FINANCIAL_ACCOUNT_ID!, // your platform's fa_xxx
    amount:            amountCents,
    currency:          'usd',
    description,
    destination_payment_method_data: {
      type: 'financial_account',
      financial_account: financialAccountId,
    },
  })

  return payment
}

/**
 * Sends funds FROM a connected account's financial account
 * TO an external bank account (ACH).
 *
 * Use this when paying out to a third-party that pays the customer.
 *
 * @param connectedAccountId   - The customer's acct_xxx
 * @param financialAccountId   - The customer's fa_xxx
 * @param destinationDetails   - External bank routing + account number
 * @param amountCents          - Amount in cents
 */
export async function payOutToExternalBank(
  connectedAccountId: string,
  financialAccountId: string,
  destinationDetails: {
    accountNumber: string
    routingNumber: string
    accountName:   string
  },
  amountCents: number
) {
  // OutboundPayment: push funds from a financial account to an external bank via ACH
  const payment = await stripe.treasury.outboundPayments.create(
    {
      financial_account: financialAccountId,
      amount:            amountCents,
      currency:          'usd',
      destination_payment_method_data: {
        type: 'us_bank_account',
        us_bank_account: {
          account_holder_type: 'individual',
          account_type:        'checking',
          account_number:      destinationDetails.accountNumber,
          routing_number:      destinationDetails.routingNumber,
        },
        billing_details: {
          name: destinationDetails.accountName,
        },
      },
    },
    { stripeAccount: connectedAccountId }
  )

  return payment
}
```

### Admin API routes for funds management

```typescript
// app/api/funds/topup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { fundCustomerAccount } from '@/lib/stripe/moveMoney'

/** POST — Fund a customer's Treasury account from your platform balance */
export async function POST(req: NextRequest) {
  const { connectedAccountId, financialAccountId, amountCents, description } =
    await req.json()

  const payment = await fundCustomerAccount(
    connectedAccountId,
    financialAccountId,
    amountCents,
    description
  )

  return NextResponse.json({ paymentId: payment.id, status: payment.status })
}
```

```typescript
// app/api/funds/payout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { payOutToExternalBank } from '@/lib/stripe/moveMoney'

/** POST — Pay out from a customer's Treasury account to an external bank */
export async function POST(req: NextRequest) {
  const {
    connectedAccountId,
    financialAccountId,
    amountCents,
    accountNumber,
    routingNumber,
    accountName,
  } = await req.json()

  const payment = await payOutToExternalBank(
    connectedAccountId,
    financialAccountId,
    { accountNumber, routingNumber, accountName },
    amountCents
  )

  return NextResponse.json({ paymentId: payment.id, status: payment.status })
}
```

---

## 13. Step 9 — Admin Page API Routes Summary

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/accounts` | Create connected account with Treasury capability |
| `POST` | `/api/onboarding` | Generate KYC onboarding link |
| `POST` | `/api/webhooks/stripe` | Handle Stripe webhooks (capability activation) |
| `POST` | `/api/financial-accounts` | Create financial account after KYC completes |
| `GET`  | `/api/financial-accounts/[id]` | Get account details (routing, account no, balance) |
| `POST` | `/api/bank-letter` | Generate + download PDF bank verification letter |
| `POST` | `/api/funds/topup` | Fund a customer from platform balance |
| `POST` | `/api/funds/payout` | Pay out from customer account to external bank |

---

## 14. Checks — What Stripe Supports

| Feature | Supported? | Notes |
|---|---|---|
| **Receive checks** (customer deposits a physical check) | ✅ Beta | "Mobile check acceptance" — customer photographs a check; Stripe deposits funds into the financial account. Contact `treasury-support@stripe.com` for access |
| **Issue paper checks** (platform sends physical check to customer) | ❌ No | Stripe does not print/mail checks |
| **Issue digital check equivalents** | ✅ Partial | Use ACH `OutboundPayment` — functionally equivalent for most purposes |
| **Bank verification letter** | ❌ Not native | Build it yourself using the PDF approach in Step 7 above |

### Practical alternative to paper checks

Most third-party providers that previously accepted checks now accept direct deposit via ACH. Share the customer's **routing number + account number** from their financial account (`financial_addresses.aba`) — this is functionally equivalent to a voided check for direct deposit setup.

---

## 15. Key Limitations & Caveats

| Topic | Detail |
|---|---|
| **US only** | Treasury for Platforms is US-only for both platforms and customers |
| **Custom accounts only** | Standard and Express connected accounts cannot use Treasury |
| **Account number security** | The `account_number` field is masked by default. Use `expand[]` to retrieve it. Never log or store unencrypted |
| **FDIC insurance** | Up to $250,000 per depositor, per financial institution — subject to FDIC requirements. Stripe is not itself FDIC-insured; insurance is pass-through via partner banks |
| **Underlying bank** | Backed by Goldman Sachs or Evolve Bank & Trust (not Stripe). This name appears in the financial account data and on your generated letters |
| **Letter acceptance** | Bank letters generated this way are not issued by a licensed bank officer. For institutional use, verify the third party will accept a platform-generated letter |
| **Accounts v2 incompatibility** | The Accounts v2 API does not support Treasury workflows. Use Accounts v1 for `treasury` and `card_issuing` capabilities |
| **Max financial accounts** | Up to 3 financial accounts per connected account |
| **Platform responsibility** | As platform, you are responsible for fraud, loss liability, compliance updates, and KYC requirement changes |

---

## 16. Stripe API Reference Links

| Resource | URL |
|---|---|
| Treasury for Platforms overview | https://docs.stripe.com/treasury/connect |
| How Treasury works | https://docs.stripe.com/treasury/connect/how-financial-accounts-for-platforms-works |
| Get API access (sandbox) | https://docs.stripe.com/treasury/connect/access |
| Connected accounts | https://docs.stripe.com/treasury/connect/account-management/connected-accounts |
| Financial accounts | https://docs.stripe.com/treasury/connect/account-management/financial-accounts |
| Financial account features | https://docs.stripe.com/treasury/connect/account-management/financial-account-features |
| Outbound payments | https://docs.stripe.com/treasury/connect/moving-money/out-of/outbound-payments |
| Outbound transfers | https://docs.stripe.com/treasury/connect/moving-money/out-of/outbound-transfers |
| Move money guide | https://docs.stripe.com/treasury/connect/examples/moving-money |
| Treasury inquiry (live access) | https://go.stripe.global/treasury-inquiry |
| Stripe changelog | https://docs.stripe.com/changelog |

---

*Generated from live Stripe documentation — last verified June 2026.*  
*Always validate against [docs.stripe.com](https://docs.stripe.com) before production use.*
