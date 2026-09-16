"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ProjectRow {
  id: string;
  archetype: string;
  status: "INTERVIEWING" | "COMPILING" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
}

const STATUS_LABEL: Record<ProjectRow["status"], string> = {
  INTERVIEWING: "wawancara / brief",
  COMPILING: "sedang compile",
  ACTIVE: "aktif",
  ARCHIVED: "diarsipkan",
};

function projectHref(p: ProjectRow) {
  if (p.status === "INTERVIEWING") return `/projects/new?projectId=${p.id}`;
  return `/projects/${p.id}`;
}

export default function ProjectsListPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [slotMax, setSlotMax] = useState(0);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((body) => {
        setProjects(body.projects);
        setSlotMax(body.projectSlotMax);
      });
  }, []);

  if (!projects) return <div className="p-8">Memuat…</div>;

  const slotFull = projects.length >= slotMax;

  return (
    <div className="p-8 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proyek</h1>
        <Link href={slotFull ? "/settings/billing" : "/projects/new"}>
          <Button disabled={slotFull} title={slotFull ? "Slot proyek penuh" : undefined}>
            New
          </Button>
        </Link>
      </div>
      <p className="text-sm text-zinc-500">
        {projects.length} / {slotMax} slot terpakai
      </p>

      {projects.length === 0 ? (
        <p className="text-sm text-zinc-500">Belum ada proyek. Klik &quot;New&quot; untuk mulai.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="rounded border p-3 text-sm">
              <Link href={projectHref(p)} className="hover:underline">
                <span className="font-medium">{p.archetype}</span>
              </Link>
              <p className="text-xs text-zinc-500">
                {STATUS_LABEL[p.status]} — dibuat {new Date(p.createdAt).toLocaleDateString("id-ID")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
