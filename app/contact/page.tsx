import SiteHeader from "@/app/components/SiteHeader";
import SiteFooter from "@/app/components/SiteFooter";
import ContactForm from "./ContactForm";

export const metadata = {
  title: "Contact",
  description:
    "Partner, volunteer, or just say hello. Reach the VA Corp team and join the movement for equality and sustainability.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact · VA Corp",
    description:
      "Partner, volunteer, or just say hello. Join the movement for equality and sustainability.",
    url: "/contact",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader />

      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 top-1/2 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-start gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-400">
              Get in touch
            </p>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              Let&apos;s build something that gives back.
            </h1>
            <p className="mt-6 max-w-md text-lg text-slate-300">
              Whether you want to partner, volunteer, bring an initiative to your
              community, or simply learn more — we&apos;d love to hear from you.
            </p>

            <div className="mt-10 space-y-4 text-sm">
              <div className="flex items-center gap-3 text-slate-300">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
                  ✉️
                </span>
                <a
                  href="mailto:teamvcorp@thevacorp.com"
                  className="transition hover:text-white"
                >
                  teamvcorp@thevacorp.com
                </a>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
                  🌱
                </span>
                Non-profit · Equality &amp; sustainability for all
              </div>
            </div>
          </div>

          <ContactForm />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
