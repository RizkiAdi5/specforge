"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface KeyRow {
  provider: string;
  lastFour: string;
  isValid: boolean;
  createdAt: string;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/keys")
      .then((res) => res.json())
      .then((body) => setKeys(body.keys));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "deepseek", apiKey }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "Gagal menyimpan key");
      return;
    }
    setApiKey("");
    load();
  }

  async function remove() {
    await fetch("/api/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "deepseek" }),
    });
    load();
  }

  if (!keys) return <div className="p-8">Memuat…</div>;

  const deepseekKey = keys.find((k) => k.provider === "deepseek");

  return (
    <div className="p-8 max-w-md space-y-4">
      <h1 className="text-xl font-semibold">BYOK — DeepSeek API key</h1>
      <p className="text-sm text-zinc-500">Pakai API key DeepSeek kamu sendiri supaya aksi berbayar tidak memotong credit.</p>

      {deepseekKey ? (
        <div className="rounded border p-3 text-sm space-y-2">
          <p>
            Key aktif: <span className="font-mono">••••{deepseekKey.lastFour}</span>
          </p>
          <Button size="sm" variant="outline" onClick={remove}>
            Hapus key
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="password"
            placeholder="sk-..."
            className="w-full rounded border p-2 text-sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button disabled={saving || !apiKey.trim()} onClick={save}>
            {saving ? "Memvalidasi…" : "Simpan key"}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
