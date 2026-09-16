import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { traverseImpact } from "./traverse-impact";

function buildSchema(knownRefIds: Set<string>) {
  return z.object({
    affectedRefIds: z
      .array(z.string())
      .min(1)
      .superRefine((refIds, ctx) => {
        refIds.forEach((refId, i) => {
          if (!knownRefIds.has(refId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `affectedRefIds[${i}] "${refId}" is not a known refId in this project`,
              path: [i],
            });
          }
        });
      }),
  });
}

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu memetakan deskripsi perubahan bebas dari user ke refId artefak spec yang LANGSUNG terdampak (bukan dampak tidak langsung — itu dihitung terpisah lewat graf trace link).

Balas HANYA JSON dengan bentuk persis:
{ "affectedRefIds": string[] }

Aturan wajib: setiap refId HARUS persis salah satu dari daftar refId yang tersedia di prompt user. Jangan mengarang refId baru. Pilih hanya yang benar-benar disebut atau tersirat jelas oleh deskripsi perubahan.`;

export interface ImpactSummary {
  entities: number;
  stories: number;
  decisions: number;
  assumptions: number;
  tasks: number;
  invalidatedTasks: string[];
}

function summarize(impactSet: string[], invalidatedTasks: string[]): ImpactSummary {
  return {
    entities: impactSet.filter((r) => r.startsWith("E-")).length,
    stories: impactSet.filter((r) => r.startsWith("US-")).length,
    decisions: impactSet.filter((r) => r.startsWith("ADR-")).length,
    assumptions: impactSet.filter((r) => r.startsWith("AS-")).length,
    tasks: impactSet.filter((r) => r.startsWith("T-") || r.startsWith("M-") || r.startsWith("S-")).length,
    invalidatedTasks,
  };
}

export async function analyzeChangeRequest(opts: { orgId: string; projectId: string; description: string }) {
  const [entities, stories, decisions, assumptions, tasks] = await Promise.all([
    prisma.entity.findMany({ where: { projectId: opts.projectId }, select: { refId: true } }),
    prisma.story.findMany({ where: { projectId: opts.projectId }, select: { refId: true } }),
    prisma.decision.findMany({ where: { projectId: opts.projectId }, select: { refId: true } }),
    prisma.assumption.findMany({ where: { projectId: opts.projectId }, select: { refId: true } }),
    prisma.task.findMany({ where: { projectId: opts.projectId }, select: { refId: true, title: true } }),
  ]);
  const knownRefIds = new Set([
    ...entities.map((e) => e.refId),
    ...stories.map((s) => s.refId),
    ...decisions.map((d) => d.refId),
    ...assumptions.map((a) => a.refId),
    ...tasks.map((t) => t.refId),
  ]);

  const changeRequest = await prisma.changeRequest.create({
    data: { projectId: opts.projectId, description: opts.description, status: "ANALYZING", impactSet: [] },
  });

  try {
    const mapped = await run({
      orgId: opts.orgId,
      projectId: opts.projectId,
      action: "CHANGE_REQUEST",
      schema: buildSchema(knownRefIds),
      system: SYSTEM_PROMPT,
      user: `Deskripsi perubahan: ${opts.description}\n\nRefId yang tersedia:\n${JSON.stringify([...knownRefIds])}\n\nTask (refId + title, untuk konteks):\n${JSON.stringify(tasks)}`,
    });

    const impactSet = await traverseImpact(opts.projectId, mapped.affectedRefIds);

    // Step 4 of Alur E: task DONE in the impact set is invalidated immediately, before the
    // user even approves — the conflict is real regardless of what they decide next.
    const invalidated = await prisma.task.findMany({
      where: { projectId: opts.projectId, refId: { in: impactSet }, status: "DONE" },
      select: { refId: true },
    });
    if (invalidated.length > 0) {
      await prisma.task.updateMany({
        where: { projectId: opts.projectId, refId: { in: invalidated.map((t) => t.refId) } },
        data: { status: "INVALIDATED" },
      });
    }

    const updated = await prisma.changeRequest.update({
      where: { id: changeRequest.id },
      data: { status: "AWAITING_APPROVAL", impactSet },
    });

    return { changeRequest: updated, summary: summarize(impactSet, invalidated.map((t) => t.refId)) };
  } catch (err) {
    await prisma.changeRequest.update({ where: { id: changeRequest.id }, data: { status: "DISCARDED" } });
    throw err;
  }
}
