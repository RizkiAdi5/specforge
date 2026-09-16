"use client";

import { useEffect, useState } from "react";

interface Row {
  costUsd: number;
  creditCost: number;
  count: number;
}
interface ActionRow extends Row {
  actionType: string;
}
interface OrgRow extends Row {
  orgId: string;
  orgName: string;
}
interface ProjectRow extends Row {
  projectId: string;
  projectLabel: string;
}

interface Dashboard {
  since: string;
  byActionType: ActionRow[];
  byOrg: OrgRow[];
  byProject: ProjectRow[];
}

function Table<T extends Row>({ title, rows, labelKey }: { title: string; rows: T[]; labelKey: keyof T }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-500">
            <th className="py-1">Label</th>
            <th className="py-1 text-right">Cost (USD)</th>
            <th className="py-1 text-right">Credit</th>
            <th className="py-1 text-right">Calls</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="py-1">{String(r[labelKey])}</td>
              <td className="py-1 text-right font-mono">${r.costUsd.toFixed(4)}</td>
              <td className="py-1 text-right">{r.creditCost}</td>
              <td className="py-1 text-right">{r.count}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 text-center text-zinc-400">
                Tidak ada data bulan ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export default function AdminUsagePage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/usage").then(async (res) => {
      if (!res.ok) {
        const body = await res.json();
        setError(typeof body.error === "string" ? body.error : "Gagal memuat");
        return;
      }
      setDashboard(await res.json());
    });
  }, []);

  if (error) return <div className="p-8 text-sm text-destructive">{error}</div>;
  if (!dashboard) return <div className="p-8">Memuat…</div>;

  const priciestAction = dashboard.byActionType[0];

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <h1 className="text-xl font-semibold">Dashboard biaya internal</h1>
      <p className="text-sm text-zinc-500">Sejak {new Date(dashboard.since).toLocaleDateString("id-ID")}</p>

      {priciestAction && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          Aksi paling boros bulan ini: <strong>{priciestAction.actionType}</strong> (${priciestAction.costUsd.toFixed(4)},{" "}
          {priciestAction.count} panggilan)
        </div>
      )}

      <Table title="Per action type" rows={dashboard.byActionType} labelKey="actionType" />
      <Table title="Per org" rows={dashboard.byOrg} labelKey="orgName" />
      <Table title="Per proyek" rows={dashboard.byProject} labelKey="projectLabel" />
    </div>
  );
}
