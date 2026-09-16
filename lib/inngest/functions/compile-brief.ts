import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { allocateRefIds } from "@/lib/spec/ref-counter";

const compileBriefSchema = z.object({
  problem: z.string().min(40),
  targetUser: z.string().min(20),
  scope: z.array(z.string()).min(3).max(12),
  nonGoals: z.array(z.string()).min(3).max(15),
  assumptions: z.array(
    z.object({
      statement: z.string(),
      question: z.string(),
    })
  ),
});

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu menyusun brief produk dari jawaban wawancara mentah untuk sebuah aplikasi SaaS CRUD.

Balas HANYA JSON dengan bentuk persis:
{
  "problem": string (minimal 40 karakter, masalah yang diselesaikan),
  "targetUser": string (minimal 20 karakter, siapa penggunanya),
  "scope": string[] (3-12 item, hal yang akan dibangun),
  "nonGoals": string[] (3-15 item, hal yang sengaja TIDAK dibangun dulu),
  "assumptions": [{ "statement": string, "question": string }]
}

Aturan wajib: apa pun yang TIDAK dinyatakan eksplisit oleh user di jawaban tapi diperlukan untuk melanjutkan (detail teknis, batasan, target skala, dsb) WAJIB masuk ke "assumptions". Untuk tiap asumsi, "question" adalah pertanyaan konfirmasi yang akan ditanyakan ke user nanti. Daftar assumptions yang panjang lebih baik daripada mengarang seolah-olah user sudah menjawab.`;

export const compileBriefJob = inngest.createFunction(
  { id: "compile-brief", retries: 0 },
  { event: "project/brief-compile.requested" },
  async ({ event, step }) => {
    const { projectId } = event.data;

    const project = await step.run("load-project", () =>
      prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { brief: true } })
    );

    const rawAnswers = project.brief?.rawAnswers ?? {};

    const output = await step.run("compile-brief-llm", () =>
      run({
        orgId: project.orgId,
        projectId: project.id,
        action: "COMPILE_BRIEF",
        schema: compileBriefSchema,
        system: SYSTEM_PROMPT,
        user: `Arketipe: ${project.archetype}\n\nJawaban wawancara (JSON):\n${JSON.stringify(rawAnswers, null, 2)}`,
      })
    );

    await step.run("save-brief-and-assumptions", async () => {
      const refIds = await allocateRefIds(project.id, "AS", output.assumptions.length);

      await prisma.$transaction([
        prisma.brief.update({
          where: { projectId: project.id },
          data: {
            problem: output.problem,
            targetUser: output.targetUser,
            scope: output.scope,
            nonGoals: output.nonGoals,
          },
        }),
        ...output.assumptions.map((a, i) =>
          prisma.assumption.create({
            data: {
              projectId: project.id,
              refId: refIds[i],
              statement: a.statement,
              question: a.question,
              status: "OPEN",
            },
          })
        ),
      ]);
    });

    return { projectId: project.id, assumptionCount: output.assumptions.length };
  }
);
