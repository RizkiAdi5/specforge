"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

interface Usage {
  plan: string;
  creditBalance: number;
  allotment: number;
  percentRemaining: number;
  lowCredit: boolean;
}

export function CreditHeader() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  if (!usage) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-white px-4 py-2 text-sm">
      <Link href="/projects" className="font-medium hover:underline">
        SpecForge
      </Link>
      <Link href="/settings/billing" className="hover:underline">
        {usage.creditBalance} credit ({usage.plan})
      </Link>
      {usage.lowCredit && (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
          Credit di bawah 20% —{" "}
          <Link href="/settings/billing" className="underline">
            upgrade atau top-up
          </Link>
        </span>
      )}
      <div className="ml-auto">
        <UserButton />
      </div>
    </div>
  );
}
