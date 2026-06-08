import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import SiteFooter from "@/app/components/SiteFooter";
import { stripe } from "@/lib/stripe";

export const metadata = {
  title: "Thank you · VA Corp",
};

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(minor / 100);
  } catch {
    return `$${(minor / 100).toFixed(2)}`;
  }
}

export default async function DonateSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let amountLabel: string | null = null;
  let donorName: string | null = null;
  let recurring = false;

  if (session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.amount_total != null) {
        amountLabel = formatMoney(
          session.amount_total,
          session.currency ?? "usd"
        );
      }
      donorName =
        session.metadata?.donor_name ||
        session.customer_details?.name ||
        null;
      recurring = session.mode === "subscription";
    } catch {
      // Non-fatal — still show a generic thank-you.
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/60 p-10 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">
            🌱
          </div>
          <h1 className="text-3xl font-bold text-white">
            Thank you{donorName ? `, ${donorName}` : ""}!
          </h1>
          <p className="mt-4 text-slate-300">
            {amountLabel ? (
              <>
                Your {recurring ? "monthly " : ""}gift of{" "}
                <span className="font-semibold text-emerald-300">
                  {amountLabel}
                </span>{" "}
                is on its way to work.
              </>
            ) : (
              <>Your donation is on its way to work.</>
            )}{" "}
            You just helped a living system grow stronger — across housing,
            education, and healthcare.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            A receipt has been sent to your email.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Back to home
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Get involved further
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
