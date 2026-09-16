"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface Entity {
  id: string;
  refId: string;
  name: string;
  fields: { name: string; type: string; required: boolean }[];
}

interface Story {
  id: string;
  refId: string;
  narrative: string;
  acceptanceCriteria: { refId: string; given: string; when: string; then: string }[];
}

function RefineBox({ projectId, refId, onDone }: { projectId: string; refId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        Refine
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded border p-2">
      <textarea
        className="w-full rounded border p-1.5 text-sm"
        rows={2}
        placeholder="Instruksi perbaikan… (1 credit)"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="xs"
          disabled={loading || !instruction.trim()}
          onClick={async () => {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/projects/${projectId}/spec/${refId}/refine`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ instruction }),
            });
            setLoading(false);
            if (!res.ok) {
              const body = await res.json();
              setError(typeof body.message === "string" ? body.message : "Gagal refine");
              return;
            }
            setOpen(false);
            setInstruction("");
            onDone();
          }}
        >
          {loading && <Spinner className="mr-1.5" />}
          {loading ? "Memproses…" : "Jalankan refine"}
        </Button>
        <Button size="xs" variant="outline" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
      {loading && <p className="text-xs text-zinc-500">Biasanya beberapa detik, jangan tutup tab.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function SpecPage() {
  const { id } = useParams<{ id: string }>();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [editingStory, setEditingStory] = useState<string | null>(null);
  const [narrativeDraft, setNarrativeDraft] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/projects/${id}/spec`)
      .then((res) => res.json())
      .then((body) => {
        setEntities(body.entities);
        setStories(body.stories);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveStory(refId: string) {
    const res = await fetch(`/api/projects/${id}/spec/${refId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative: narrativeDraft }),
    });
    if (res.ok) {
      const body = await res.json();
      setSaveNotice(
        body.flaggedForReview?.length > 0 ? `Tersimpan. Task perlu ditinjau: ${body.flaggedForReview.join(", ")}` : "Tersimpan."
      );
      setEditingStory(null);
      load();
    }
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Spec</h1>
      {saveNotice && <p className="text-sm text-green-700">{saveNotice}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Entitas</h2>
        {entities.map((e) => (
          <div key={e.id} className="rounded border p-3 text-sm">
            <p className="font-mono text-xs">{e.refId}</p>
            <p className="font-medium">{e.name}</p>
            <ul className="list-disc pl-5 text-xs text-zinc-600">
              {e.fields.map((f, i) => (
                <li key={i}>
                  {f.name}: {f.type} {f.required && "(required)"}
                </li>
              ))}
            </ul>
            <RefineBox projectId={id} refId={e.refId} onDone={load} />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">User story</h2>
        {stories.map((s) => (
          <div key={s.id} className="rounded border p-3 text-sm">
            <p className="font-mono text-xs">{s.refId}</p>
            {editingStory === s.refId ? (
              <div className="space-y-2">
                <textarea
                  className="w-full rounded border p-1.5 text-sm"
                  rows={2}
                  value={narrativeDraft}
                  onChange={(e) => setNarrativeDraft(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="xs" onClick={() => saveStory(s.refId)}>
                    Simpan
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setEditingStory(null)}>
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <p>{s.narrative}</p>
            )}
            <div className="mt-2 flex gap-2">
              {editingStory !== s.refId && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setEditingStory(s.refId);
                    setNarrativeDraft(s.narrative);
                  }}
                >
                  Edit
                </Button>
              )}
              <RefineBox projectId={id} refId={s.refId} onDone={load} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
