import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { BLUEPRINT_CATALOG } from "@/lib/blueprints/catalog";

function renderPrd(brief: { problem: string | null; targetUser: string | null; scope: unknown; nonGoals: unknown } | null, stories: { refId: string; narrative: string; acceptanceCriteria: unknown }[]): string {
  const scope = (brief?.scope as string[]) ?? [];
  const nonGoals = (brief?.nonGoals as string[]) ?? [];

  const lines: string[] = [
    "# 01 — PRD",
    "",
    "## Problem",
    brief?.problem ?? "(belum diisi)",
    "",
    "## Target user",
    brief?.targetUser ?? "(belum diisi)",
    "",
    "## Scope",
    ...scope.map((s) => `- ${s}`),
    "",
    "## Non-goals",
    ...nonGoals.map((n) => `- ${n}`),
    "",
    "---",
    "",
    "## User stories",
    "",
  ];

  for (const s of stories) {
    lines.push(`### ${s.refId} — ${s.narrative}`, "");
    for (const ac of s.acceptanceCriteria as { refId: string; given: string; when: string; then: string }[]) {
      lines.push(`- **${ac.refId}**: Given ${ac.given}, when ${ac.when}, then ${ac.then}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderDomain(entities: { refId: string; name: string; fields: unknown; relations: unknown }[]): string {
  const lines: string[] = ["# 02 — Domain model", ""];

  for (const e of entities) {
    lines.push(`## ${e.refId}: ${e.name}`, "");
    lines.push("| Field | Type | Required |", "|---|---|---|");
    for (const f of e.fields as { name: string; type: string; required: boolean }[]) {
      lines.push(`| ${f.name} | ${f.type} | ${f.required ? "yes" : "no"} |`);
    }
    const relations = e.relations as { toRefId: string; kind: string }[];
    if (relations.length > 0) {
      lines.push("", "Relations:");
      for (const r of relations) lines.push(`- ${r.kind} → ${r.toRefId}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderDecisions(decisions: { refId: string; choice: string; rationale: string; alternatives: unknown }[]): string {
  const lines: string[] = ["# 03 — Keputusan arsitektur (ADR)", ""];

  for (const d of decisions) {
    lines.push(`## ${d.refId}`, "", `**Choice:** ${d.choice}`, "", `**Rationale:** ${d.rationale}`, "");
    const alts = d.alternatives as { option: string; whyRejected: string }[];
    if (alts.length > 0) {
      lines.push("**Alternatives:**");
      for (const a of alts) lines.push(`- ${a.option}: ${a.whyRejected}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

interface TaskRow {
  id: string;
  refId: string;
  title: string;
  level: string;
  parentId: string | null;
  status: string;
  definitionOfDone: unknown;
  allowedFiles: unknown;
  forbiddenFiles: unknown;
  dependsOn: unknown;
}

function renderTasks(tasks: TaskRow[]): string {
  const lines: string[] = ["# 04 — Task", ""];
  const milestones = tasks.filter((t) => t.level === "MILESTONE");
  const byParent = new Map<string | null, TaskRow[]>();
  for (const t of tasks) {
    if (t.level === "MILESTONE") continue;
    const key = t.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }

  for (const m of milestones) {
    lines.push(`## ${m.refId}: ${m.title}`, "");
    const children = byParent.get(m.id) ?? [];
    for (const t of children) {
      lines.push(`### ${t.refId}: ${t.title} (${t.status})`, "");
      lines.push("Definition of done:");
      for (const d of t.definitionOfDone as string[]) lines.push(`- ${d}`);
      lines.push("", "Allowed files:");
      for (const f of t.allowedFiles as string[]) lines.push(`- ${f}`);
      const forbidden = t.forbiddenFiles as string[];
      if (forbidden.length > 0) {
        lines.push("", "Forbidden files:");
        for (const f of forbidden) lines.push(`- ${f}`);
      }
      const deps = t.dependsOn as string[];
      if (deps.length > 0) lines.push("", `Depends on: ${deps.join(", ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function renderClaudeMd(opts: { blueprintId: string | null; nonGoals: string[] }): string {
  const blueprint = BLUEPRINT_CATALOG.find((b) => b.id === opts.blueprintId);
  const lines: string[] = [
    "# Aturan kerja",
    "",
    "Baca `.spec/` sebelum mengerjakan apa pun. Urutan: 01 (produk) → 02 (data) → 03 (keputusan) → 04 (task).",
    "",
    "## Stack",
    "",
    ...(blueprint ? blueprint.stack.map((s) => `- ${s}`) : ["(blueprint belum ditentukan)"]),
    "",
    "## Non-goals — jangan bangun ini",
    "",
    ...opts.nonGoals.map((n) => `- ${n}`),
  ];
  return lines.join("\n");
}

export async function buildExportZip(projectId: string): Promise<Buffer> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { brief: true } });
  const [entities, stories, decisions, tasks] = await Promise.all([
    prisma.entity.findMany({ where: { projectId }, orderBy: { refId: "asc" } }),
    prisma.story.findMany({ where: { projectId }, orderBy: { refId: "asc" } }),
    prisma.decision.findMany({ where: { projectId }, orderBy: { refId: "asc" } }),
    prisma.task.findMany({ where: { projectId }, orderBy: { refId: "asc" } }),
  ]);

  const zip = new JSZip();
  zip.file(".spec/01-prd.md", renderPrd(project.brief, stories));
  zip.file(".spec/02-data-and-flows.md", renderDomain(entities));
  zip.file(".spec/03-decisions.md", renderDecisions(decisions));
  zip.file(".spec/04-tasks.md", renderTasks(tasks as unknown as TaskRow[]));
  zip.file(
    "CLAUDE.md",
    renderClaudeMd({ blueprintId: project.blueprintId, nonGoals: (project.brief?.nonGoals as string[]) ?? [] })
  );

  return zip.generateAsync({ type: "nodebuffer" });
}
