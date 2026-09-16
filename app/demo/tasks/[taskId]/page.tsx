"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface TaskDetail {
  refId: string;
  title: string;
  status: string;
  definitionOfDone: string[];
}

export default function DemoTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [packetBody, setPacketBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/demo/tasks/${taskId}`)
      .then((res) => res.json())
      .then(setTask);
  }, [taskId]);

  async function showPacket() {
    setLoading(true);
    const res = await fetch(`/api/demo/tasks/${taskId}/packet`);
    setLoading(false);
    if (res.ok) {
      const packet = await res.json();
      setPacketBody(packet.body);
    }
  }

  async function copy() {
    if (!packetBody) return;
    await navigator.clipboard.writeText(packetBody);
    setCopied(true);
  }

  if (!task) return <div className="p-8">Memuat…</div>;

  return (
    <div className="p-8 max-w-2xl space-y-4">
      <Link href="/demo" className="text-sm underline">
        ← kembali ke demo
      </Link>
      <p className="font-mono text-xs text-zinc-500">{task.refId}</p>
      <h1 className="text-xl font-semibold">{task.title}</h1>

      <div>
        <h2 className="text-sm font-medium">Definition of done</h2>
        <ul className="list-disc pl-5 text-sm">
          {task.definitionOfDone.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>

      {packetBody ? (
        <div className="space-y-2">
          <pre className="whitespace-pre-wrap rounded border bg-zinc-50 p-3 text-xs">{packetBody}</pre>
          <Button size="sm" onClick={copy}>
            {copied ? "Tersalin ✓" : "Copy prompt"}
          </Button>
        </div>
      ) : (
        <Button size="sm" disabled={loading} onClick={showPacket}>
          {loading ? "Memuat…" : "Lihat paket prompt"}
        </Button>
      )}
    </div>
  );
}
