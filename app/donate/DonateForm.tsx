"use client";

import { useMemo, useState } from "react";

type Preset = { amount: number; impact: string };

const PRESETS: Preset[] = [
  { amount: 25, impact: "Supplies a learner with hands-on course materials." },
  { amount: 50, impact: "Funds a week of after-school education for a child." },
  { amount: 100, impact: "Helps stock a community health & wellness kit." },
  { amount: 250, impact: "Backs sustainable repairs for an affordable home." },
  { amount: 500, impact: "Powers a local equality & opportunity workshop." },
  { amount: 1000, impact: "Seeds a new neighborhood living-systems project." },
];

export default function DonateForm() {
  const [recurring, setRecurring] = useState(false);
  const [selected, setSelected] = useState<number | "custom">(50);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = useMemo(() => {
    if (selected === "custom") {
      const n = Number(custom);
      return Number.isFinite(n) ? n : 0;
    }
    return selected;
  }, [selected, custom]);

  const activeImpact = useMemo(() => {
    if (selected === "custom") return null;
    return PRESETS.find((p) => p.amount === selected)?.impact ?? null;
  }, [selected]);

  async function handleDonate() {
    setError(null);
    if (!amount || amount < 1) {
      setError("Please choose or enter an amount of at least $1.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          recurring,
          name: name || undefined,
          email: email || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Could not start checkout.");
      }
      // Hand off to Stripe's secure hosted Checkout.
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl md:p-8">
      {/* Frequency toggle */}
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-slate-950 p-1">
        <button
          type="button"
          onClick={() => setRecurring(false)}
          className={`rounded-full py-2 text-sm font-semibold transition ${
            !recurring
              ? "bg-emerald-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          One-time
        </button>
        <button
          type="button"
          onClick={() => setRecurring(true)}
          className={`rounded-full py-2 text-sm font-semibold transition ${
            recurring
              ? "bg-emerald-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Monthly
        </button>
      </div>

      {/* Preset amounts */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {PRESETS.map((p) => (
          <button
            key={p.amount}
            type="button"
            onClick={() => setSelected(p.amount)}
            className={`rounded-xl border py-3 text-lg font-bold transition ${
              selected === p.amount
                ? "border-emerald-500 bg-emerald-500/10 text-white"
                : "border-white/10 bg-slate-950 text-slate-300 hover:border-white/25"
            }`}
          >
            ${p.amount}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="mb-2">
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 transition ${
            selected === "custom"
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-white/10 bg-slate-950"
          }`}
        >
          <span className="text-lg font-bold text-slate-400">$</span>
          <input
            type="number"
            min="1"
            step="1"
            value={custom}
            placeholder="Other amount"
            onChange={(e) => {
              setCustom(e.target.value);
              setSelected("custom");
            }}
            onFocus={() => setSelected("custom")}
            className="w-full bg-transparent py-3 text-lg font-semibold text-white outline-none"
          />
        </div>
      </div>

      <p className="mb-6 min-h-[1.25rem] text-sm text-emerald-300/90">
        {activeImpact ??
          (selected === "custom" && amount >= 1
            ? "Thank you — every dollar compounds in a living system."
            : "")}
      </p>

      {/* Optional donor details */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for receipt (optional)"
          className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleDonate}
        disabled={loading}
        className="w-full rounded-full bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? "Redirecting to secure checkout…"
          : `Donate ${amount >= 1 ? `$${amount}` : ""}${
              recurring ? " / month" : ""
            }`}
      </button>

      <p className="mt-4 text-center text-xs text-slate-500">
        🔒 Secure payment via Stripe. You can cancel a monthly gift anytime.
      </p>
    </div>
  );
}
