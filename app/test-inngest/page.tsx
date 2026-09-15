"use client";

import { useState } from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";

export default function TestInngestPage() {
  const [runId, setRunId] = useState<string | null>(null);

  const { data, state } = useInngestSubscription({
    refreshToken: async () => {
      if (!runId) return null;
      const res = await fetch("/api/test-inngest/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      return res.json();
    },
    enabled: !!runId,
    key: runId ?? undefined,
  });

  async function trigger() {
    const res = await fetch("/api/test-inngest/trigger", { method: "POST" });
    const { runId } = await res.json();
    setRunId(runId);
  }

  const latest = data.at(-1);

  return (
    <div className="p-8 space-y-4 max-w-md">
      <button
        onClick={trigger}
        className="rounded bg-black text-white px-4 py-2"
      >
        Jalankan job dummy
      </button>

      {runId && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500">run: {runId} — koneksi: {state}</p>
          <ul className="space-y-1">
            {data.map((event, i) => (
              <li key={i}>
                Langkah {event.data.step}/{event.data.total}: {event.data.label}
                {event.data.done ? " ✓ selesai" : "…"}
              </li>
            ))}
          </ul>
          {!latest && <p>Menunggu progres…</p>}
        </div>
      )}
    </div>
  );
}
