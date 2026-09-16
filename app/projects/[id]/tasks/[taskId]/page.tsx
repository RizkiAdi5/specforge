"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface StepSummary {
  id: string;
  refId: string;
  title: string;
  status: string;
}

interface TaskDetail {
  id: string;
  refId: string;
  title: string;
  status: string;
  level: "MILESTONE" | "TASK" | "STEP";
  definitionOfDone: string[];
  steps: StepSummary[];
}

interface PendingAssumption {
  id: string;
  refId: string;
  statement: string;
  question: string;
}

export default function TaskDetailPage() {
  const { taskId } = useParams<{ id: string; taskId: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAssumption[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [insufficientCredit, setInsufficientCredit] = useState(false);

  const loadTask = () => fetch(`/api/tasks/${taskId}`).then((res) => res.json()).then(setTask);

  useEffect(() => {
    loadTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function split() {
    setSplitting(true);
    setError(null);
    setInsufficientCredit(false);
    const res = await fetch(`/api/tasks/${taskId}/split`, { method: "POST" });
    setSplitting(false);
    if (res.status === 402) {
      setInsufficientCredit(true);
      return;
    }
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal split task");
      return;
    }
    await loadTask();
  }

  async function markDone(id: string) {
    setStatusUpdating(id);
    await fetch(`/api/tasks/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    setStatusUpdating(null);
    await loadTask();
  }

  async function copyPrompt() {
    setCopyState("loading");
    setError(null);
    const res = await fetch(`/api/tasks/${taskId}/packet`);
    if (res.status === 409) {
      const body = await res.json();
      if (body.pendingAssumptions) {
        setPending(body.pendingAssumptions);
        setCopyState("idle");
        return;
      }
      setError(body.error);
      setCopyState("error");
      return;
    }
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal mengambil paket prompt");
      setCopyState("error");
      return;
    }
    const packet = await res.json();
    await navigator.clipboard.writeText(packet.body);
    setPending(null);
    setCopyState("copied");
  }

  async function answerAssumption(assumptionId: string, action: "confirm" | "reject") {
    setAnswering(assumptionId);
    const res = await fetch(`/api/tasks/${taskId}/assumptions/${assumptionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, answer: answers[assumptionId] }),
    });
    setAnswering(null);
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal menjawab asumsi");
      return;
    }
    setPending((prev) => prev?.filter((p) => p.id !== assumptionId) ?? null);
  }

  if (!task) return <div className="p-8">Memuat…</div>;

  return (
    <div className="p-8 max-w-2xl space-y-4">
      <p className="font-mono text-xs text-zinc-500">{task.refId}</p>
      <h1 className="text-xl font-semibold">{task.title}</h1>

      <p className="text-sm text-zinc-500">Status: {task.status}</p>

      <div>
        <h2 className="text-sm font-medium">Definition of done</h2>
        <ul className="list-disc pl-5 text-sm">
          {task.definitionOfDone.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>

      {task.status !== "DONE" && (
        <Button size="sm" variant="outline" disabled={statusUpdating === task.id} onClick={() => markDone(task.id)}>
          Tandai selesai
        </Button>
      )}

      {task.level === "TASK" && (
        <div className="space-y-2">
          {task.steps.length === 0 ? (
            insufficientCredit ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-800">Credit tidak cukup untuk split task.</span>
                <a href="/settings/billing" className="underline">
                  Upgrade atau top-up
                </a>
              </div>
            ) : (
              <div className="space-y-1">
                <Button size="sm" variant="outline" disabled={splitting} onClick={split}>
                  {splitting && <Spinner className="mr-1.5" />}
                  {splitting ? "Memecah task…" : "Split jadi step"}
                </Button>
                {splitting && <p className="text-xs text-zinc-500">Biasanya beberapa detik, jangan tutup tab.</p>}
              </div>
            )
          ) : (
            <div>
              <h2 className="text-sm font-medium">Step</h2>
              <ul className="space-y-1">
                {task.steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{s.refId}</span>
                    {s.title}
                    <span className="text-xs text-zinc-500">({s.status})</span>
                    {s.status !== "DONE" && (
                      <Button size="xs" variant="outline" disabled={statusUpdating === s.id} onClick={() => markDone(s.id)}>
                        Tandai selesai
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {pending && pending.length > 0 ? (
        <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Jawab dulu asumsi berikut sebelum prompt bisa disalin:
          </p>
          {pending.map((a) => (
            <div key={a.id} className="space-y-2 border-t border-amber-200 pt-2 first:border-t-0 first:pt-0">
              <p className="text-sm">
                <span className="font-mono text-xs mr-1">{a.refId}</span>
                {a.statement}
              </p>
              <p className="text-sm font-medium">{a.question}</p>
              <input
                type="text"
                placeholder="Jawaban kamu…"
                className="w-full rounded border p-1.5 text-sm"
                value={answers[a.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [a.id]: e.target.value }))}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={answering === a.id || !answers[a.id]?.trim()}
                  onClick={() => answerAssumption(a.id, "confirm")}
                >
                  Konfirmasi
                </Button>
                <Button size="sm" variant="outline" disabled={answering === a.id} onClick={() => answerAssumption(a.id, "reject")}>
                  Tolak
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Button disabled={copyState === "loading"} onClick={copyPrompt}>
          {copyState === "loading" && <Spinner className="mr-1.5" />}
          {copyState === "loading" ? "Menyiapkan…" : copyState === "copied" ? "Tersalin ✓" : "Copy prompt"}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
