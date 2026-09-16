import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { assertTaskLimit } from "@/lib/spec/project-limits";

const stepSchema = z.object({
  title: z.string().min(1),
  definitionOfDone: z.array(z.string().min(1)).min(2),
  allowedFiles: z.array(z.string().min(1)).min(1),
  forbiddenFiles: z.array(z.string()).default([]),
});

const splitSchema = z.object({
  steps: z.array(stepSchema).min(3).max(6),
});

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu memecah satu task pengembangan yang dianggap terlalu besar oleh developer jadi 3-6 langkah (STEP) lebih kecil dan berurutan.

Balas HANYA JSON dengan bentuk persis:
{
  "steps": [
    {
      "title": string,
      "definitionOfDone": string[] (minimal 2, tiap butir harus bisa diverifikasi objektif),
      "allowedFiles": string[] (glob path, harus tetap dalam batas allowedFiles task induk),
      "forbiddenFiles": string[] (glob path yang tidak boleh disentuh step ini)
    }
  ]
}

Aturan wajib:
- Tepat 3 sampai 6 step.
- Urutan step harus logis (step pertama fondasi, step berikutnya membangun di atasnya).
- allowedFiles tiap step harus berada DALAM cakupan allowedFiles task induk, jangan meluas ke file lain.`;

export async function splitTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.level !== "TASK") {
    throw new Error(`only level=TASK can be split, got ${task.level}`);
  }

  const codeState = await prisma.codeState.findFirst({
    where: { projectId: task.projectId },
    orderBy: { createdAt: "desc" },
  });

  const output = await run({
    orgId: (await prisma.project.findUniqueOrThrow({ where: { id: task.projectId }, select: { orgId: true } })).orgId,
    projectId: task.projectId,
    action: "SPLIT_TASK",
    schema: splitSchema,
    system: SYSTEM_PROMPT,
    user: `Task: ${task.title}\nDefinition of done: ${JSON.stringify(task.definitionOfDone)}\nAllowed files: ${JSON.stringify(task.allowedFiles)}\nForbidden files: ${JSON.stringify(task.forbiddenFiles)}\nState kode terkini: ${codeState ? JSON.stringify(codeState.fileTree) : "(belum ada kode)"}`,
  });

  await assertTaskLimit(task.projectId, output.steps.length);

  const match = task.refId.match(/^T-(\d+)$/);
  if (!match) throw new Error(`unexpected task refId format: ${task.refId}`);
  const parentNumber = match[1];

  const steps = await prisma.$transaction(
    output.steps.map((step, i) =>
      prisma.task.create({
        data: {
          projectId: task.projectId,
          parentId: task.id,
          refId: `S-${parentNumber}-${i + 1}`,
          level: "STEP",
          title: step.title,
          definitionOfDone: step.definitionOfDone,
          allowedFiles: step.allowedFiles,
          forbiddenFiles: step.forbiddenFiles,
          storyRefs: task.storyRefs as string[],
        },
      })
    )
  );

  return steps;
}
