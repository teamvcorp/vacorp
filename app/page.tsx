import Image from "next/image";
import Link from "next/link";

const initiatives = [
  {
    tag: "Housing",
    title: "Dignified, Sustainable Homes",
    body: "Designing and supporting living spaces that are affordable, resilient, and built to regenerate the communities around them — not just shelter people, but help them thrive.",
    accent: "from-emerald-500/20 to-emerald-500/0",
    dot: "bg-emerald-400",
  },
  {
    tag: "Education",
    title: "Learning as a Living System",
    body: "Real-world, future-ready education that adapts to each learner. We treat knowledge like an ecosystem — collaborative, hands-on, and rooted in equity for every student.",
    accent: "from-blue-500/20 to-blue-500/0",
    dot: "bg-blue-400",
  },
  {
    tag: "Healthcare",
    title: "Care That Reaches Everyone",
    body: "Whole-person health initiatives that close gaps in access. We build sustainable models of care that meet people where they are and grow with the communities they serve.",
    accent: "from-violet-500/20 to-violet-500/0",
    dot: "bg-violet-400",
  },
];

const principles = [
  {
    title: "Equality by design",
    body: "Every initiative starts from the question: who is being left out — and how do we build them in from the ground up?",
  },
  {
    title: "Sustainable by nature",
    body: "We model our work on living systems: regenerative, interdependent, and built to last beyond any single program.",
  },
  {
    title: "Community-powered",
    body: "Lasting change is grown, not imposed. We partner with the people we serve and measure success by their flourishing.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="#top" className="flex items-center gap-3">
            <Image
              src="/images/vaLogoRevamp.png"
              alt="VA Corp"
              width={40}
              height={40}
              priority
            />
            <span className="text-lg font-bold tracking-tight">VA CORP</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#mission" className="transition hover:text-white">
              Mission
            </a>
            <a href="#initiatives" className="transition hover:text-white">
              Initiatives
            </a>
            <a href="#approach" className="transition hover:text-white">
              Our Approach
            </a>
            <a href="#involved" className="transition hover:text-white">
              Get Involved
            </a>
          </div>
          <a
            href="#involved"
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Get Involved
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section
        id="top"
        className="relative overflow-hidden bg-linear-to-br from-slate-900 via-slate-800 to-slate-900"
      >
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center md:py-32">
          <Image
            src="/images/vaLogoRevamp.png"
            alt="VA Corp Logo"
            width={130}
            height={130}
            priority
            className="mb-8 drop-shadow-2xl"
          />
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-slate-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Non-profit · Educational · Mission-driven
          </span>
          <h1 className="max-w-4xl text-balance text-5xl font-bold leading-tight tracking-tight text-white md:text-7xl">
            Living systems for a{" "}
            <span className="bg-linear-to-r from-emerald-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
              more equal, sustainable
            </span>{" "}
            world.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-300 md:text-xl">
            VA Corp is a non-profit educational organization advancing equality
            and sustainability across housing, education, and healthcare — by
            building initiatives that grow and adapt like the living systems
            they serve.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#involved"
              className="rounded-full bg-blue-600 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
            >
              Join the movement
            </a>
            <a
              href="#initiatives"
              className="rounded-full border border-white/15 bg-white/5 px-7 py-3 text-base font-semibold text-white transition hover:bg-white/10"
            >
              Explore our work
            </a>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section id="mission" className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-400">
          Our Mission
        </p>
        <h2 className="text-balance text-3xl font-bold leading-snug text-white md:text-4xl">
          We believe the systems that shape our lives — where we live, how we
          learn, the care we receive — should work for{" "}
          <span className="text-emerald-400">everyone</span>.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          So we build them differently. Treating housing, education, and
          healthcare as interconnected living systems, VA Corp designs
          initiatives that are equitable by design and sustainable by nature —
          so communities don&apos;t just survive, they regenerate.
        </p>
      </section>

      {/* Initiatives */}
      <section id="initiatives" className="bg-slate-900/40 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-400">
              What We Do
            </p>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Three initiatives, built as one system
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Housing, education, and healthcare aren&apos;t separate problems —
              each one is designed to reinforce the other two, with equality and
              sustainability woven through all of them.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {initiatives.map((it) => (
              <div
                key={it.tag}
                className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-b ${it.accent} p-8 transition hover:-translate-y-1 hover:border-white/20`}
              >
                <div className="mb-5 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${it.dot}`} />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">
                    {it.tag}
                  </span>
                </div>
                <h3 className="mb-3 text-xl font-bold text-white">
                  {it.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-400">
                  {it.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Approach */}
      <section id="approach" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-400">
            Our Approach
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Why &ldquo;living systems&rdquo;?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-400">
            Healthy ecosystems aren&apos;t built and abandoned — they adapt,
            share resources, and renew themselves. We bring that same logic to
            social change, powering platforms like{" "}
            <a
              href="https://edynsgate.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-300 underline-offset-4 transition hover:text-blue-200 hover:underline"
            >
              Edynsgate
            </a>{" "}
            — our life-systems platform connecting housing, opportunity, and
            community.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {principles.map((p, i) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/10 bg-white/2 p-8"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-300">
                {i + 1}
              </div>
              <h3 className="mb-2 text-lg font-bold text-white">{p.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Get Involved CTA */}
      <section id="involved" className="px-6 pb-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-blue-600/20 via-emerald-600/10 to-violet-600/20 px-8 py-16 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute left-1/4 top-0 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="text-balance text-3xl font-bold text-white md:text-4xl">
              Help us build systems that give back.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-300">
              Whether you want to partner, volunteer, or support our work — there
              is a place for you in this movement.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="mailto:teamvcorp@thevacorp.com"
                className="rounded-full bg-white px-7 py-3 text-base font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Partner with us
              </a>
              <a
                href="mailto:teamvcorp@thevacorp.com"
                className="rounded-full border border-white/20 bg-white/5 px-7 py-3 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Volunteer
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/images/vaLogoRevamp.png"
              alt="VA Corp"
              width={32}
              height={32}
            />
            <div className="text-sm text-slate-400">
              <span className="font-semibold text-slate-200">VA Corp</span> ·
              Equality &amp; sustainability for all.
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="#mission" className="transition hover:text-white">
              Mission
            </a>
            <a href="#initiatives" className="transition hover:text-white">
              Initiatives
            </a>
            <a
              href="mailto:teamvcorp@thevacorp.com"
              className="transition hover:text-white"
            >
              Contact
            </a>
            <Link
              href="/admin"
              className="rounded-full border border-white/10 px-3 py-1 text-slate-500 transition hover:border-white/20 hover:text-slate-300"
            >
              Admin
            </Link>
          </div>
        </div>
        <div className="border-t border-white/5 py-5 text-center text-xs text-slate-600">
          &copy; {new Date().getFullYear()} VA Corp. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
