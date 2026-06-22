"use client";

import { useState } from "react";
import TransferConsole from "./TransferConsole";
import LedgerConsole from "./LedgerConsole";
import PayrollConsole from "./PayrollConsole";

type Tab = "transfers" | "ledger" | "payroll";

export default function AdminTabs() {
  const [tab, setTab] = useState<Tab>("transfers");

  const tabs: { id: Tab; label: string }[] = [
    { id: "transfers", label: "Transfers" },
    { id: "ledger", label: "Accounting" },
    { id: "payroll", label: "Payroll" },
  ];

  return (
    <div className="space-y-6">
      <div className="inline-flex gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "transfers" && <TransferConsole />}
      {tab === "ledger" && <LedgerConsole />}
      {tab === "payroll" && <PayrollConsole />}
    </div>
  );
}
