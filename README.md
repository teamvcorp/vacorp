This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Admin transfers console

A protected admin page at `/admin` lets you move funds from your Stripe **platform
balance** to your **connected accounts** (Stripe Connect transfers).

### Setup

1. Copy the env template and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   - `STRIPE_SECRET_KEY` — your platform secret key (`sk_test_...` to start safely).
   - `AUTH_SECRET` — generate one:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the single admin login.

2. Run `npm run dev`, go to `/admin`, and sign in.

### How it works

- `proxy.ts` gates `/admin/**` behind a NextAuth session (redirects to `/login`).
- `/admin` lists your connected accounts and platform balance, then lets you create
  a transfer after a confirmation step.
- API routes (`/api/admin/*`) re-check the session server-side and call Stripe:
  `accounts.list`, `balance.retrieve`, and `transfers.create`.

### Notes / safeguards

- A transfer requires the destination account to have the **transfers** capability
  active; the dropdown flags accounts that don't.
- Amounts are entered in major units (dollars) and converted to the smallest unit
  server-side; only 2 decimal places are allowed.
- Each transfer sends an idempotency key to prevent accidental double-sends.
- Use a **test-mode** key (`sk_test_...`) until you've verified the flow — the page
  shows a `TEST MODE` badge so you always know which mode you're in.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
