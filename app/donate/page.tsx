import SiteHeader from "@/app/components/SiteHeader";
import SiteFooter from "@/app/components/SiteFooter";
import DonateForm from "./DonateForm";

export const metadata = {
  title: "Donate · VA Corp",
  description:
    "Fund equality and sustainability in housing, education, and healthcare. Your gift powers living-systems initiatives that regenerate communities.",
};

const stats = [
  { value: "100%", label: "mission-driven, non-profit" },
  { value: "3", label: "interconnected initiatives" },
  { value: "∞", label: "compounding community impact" },
];

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader />

      <main>
        {/* Hero + form */}
        <section className="relative overflow-hidden bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
            <div>
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Your gift, multiplied
              </span>
              <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
                Don&apos;t just give.{" "}
                <span className="bg-linear-to-r from-emerald-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                  Grow something.
                </span>
              </h1>
              <p className="mt-6 max-w-md text-lg text-slate-300">
                A donation to VA Corp doesn&apos;t disappear into one program —
                it feeds a living system where housing, education, and healthcare
                reinforce one another. Plant a seed; watch a community
                regenerate.
              </p>

              <dl className="mt-10 grid grid-cols-3 gap-4">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center"
                  >
                    <dt className="text-2xl font-bold text-white">{s.value}</dt>
                    <dd className="mt-1 text-xs text-slate-400">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <DonateForm />
          </div>
        </section>

        {/* Where it goes */}
        <section className="mx-auto max-w-5xl px-6 py-20">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-400">
              Where your money goes
            </p>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Every dollar does triple duty
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-linear-to-b from-emerald-500/10 to-transparent p-7">
              <h3 className="mb-2 text-lg font-bold text-white">🏡 Housing</h3>
              <p className="text-sm text-slate-400">
                Affordable, resilient homes that stabilize families and
                regenerate the neighborhoods around them.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-linear-to-b from-blue-500/10 to-transparent p-7">
              <h3 className="mb-2 text-lg font-bold text-white">📚 Education</h3>
              <p className="text-sm text-slate-400">
                Real-world, future-ready learning that adapts to each student and
                opens doors that stay open.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-linear-to-b from-violet-500/10 to-transparent p-7">
              <h3 className="mb-2 text-lg font-bold text-white">
                ❤️ Healthcare
              </h3>
              <p className="text-sm text-slate-400">
                Whole-person care that closes access gaps and meets people where
                they are.
              </p>
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
            <p className="text-slate-300">
              &ldquo;The best time to plant a tree was twenty years ago. The
              second best time is now.&rdquo;
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Be the reason a community grows.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
