"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface UsageLogRow {
  id: string;
  actionType: string;
  model: string;
  creditCost: number;
  succeeded: boolean;
  createdAt: string;
}

interface Usage {
  plan: string;
  creditBalance: number;
  allotment: number;
  percentRemaining: number;
  lowCredit: boolean;
  projectSlotMax: number;
  history: UsageLogRow[];
}

export default function BillingPage() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((res) => res.json())
      .then(setUsage);
  }, []);

  if (!usage) return <div className="p-8">Memuat…</div>;

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Billing</h1>

      <div className="space-y-1">
        <p className="text-sm">
          Plan: <span className="font-medium">{usage.plan}</span>
        </p>
        <p className="text-sm">
          Sisa credit: <span className="font-medium">{usage.creditBalance}</span> / {usage.allotment} ({usage.percentRemaining}%)
        </p>
        <p className="text-sm">Slot proyek: {usage.projectSlotMax}</p>
      </div>

      {usage.lowCredit && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Credit kamu tinggal sedikit.
        </div>
      )}

      <div className="space-x-2">
        <Button disabled title="Pembayaran belum tersedia">
          Upgrade plan
        </Button>
        <Button variant="outline" disabled title="Pembayaran belum tersedia">
          Top-up credit
        </Button>
      </div>
      <p className="text-xs text-zinc-500">Pembayaran belum tersedia — semua akun masih di plan FREE untuk saat ini.</p>

      <div>
        <h2 className="text-sm font-medium mb-2">Riwayat pemakaian</h2>
        <ul className="space-y-1 text-sm">
          {usage.history.map((h) => (
            <li key={h.id} className="flex justify-between">
              <span>
                {h.actionType} ({h.model}) {!h.succeeded && "— gagal"}
              </span>
              <span>{h.creditCost} credit</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
