"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Assumption = {
  refId: string;
  statement: string;
  question: string;
  status: "OPEN" | "CONFIRMED" | "REJECTED";
};

type Brief = {
  problem: string | null;
  targetUser: string | null;
  scope: string[];
  nonGoals: string[];
  approvedAt: string | null;
};

type BriefResponse = {
  status: string;
  brief: Brief | null;
  assumptions: Assumption[];
};

function toLines(items: string[]) {
  return items.join("\n");
}

function fromLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<BriefResponse | null>(null);
  const [problem, setProblem] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [scopeText, setScopeText] = useState("");
  const [nonGoalsText, setNonGoalsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/brief`);
    const body: BriefResponse = await res.json();
    setData(body);
    if (body.brief) {
      setProblem(body.brief.problem ?? "");
      setTargetUser(body.brief.targetUser ?? "");
      setScopeText(toLines(body.brief.scope ?? []));
      setNonGoalsText(toLines(body.brief.nonGoals ?? []));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return <div className="p-8">Memuat…</div>;
  }

  if (!data.brief?.problem) {
    return (
      <div className="p-8 max-w-md space-y-2">
        <h1 className="text-xl font-semibold">Brief belum siap</h1>
        <p className="text-sm text-zinc-500">
          Compile brief belum selesai atau belum dijalankan untuk proyek ini.
        </p>
      </div>
    );
  }

  const isApproved = !!data.brief.approvedAt;
  const isLocked = isApproved || data.status !== "INTERVIEWING";

  async function saveChanges() {
    setLoading(true);
    setError(null);
    setSavedNotice(false);
    const res = await fetch(`/api/projects/${id}/brief`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problem,
        targetUser,
        scope: fromLines(scopeText),
        nonGoals: fromLines(nonGoalsText),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal menyimpan perubahan");
      return;
    }
    setSavedNotice(true);
    await load();
  }

  async function approve() {
    setApproving(true);
    setError(null);
    const res = await fetch(`/api/projects/${id}/brief/approve`, { method: "POST" });
    if (!res.ok) {
      setApproving(false);
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal approve brief");
      return;
    }
    router.push(`/projects/${id}`);
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Review brief</h1>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Problem</label>
          <textarea
            disabled={isLocked}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            className="w-full rounded border p-2 disabled:opacity-60"
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Target user</label>
          <textarea
            disabled={isLocked}
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            className="w-full rounded border p-2 disabled:opacity-60"
            rows={2}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Scope (satu baris per item)</label>
          <textarea
            disabled={isLocked}
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
            className="w-full rounded border p-2 disabled:opacity-60 font-mono text-sm"
            rows={5}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Non-goals (satu baris per item)</label>
          <textarea
            disabled={isLocked}
            value={nonGoalsText}
            onChange={(e) => setNonGoalsText(e.target.value)}
            className="w-full rounded border p-2 disabled:opacity-60 font-mono text-sm"
            rows={5}
          />
        </div>

        {!isLocked && (
          <Button variant="outline" disabled={loading} onClick={saveChanges}>
            {loading && <Spinner className="mr-1.5" />}
            Simpan perubahan
          </Button>
        )}
        {savedNotice && <p className="text-sm text-zinc-500">Tersimpan.</p>}
      </div>

      <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-900">
          Asumsi sistem — belum dikonfirmasi olehmu
        </h2>
        <p className="text-xs text-amber-800">
          Poin di bawah ini TIDAK kamu jawab langsung saat wawancara; sistem yang mengarangnya supaya
          bisa lanjut. Akan ditanyakan ulang saat relevan dengan task.
        </p>
        <ul className="space-y-2">
          {data.assumptions.map((a) => (
            <li key={a.refId} className="text-sm">
              <span className="mr-1 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-mono text-amber-900">
                {a.refId}
              </span>
              {a.statement}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isApproved ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-green-700">Brief sudah di-approve. Compile spec sedang berjalan.</p>
          <Link href={`/projects/${id}`} className="text-sm underline">
            Lihat progres compile →
          </Link>
        </div>
      ) : (
        <div className="space-y-1">
          <Button disabled={approving || isLocked} onClick={approve}>
            {approving && <Spinner className="mr-1.5" />}
            {approving ? "Memulai compile…" : "Approve & mulai compile spec"}
          </Button>
          {approving && (
            <p className="text-xs text-zinc-500">Biasanya beberapa menit, jangan tutup tab.</p>
          )}
        </div>
      )}
    </div>
  );
}
