import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  // Thrown at first use rather than at import so the rest of the app still builds.
  console.warn("STRIPE_SECRET_KEY is not set. Stripe API calls will fail.");
}

export const stripe = new Stripe(secretKey ?? "", {
  // Pin so behavior is stable across Stripe API upgrades.
  apiVersion: "2026-05-27.dahlia",
  appInfo: { name: "VA Corp Admin" },
});

/** Whether we're talking to Stripe in test mode (sk_test_...) vs live. */
export const isStripeTestMode = (secretKey ?? "").startsWith("sk_test_");
