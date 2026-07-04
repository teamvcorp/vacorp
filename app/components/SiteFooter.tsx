import Image from "next/image";
import Link from "next/link";
import { PROGRAMS } from "@/lib/site";

export default function SiteFooter() {
  return (
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
          <Link href="/#mission" className="transition hover:text-white">
            Mission
          </Link>
          <Link href="/donate" className="transition hover:text-white">
            Donate
          </Link>
          <Link href="/contact" className="transition hover:text-white">
            Contact
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-white/10 px-3 py-1 text-slate-500 transition hover:border-white/20 hover:text-slate-300"
          >
            Admin
          </Link>
        </div>
      </div>

      {/* Sister programs: dofollow cross-links across the VA Corp network for SEO.
          Anchor text uses the descriptive "Name — Focus" form. rel="noopener"
          protects against reverse-tabnabbing without adding nofollow, so link
          equity still flows. See SEO-BACKLINKS.md. */}
      <nav
        aria-label="Sister programs"
        className="mx-auto max-w-6xl border-t border-white/5 px-6 py-8"
      >
        <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
          Sister programs
        </h2>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-slate-400">
          {PROGRAMS.map((program) => (
            <li key={program.url}>
              <a
                href={program.url}
                target="_blank"
                rel="noopener"
                className="transition hover:text-white"
              >
                {program.name} — {program.focus}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-white/5 py-5 text-center text-xs text-slate-600">
        &copy; {new Date().getFullYear()} VA Corp. All rights reserved.
      </div>
    </footer>
  );
}
