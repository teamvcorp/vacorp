import Image from "next/image";
import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
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
          <Link href="/#mission" className="transition hover:text-white">
            Mission
          </Link>
          <Link href="/#initiatives" className="transition hover:text-white">
            Initiatives
          </Link>
          <Link href="/#leaders" className="transition hover:text-white">
            Programs
          </Link>
          <Link href="/#approach" className="transition hover:text-white">
            Our Approach
          </Link>
          <Link href="/contact" className="transition hover:text-white">
            Contact
          </Link>
        </div>
        <Link
          href="/donate"
          className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Donate
        </Link>
      </nav>
    </header>
  );
}
