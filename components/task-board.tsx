"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "INVALIDATED";

interface TaskBoardItem {
  id: string;
  refId: string;
  title: string;
  status: TaskStatus;
  dependsOn: string[];
  blockedBy: string[];
  ready: boolean;
}

interface MilestoneBoard {
  id: string;
  refId: string;
  title: string;
  tasks: TaskBoardItem[];
}

interface Board {
  milestones: MilestoneBoard[];
  ready: TaskBoardItem[];
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "belum dikerjakan",
  IN_PROGRESS: "sedang dikerjakan",
  DONE: "selesai",
  INVALIDATED: "perlu ditinjau ulang",
};

export function TaskBoard({ projectId }: { projectId: string }) {
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/tasks`)
      .then((res) => res.json())
      .then(setBoard);
  }, [projectId]);

  if (!board) return <div className="p-8">Memuat…</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Siap dikerjakan</h1>
        {board.ready.length === 0 ? (
          <p className="text-sm text-zinc-500">Tidak ada task yang siap saat ini.</p>
        ) : (
          <ul className="space-y-1">
            {board.ready.map((t) => (
              <li key={t.id} className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm">
                <Link href={`/projects/${projectId}/tasks/${t.id}`} className="hover:underline">
                  <span className="font-mono text-xs mr-2">{t.refId}</span>
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Semua task</h2>
        {board.milestones.map((m) => (
          <div key={m.id} className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-700">
              <span className="font-mono text-xs mr-2">{m.refId}</span>
              {m.title}
            </h3>
            <ul className="space-y-1 pl-4">
              {m.tasks.map((t) => (
                <li key={t.id} className="text-sm">
                  <Link href={`/projects/${projectId}/tasks/${t.id}`} className="hover:underline">
                    <span className="font-mono text-xs mr-2">{t.refId}</span>
                    {t.title}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">({STATUS_LABEL[t.status]})</span>
                  {t.blockedBy.length > 0 && (
                    <span className="ml-2 text-xs text-amber-700">
                      🔒 menunggu {t.blockedBy.join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
