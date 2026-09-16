"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "@/components/task-board";
import { PasteBack } from "@/components/paste-back";

type ProjectStatus = "INTERVIEWING" | "COMPILING" | "ACTIVE" | "ARCHIVED";

type CompileError = { stage?: string; message: string; failedAt: string } | null;

const STAGE_LABELS: Record<string, string> = {
  domain: "Domain model",
  stories: "User story",
  decisions: "Keputusan arsitektur",
  critic: "Critic pass",
  tasks: "Milestone & task",
  tracelinks: "Trace link",
};
const STAGE_ORDER = ["domain", "stories", "decisions", "critic", "tasks", "tracelinks"];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();

  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [lastCompileError, setLastCompileError] = useState<CompileError>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/spec/status`);
    const body = await res.json();
    setStatus(body.status);
    setLastCompileError(body.lastCompileError ?? null);
  }, [id]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const { data } = useInngestSubscription({
    refreshToken: async () => {
      const res = await fetch(`/api/projects/${id}/spec/token`, { method: "POST" });
      return res.json();
    },
    enabled: status === "COMPILING",
    key: id,
  });

  // Once the realtime stream reports the pipeline finished (success or failure), re-fetch
  // the authoritative status rather than trusting client-side stream state alone.
  useEffect(() => {
    const latest = data.at(-1);
    if (latest?.data.status === "done" && latest.data.stage === "tracelinks") loadStatus();
    if (latest?.data.status === "failed") loadStatus();
  }, [data, loadStatus]);

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    const res = await fetch(`/api/projects/${id}/spec/retry`, { method: "POST" });
    setRetrying(false);
    if (!res.ok) {
      const body = await res.json();
      setRetryError(typeof body.error === "string" ? body.error : "Gagal retry");
      return;
    }
    setStatus("COMPILING");
    setLastCompileError(null);
  }

  if (!status) {
    return <div className="p-8">Memuat…</div>;
  }

  if (status === "COMPILING") {
    const latest = data.at(-1);
    const runningStage = latest?.data.stage;
    return (
      <div className="p-8 max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Compile spec sedang berjalan</h1>
        <ul className="space-y-1">
          {STAGE_ORDER.map((stage) => {
            const event = [...data].reverse().find((e) => e.data.stage === stage);
            const isCurrent = stage === runningStage;
            return (
              <li key={stage} className={isCurrent ? "font-medium" : "text-zinc-500"}>
                {STAGE_LABELS[stage]}
                {event?.data.status === "done" && " ✓"}
                {isCurrent && event?.data.status === "running" && " …"}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (status === "INTERVIEWING" && lastCompileError) {
    return (
      <div className="p-8 max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Compile spec gagal</h1>
        <p className="text-sm text-destructive">
          Tahap {lastCompileError.stage ? STAGE_LABELS[lastCompileError.stage] ?? lastCompileError.stage : "?"} gagal: {lastCompileError.message}
        </p>
        <p className="text-sm text-zinc-500">Credit sudah dikembalikan.</p>
        <Button disabled={retrying} onClick={retry}>
          Coba lagi
        </Button>
        {retryError && <p className="text-sm text-destructive">{retryError}</p>}
      </div>
    );
  }

  if (status === "ACTIVE") {
    return (
      <div className="space-y-6">
        <div className="p-8 pb-0 max-w-2xl">
          <PasteBack projectId={id} />
        </div>
        <div className="px-8">
          <a href={`/api/projects/${id}/export`} className="text-sm underline">
            Export ZIP
          </a>
        </div>
        <TaskBoard projectId={id} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-md space-y-2">
      <h1 className="text-xl font-semibold">Brief belum di-approve</h1>
      <p className="text-sm text-zinc-500">Buka halaman brief untuk approve dulu.</p>
    </div>
  );
}
