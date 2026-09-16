import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { BLUEPRINT_CATALOG } from "@/lib/blueprints/catalog";
import { getConfirmedAssumptions } from "@/lib/spec/assumption-gate";

const TOKEN_BUDGET = 1500;
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const packetProseSchema = z.object({
  intent: z.string().min(1),
  specialNotes: z.string().optional(),
});

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu menulis pembuka singkat untuk paket instruksi task, yang akan disalin ke AI coding tool (Cursor/Claude Code).

Balas HANYA JSON dengan bentuk persis:
{
  "intent": string (1-2 kalimat, kenapa task ini penting dan apa yang dicapainya — bukan mengulang judul task),
  "specialNotes": string (opsional, catatan teknis khusus kalau ada yang perlu diperhatikan AI coding tool, kosongkan kalau tidak ada)
}

Jangan mengulang isi definition of done atau daftar file. Singkat, langsung ke inti.`;

interface AssembledPacket {
  body: string;
  specSnapshot: string[];
}

async function assemble(taskId: string): Promise<AssembledPacket> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { project: { include: { brief: true } } },
  });
  const { project } = task;

  const storyRefs = task.storyRefs as string[];
  const stories = await prisma.story.findMany({
    where: { projectId: project.id, refId: { in: storyRefs } },
  });

  const entityRefIds = [...new Set(stories.flatMap((s) => s.entityRefs as string[]))];
  const entities = entityRefIds.length
    ? await prisma.entity.findMany({ where: { projectId: project.id, refId: { in: entityRefIds } } })
    : [];

  const constrainingLinks = await prisma.traceLink.findMany({
    where: { projectId: project.id, toType: "TASK", toRefId: task.refId, kind: "CONSTRAINS", fromType: "DECISION" },
  });
  const decisionRefIds = [...new Set(constrainingLinks.map((l) => l.fromRefId))];
  const decisions = decisionRefIds.length
    ? await prisma.decision.findMany({ where: { projectId: project.id, refId: { in: decisionRefIds } } })
    : [];

  const codeState = await prisma.codeState.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
  });

  const blueprint = BLUEPRINT_CATALOG.find((b) => b.id === project.blueprintId);
  const nonGoals = ((project.brief?.nonGoals as string[]) ?? []).slice(0, 5);
  const confirmedAssumptions = await getConfirmedAssumptions(taskId);

  const prose = await run({
    orgId: project.orgId,
    projectId: project.id,
    action: "PROMPT_PACKET",
    schema: packetProseSchema,
    system: SYSTEM_PROMPT,
    user: `Task: ${task.title}\nDefinition of done: ${JSON.stringify(task.definitionOfDone)}\nStory terkait: ${stories.map((s) => s.narrative).join(" | ")}`,
  });

  const allowedFiles = task.allowedFiles as string[];
  const forbiddenFiles = task.forbiddenFiles as string[];
  const definitionOfDone = task.definitionOfDone as string[];

  let fileTreeLines = codeState ? ((codeState.fileTree as string[]) ?? []).slice(0, 40) : [];

  function render(): string {
    const lines: string[] = [];
    lines.push(`## ${task.refId}: ${task.title}`);
    lines.push("");
    lines.push(prose.intent);
    lines.push("");
    lines.push("### Konteks");
    lines.push(`Stack: ${blueprint?.summary ?? "(belum ditentukan)"}`);
    if (fileTreeLines.length) {
      lines.push("Sudah ada di proyek:");
      lines.push(...fileTreeLines.map((f) => `- ${f}`));
    }
    lines.push("");
    lines.push("### Boleh disentuh");
    lines.push(...allowedFiles.map((f) => `- ${f}`));
    lines.push("");
    lines.push("### JANGAN sentuh");
    lines.push(...forbiddenFiles.map((f) => `- ${f}`));
    lines.push("");
    lines.push("### Spec terkait");
    for (const s of stories) {
      lines.push(`- ${s.narrative}`);
      for (const ac of s.acceptanceCriteria as { given: string; when: string; then: string }[]) {
        lines.push(`  - Given ${ac.given}, when ${ac.when}, then ${ac.then}`);
      }
    }
    for (const e of entities) {
      lines.push(`- Entitas ${e.name}: ${JSON.stringify(e.fields)}`);
    }
    for (const d of decisions) {
      lines.push(`- ADR: ${d.choice}`);
    }
    for (const a of confirmedAssumptions) {
      lines.push(`- Asumsi terkonfirmasi: ${a.statement} → ${a.answer}`);
    }
    lines.push("");
    lines.push("### Definition of done");
    lines.push(...definitionOfDone.map((d) => `- ${d}`));
    lines.push("");
    lines.push("### Jangan lakukan");
    lines.push(...nonGoals.map((n) => `- ${n}`));
    const deviations = (codeState?.deviations as { path: string; reason: string }[] | undefined) ?? [];
    for (const dev of deviations) {
      lines.push(`- Deviasi belum diselesaikan: ${dev.path} — ${dev.reason}`);
    }
    if (prose.specialNotes) {
      lines.push("");
      lines.push(`Catatan khusus: ${prose.specialNotes}`);
    }
    return lines.join("\n");
  }

  let body = render();
  while (estimateTokens(body) > TOKEN_BUDGET && fileTreeLines.length > 0) {
    fileTreeLines = fileTreeLines.slice(0, Math.floor(fileTreeLines.length / 2));
    body = render();
  }
  if (estimateTokens(body) > TOKEN_BUDGET) {
    fileTreeLines = [];
    body = render();
  }

  const specSnapshot = [
    task.refId,
    ...storyRefs,
    ...entityRefIds,
    ...decisionRefIds,
    ...confirmedAssumptions.map((a) => a.refId),
  ];

  return { body, specSnapshot };
}

export async function getOrCreatePromptPacket(taskId: string) {
  const existing = await prisma.promptPacket.findFirst({
    where: { taskId, isStale: false },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const { body, specSnapshot } = await assemble(taskId);
  return prisma.promptPacket.create({
    data: { taskId, body, specSnapshot, isStale: false },
  });
}
