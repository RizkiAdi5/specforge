"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Summary {
  entities: number;
  stories: number;
  decisions: number;
  assumptions: number;
  tasks: number;
  invalidatedTasks: string[];
}

interface ChangeRequestRow {
  id: string;
  description: string;
  status: "ANALYZING" | "AWAITING_APPROVAL" | "APPLIED" | "DISCARDED";
  impactSet: string[];
  createdAt: string;
  summary?: Summary;
}

export default function ChangesPage() {
  const { id } = useParams<{ id: string }>();
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ChangeRequestRow | null>(null);
  const [history, setHistory] = useState<ChangeRequestRow[]>([]);
  const [acting, setActing] = useState(false);

  const loadHistory = useCallback(() => {
    fetch(`/api/projects/${id}/changes`)
      .then((res) => res.json())
      .then((body) => setHistory(body.changes));
  }, [id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    const res = await fetch(`/api/projects/${id}/changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    setAnalyzing(false);
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "Gagal analisis");
      return;
    }
    const body = await res.json();
    setCurrent(body);
    setDescription("");
    loadHistory();
  }

  async function apply() {
    if (!current) return;
    setActing(true);
    await fetch(`/api/changes/${current.id}/apply`, { method: "POST" });
    setActing(false);
    setCurrent(null);
    loadHistory();
  }

  async function discard() {
    if (!current) return;
    setActing(true);
    await fetch(`/api/changes/${current.id}/discard`, { method: "POST" });
    setActing(false);
    setCurrent(null);
    loadHistory();
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Change request</h1>

      <div className="space-y-2">
        <textarea
          className="w-full rounded border p-2 text-sm"
          rows={3}
          placeholder="Jelaskan perubahan yang kamu mau…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button disabled={analyzing || !description.trim()} onClick={analyze}>
          {analyzing ? "Menganalisis…" : "Analisis dampak"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {current && current.summary && (
        <div className="space-y-2 rounded border p-4">
          <p className="text-sm">
            Terdampak: {current.summary.entities} entitas, {current.summary.stories} story,{" "}
            {current.summary.decisions} keputusan, {current.summary.assumptions} asumsi, {current.summary.tasks} task
          </p>
          {current.summary.invalidatedTasks.length > 0 && (
            <p className="text-sm text-red-700">
              Task DONE yang jadi tidak valid: {current.summary.invalidatedTasks.join(", ")}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={acting} onClick={apply}>
              Setujui
            </Button>
            <Button size="sm" variant="outline" disabled={acting} onClick={discard}>
              Batalkan
            </Button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium mb-2">Riwayat</h2>
        <ul className="space-y-2">
          {history.map((c) => (
            <li key={c.id} className="rounded border p-2 text-sm">
              <p>{c.description}</p>
              <p className="text-xs text-zinc-500">
                {c.status} — {c.impactSet.length} refId terdampak
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
