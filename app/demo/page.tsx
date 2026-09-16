"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "INVALIDATED";

interface TaskBoardItem {
  id: string;
  refId: string;
  title: string;
  status: TaskStatus;
  blockedBy: string[];
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

export default function DemoPage() {
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    fetch("/api/demo/tasks")
      .then((res) => res.json())
      .then(setBoard);
  }, []);

  if (!board) return <div className="p-8">Memuat…</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
        Ini proyek demo, read-only — coba klik task-nya buat lihat isi paket prompt. Belum perlu daftar.{" "}
        <Link href="/sign-up" className="underline">
          Daftar
        </Link>{" "}
        buat bikin proyekmu sendiri.
      </div>

      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Siap dikerjakan</h1>
        <ul className="space-y-1">
          {board.ready.map((t) => (
            <li key={t.id} className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm">
              <Link href={`/demo/tasks/${t.id}`} className="hover:underline">
                <span className="font-mono text-xs mr-2">{t.refId}</span>
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
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
                  <Link href={`/demo/tasks/${t.id}`} className="hover:underline">
                    <span className="font-mono text-xs mr-2">{t.refId}</span>
                    {t.title}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">({STATUS_LABEL[t.status]})</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
