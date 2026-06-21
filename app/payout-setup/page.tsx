import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import SiteFooter from "@/app/components/SiteFooter";

export const metadata = {
  title: "Payout setup",
  robots: { index: false, follow: false },
};

export default async function PayoutSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; reauth?: string }>;
}) {
  const { success, reauth } = await searchParams;
  const done = success === "true";
  const expired = reauth === "true";

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/60 p-10 text-center shadow-2xl">
          {done ? (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">
                ✅
              </div>
              <h1 className="text-2xl font-bold text-white">
                You&apos;re all set!
              </h1>
              <p className="mt-4 text-slate-300">
                Your debit card has been added. You can now receive instant
                payouts — funds typically arrive within ~30 minutes of being
                sent.
              </p>
            </>
          ) : expired ? (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-3xl">
                ⏳
              </div>
              <h1 className="text-2xl font-bold text-white">Link expired</h1>
              <p className="mt-4 text-slate-300">
                This setup link has expired for your security. Please ask the VA
                Corp team to send you a fresh link.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/15 text-3xl">
                💳
              </div>
              <h1 className="text-2xl font-bold text-white">Payout setup</h1>
              <p className="mt-4 text-slate-300">
                Thanks — you can close this window. If you still need to add your
                debit card, use the link we sent you.
              </p>
            </>
          )}

          <div className="mt-8">
            <Link
              href="/"
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Back to VA Corp
            </Link>
          </div>

          <p className="mt-6 text-xs text-slate-500">
            Questions? Email{" "}
            <a
              href="mailto:teamvcorp@thevacorp.com"
              className="text-slate-400 hover:text-white"
            >
              teamvcorp@thevacorp.com
            </a>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
