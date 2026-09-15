"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type InterviewQuestionDTO = {
  slot: string;
  prompt: string;
  type: "text" | "boolean" | "single-select";
  options?: string[];
  required: boolean;
};

type InterviewState =
  | { done: true; answeredCount: number; limit: number }
  | { done: false; question: InterviewQuestionDTO; answeredCount: number; limit: number };

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectInterview />
    </Suspense>
  );
}

function NewProjectInterview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");

  const [state, setState] = useState<InterviewState | null>(null);
  const [textValue, setTextValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileQueued, setCompileQueued] = useState(false);

  const loadNext = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/interview/next`);
    const data = await res.json();
    setState(data);
    setTextValue("");
  }, [projectId]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  async function createProject(archetype: "SAAS_CRUD") {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archetype }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal membuat proyek");
      return;
    }
    const { id } = await res.json();
    router.replace(`/projects/new?projectId=${id}`);
  }

  async function submitAnswer(value: string | boolean) {
    if (!projectId || !state || state.done) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/interview/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: state.question.slot, value }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal menyimpan jawaban");
      return;
    }
    setState(await res.json());
    setTextValue("");
  }

  if (!projectId) {
    return (
      <div className="p-8 max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Pilih arketipe</h1>
        <Button disabled={loading} onClick={() => createProject("SAAS_CRUD")}>
          SaaS CRUD
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (!state) {
    return <div className="p-8">Memuat…</div>;
  }

  if (state.done) {
    return (
      <div className="p-8 max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Wawancara selesai</h1>
        <p className="text-sm text-zinc-500">{state.answeredCount} pertanyaan terjawab.</p>
        <Button
          disabled={loading || compileQueued}
          onClick={async () => {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/projects/${projectId}/brief/compile`, { method: "POST" });
            setLoading(false);
            if (!res.ok) {
              const body = await res.json();
              setError(typeof body.error === "string" ? body.error : "Gagal memulai compile brief");
              return;
            }
            setCompileQueued(true);
            router.push(`/projects/${projectId}/brief`);
          }}
        >
          {compileQueued ? "Brief sedang diproses…" : "Compile brief"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const { question, answeredCount, limit } = state;
  const progressPct = Number.isFinite(limit) ? Math.min(100, Math.round((answeredCount / limit) * 100)) : 0;

  return (
    <div className="p-8 max-w-md space-y-6">
      <div className="h-1.5 w-full rounded bg-zinc-200">
        <div className="h-1.5 rounded bg-black transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="text-sm text-zinc-500">Pertanyaan {answeredCount + 1}</p>
      <h1 className="text-xl font-semibold">{question.prompt}</h1>

      {question.type === "text" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (textValue.trim()) submitAnswer(textValue.trim());
          }}
          className="space-y-3"
        >
          <textarea
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            className="w-full rounded border p-2"
            rows={3}
          />
          <Button type="submit" disabled={loading || !textValue.trim()}>
            Lanjut
          </Button>
        </form>
      )}

      {question.type === "boolean" && (
        <div className="flex gap-3">
          <Button disabled={loading} onClick={() => submitAnswer(true)}>
            Ya
          </Button>
          <Button disabled={loading} variant="outline" onClick={() => submitAnswer(false)}>
            Tidak
          </Button>
        </div>
      )}

      {question.type === "single-select" && (
        <div className="flex flex-col gap-2">
          {question.options?.map((opt) => (
            <Button key={opt} disabled={loading} variant="outline" onClick={() => submitAnswer(opt)}>
              {opt}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
