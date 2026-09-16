"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type InterviewQuestionDTO = {
  slot: string;
  prompt: string;
  type: "text" | "boolean" | "single-select";
  options?: string[];
  allowOther?: boolean;
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
  const [compiling, setCompiling] = useState(false);
  const [otherMode, setOtherMode] = useState(false);

  const loadNext = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/interview/next`);
    const data = await res.json();
    setState(data);
    setTextValue("");
    setOtherMode(false);
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
    setOtherMode(false);
  }

  if (!projectId) {
    return (
      <div className="p-8 max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Pilih arketipe</h1>
        <Button disabled={loading} onClick={() => createProject("SAAS_CRUD")}>
          {loading && <Spinner className="mr-1.5" />}
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
          disabled={compiling || compileQueued}
          onClick={async () => {
            setCompiling(true);
            setError(null);
            const res = await fetch(`/api/projects/${projectId}/brief/compile`, { method: "POST" });
            setCompiling(false);
            if (!res.ok) {
              const body = await res.json();
              setError(typeof body.error === "string" ? body.error : "Gagal memulai compile brief");
              return;
            }
            setCompileQueued(true);
            router.push(`/projects/${projectId}/brief`);
          }}
        >
          {compiling && <Spinner className="mr-1.5" />}
          {compileQueued ? "Brief sedang diproses…" : compiling ? "Memulai…" : "Compile brief"}
        </Button>
        {compiling && <p className="text-xs text-zinc-500">Biasanya 10–20 detik, jangan tutup tab.</p>}
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
            {loading && <Spinner className="mr-1.5" />}
            Lanjut
          </Button>
        </form>
      )}

      {question.type === "boolean" && (
        <div className="flex gap-3">
          <Button disabled={loading} onClick={() => submitAnswer(true)}>
            {loading && <Spinner className="mr-1.5" />}
            Ya
          </Button>
          <Button disabled={loading} variant="outline" onClick={() => submitAnswer(false)}>
            Tidak
          </Button>
        </div>
      )}

      {question.type === "single-select" && !otherMode && (
        <div className="flex flex-col gap-2">
          {question.options?.map((opt) => (
            <Button key={opt} disabled={loading} variant="outline" onClick={() => submitAnswer(opt)}>
              {opt}
            </Button>
          ))}
          {question.allowOther && (
            <Button variant="outline" onClick={() => setOtherMode(true)}>
              Lainnya (isi sendiri)
            </Button>
          )}
        </div>
      )}

      {question.type === "single-select" && otherMode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (textValue.trim()) submitAnswer(textValue.trim());
          }}
          className="space-y-3"
        >
          <input
            autoFocus
            type="text"
            placeholder="Tulis jawabanmu…"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            className="w-full rounded border p-2"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || !textValue.trim()}>
              Lanjut
            </Button>
            <Button type="button" variant="outline" onClick={() => setOtherMode(false)}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
