import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <main className="flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="mb-4">
            <Image
              src="/images/vaLogoRevamp.png"
              alt="VA Corp Logo"
              width={200}
              height={200}
              priority
              className="mb-6 drop-shadow-2xl"
            />
            <h1 className="text-6xl font-bold text-white md:text-7xl lg:text-8xl">
              VA CORP
            </h1>
            <div className="mt-2 h-1 w-full bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
          </div>
          
          <h2 className="text-2xl font-semibold text-slate-300 md:text-3xl">
            Under Construction
          </h2>
          
          <p className="max-w-md text-lg text-slate-400 md:text-xl">
            We're working on something exciting. Check back in 2026 for our relaunch.
          </p>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
          <span>Coming Soon</span>
        </div>
        
        <div className="mt-8 text-xs text-slate-600">
          &copy; {new Date().getFullYear()} VA Corp. All rights reserved.
        </div>
      </main>
    </div>
  );
}
