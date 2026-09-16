"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Source = "FILE_TREE" | "FILE_CONTENT" | "ERROR_MESSAGE";

interface Deviation {
  path: string;
  reason: string;
  severity: "low" | "medium" | "high";
  touchesNonGoal: boolean;
}

const SEVERITY_STYLE: Record<Deviation["severity"], string> = {
  low: "border-zinc-300 bg-zinc-50",
  medium: "border-amber-300 bg-amber-50",
  high: "border-red-300 bg-red-50",
};

export function PasteBack({ projectId }: { projectId: string }) {
  const [source, setSource] = useState<Source>("FILE_TREE");
  const [content, setContent] = useState("");
  const [deviations, setDeviations] = useState<Deviation[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuing, setQueuing] = useState<number | null>(null);
  const [queued, setQueued] = useState<Set<number>>(new Set());

  async function check() {
    setChecking(true);
    setError(null);
    setDismissed(new Set());
    const res = await fetch(`/api/projects/${projectId}/code-state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, content }),
    });
    setChecking(false);
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "Gagal cek kode");
      return;
    }
    const codeState = await res.json();
    setDeviations(codeState.deviations);
  }

  async function addToScope(i: number, d: Deviation) {
    setQueuing(i);
    const res = await fetch(`/api/projects/${projectId}/changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: `Deviasi ditemukan di ${d.path}: ${d.reason}` }),
    });
    setQueuing(null);
    if (res.ok) {
      setQueued((prev) => new Set(prev).add(i));
    }
  }

  return (
    <div className="rounded border p-4 space-y-3">
      <h2 className="text-sm font-semibold">Cek kondisi kode</h2>
      <select
        value={source}
        onChange={(e) => setSource(e.target.value as Source)}
        className="rounded border p-1 text-sm"
      >
        <option value="FILE_TREE">File tree</option>
        <option value="FILE_CONTENT">Isi file</option>
        <option value="ERROR_MESSAGE">Pesan error</option>
      </select>
      <textarea
        className="w-full rounded border p-2 text-sm font-mono"
        rows={6}
        placeholder="Tempel di sini…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button size="sm" disabled={checking || !content.trim()} onClick={check}>
        {checking ? "Mengecek…" : "Check"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {deviations && (
        <div className="space-y-2">
          {deviations.length === 0 ? (
            <p className="text-sm text-zinc-500">Tidak ada deviasi ditemukan.</p>
          ) : (
            deviations.map((d, i) =>
              dismissed.has(i) ? null : (
                <div key={i} className={`rounded border p-2 text-sm ${SEVERITY_STYLE[d.severity]}`}>
                  <p className="font-mono text-xs">{d.path}</p>
                  <p>{d.reason}</p>
                  <p className="text-xs uppercase">{d.severity}</p>
                  <div className="mt-1 flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={queuing === i || queued.has(i)}
                      onClick={() => addToScope(i, d)}
                    >
                      {queued.has(i) ? "Change request diajukan ✓" : "Masukkan ke scope"}
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => setDismissed((prev) => new Set(prev).add(i))}>
                      Abaikan
                    </Button>
                  </div>
                </div>
              )
            )
          )}
        </div>
      )}
    </div>
  );
}
