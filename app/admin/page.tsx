import { auth, signOut } from "@/auth";
import TransferConsole from "./TransferConsole";

export const metadata = {
  title: "Admin · Transfers",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold">VA Corp · Admin</h1>
            <p className="text-xs text-slate-400">
              Signed in as {session?.user?.email ?? "admin"}
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <TransferConsole />
      </main>
    </div>
  );
}
