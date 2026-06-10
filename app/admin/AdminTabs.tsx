"use client";

import { useState } from "react";
import TransferConsole from "./TransferConsole";
import LedgerConsole from "./LedgerConsole";

type Tab = "transfers" | "ledger";

export default function AdminTabs() {
  const [tab, setTab] = useState<Tab>("transfers");

  return (
    <div className="space-y-6">
      <div className="inline-flex gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1">
        <button
          onClick={() => setTab("transfers")}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            tab === "transfers"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Transfers
        </button>
        <button
          onClick={() => setTab("ledger")}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            tab === "ledger"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Accounting
        </button>
      </div>

      {tab === "transfers" ? <TransferConsole /> : <LedgerConsole />}
    </div>
  );
}
