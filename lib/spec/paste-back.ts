import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import type { CodeStateSource } from "@/lib/generated/prisma/enums";

const deviationSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  touchesNonGoal: z.boolean(),
});

const pasteBackSchema = z.object({
  deviations: z.array(deviationSchema),
});

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu membandingkan kondisi kode nyata (yang ditempel user) dengan spec proyek untuk mencari deviasi.

Balas HANYA JSON dengan bentuk persis:
{
  "deviations": [
    {
      "path": string (path file atau area yang menyimpang),
      "reason": string (kenapa ini dianggap deviasi),
      "severity": "low" | "medium" | "high",
      "touchesNonGoal": boolean (true kalau file ini menyentuh area yang eksplisit ada di daftar non-goals proyek)
    }
  ]
}

Aturan wajib:
- Bandingkan tiap path terhadap allowedFiles/forbiddenFiles dari task yang berstatus DONE — path di luar allowedFiles task DONE manapun, atau path yang cocok forbiddenFiles, adalah deviasi.
- Bandingkan juga terhadap daftar non-goals proyek — kalau path jelas berkaitan dengan salah satu non-goal, set touchesNonGoal=true.
- Jangan laporkan file generik yang wajar ada di proyek manapun (README, .gitignore, config dasar) sebagai deviasi kecuali eksplisit dilarang.
- Kalau tidak ada deviasi, kembalikan array kosong.`;

export async function analyzePasteBack(opts: {
  orgId: string;
  projectId: string;
  source: CodeStateSource;
  rawContent: string;
}) {
  const lines = opts.rawContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const [doneTasks, project] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: opts.projectId, level: { in: ["TASK", "STEP"] }, status: "DONE" },
      select: { refId: true, title: true, allowedFiles: true, forbiddenFiles: true },
    }),
    prisma.project.findUniqueOrThrow({ where: { id: opts.projectId }, include: { brief: true } }),
  ]);
  const nonGoals = (project.brief?.nonGoals as string[]) ?? [];

  const output = await run({
    orgId: opts.orgId,
    projectId: opts.projectId,
    action: "PASTE_BACK",
    schema: pasteBackSchema,
    system: SYSTEM_PROMPT,
    user: `Sumber: ${opts.source}\nYang ditempel user:\n${lines.join("\n")}\n\nTask berstatus DONE (allowedFiles/forbiddenFiles):\n${JSON.stringify(doneTasks, null, 2)}\n\nNon-goals proyek:\n${JSON.stringify(nonGoals, null, 2)}`,
  });

  // Hard rule (US-011): a deviation touching a non-goal area is ALWAYS high severity,
  // regardless of what severity the model itself assigned — don't trust it to remember.
  const deviations = output.deviations.map((d) => (d.touchesNonGoal ? { ...d, severity: "high" as const } : d));

  const codeState = await prisma.codeState.create({
    data: {
      projectId: opts.projectId,
      source: opts.source,
      fileTree: lines,
      deviations,
    },
  });

  return codeState;
}
