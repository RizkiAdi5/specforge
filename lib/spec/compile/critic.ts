import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import type { BriefForCompile } from "./domain";

const criticSchema = z.object({
  contradictions: z.array(
    z.object({
      refIds: z.array(z.string()).min(2),
      issue: z.string().min(1),
    })
  ),
  unmeasurable: z.array(
    z.object({
      refId: z.string(),
      criterion: z.string().min(1),
    })
  ),
  unboundedScope: z.array(z.string()),
  missingNonGoals: z.array(z.string()),
});

function withRefIdValidation(knownRefIds: Set<string>, knownAcRefs: Set<string>) {
  return criticSchema.superRefine((data, ctx) => {
    data.contradictions.forEach((c, i) => {
      c.refIds.forEach((refId, j) => {
        if (!knownRefIds.has(refId) && !knownAcRefs.has(refId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `contradictions[${i}].refIds[${j}] "${refId}" is not a known refId in this project`,
            path: ["contradictions", i, "refIds", j],
          });
        }
      });
    });
    data.unmeasurable.forEach((u, i) => {
      if (!knownAcRefs.has(u.refId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unmeasurable[${i}].refId "${u.refId}" is not a known acceptance criterion (expected format "US-NNN/AC-n")`,
          path: ["unmeasurable", i, "refId"],
        });
      }
    });
  });
}

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu adalah critic yang memeriksa spec produk SaaS CRUD (brief, domain model, user story, keputusan arsitektur) untuk mencari celah sebelum spec dipakai membuat task.

Balas HANYA JSON dengan bentuk persis:
{
  "contradictions": [{ "refIds": string[] (minimal 2 refId yang saling bertentangan), "issue": string }],
  "unmeasurable": [{ "refId": string (format "US-NNN/AC-n"), "criterion": string (isi kriteria yang tidak terukur) }],
  "unboundedScope": string[] (item scope yang terlalu kabur/tidak berbatas),
  "missingNonGoals": string[] (area yang seharusnya jadi non-goal eksplisit tapi belum disebutkan)
}

Aturan wajib:
- "refIds" dan "refId" HARUS memakai refId asli (format "E-001", "US-002", "ADR-003", "AS-004", atau "US-002/AC-1") dari data yang diberikan, jangan mengarang.
- Acceptance criterion dianggap tidak terukur kalau memakai frasa subjektif seperti "berjalan dengan baik", "user merasa nyaman", "tampilan menarik", atau sejenisnya yang tidak bisa diverifikasi objektif.
- Jangan perbaiki apa pun, cuma laporkan temuan. Kalau tidak ada temuan di satu kategori, kembalikan array kosong untuk kategori itu.`;

export async function compileCritic(opts: { orgId: string; projectId: string; brief: BriefForCompile }) {
  const [entities, stories, decisions, assumptions] = await Promise.all([
    prisma.entity.findMany({ where: { projectId: opts.projectId }, select: { refId: true, name: true, fields: true } }),
    prisma.story.findMany({
      where: { projectId: opts.projectId },
      select: { refId: true, narrative: true, entityRefs: true, acceptanceCriteria: true },
    }),
    prisma.decision.findMany({ where: { projectId: opts.projectId }, select: { refId: true, choice: true, rationale: true } }),
    prisma.assumption.findMany({ where: { projectId: opts.projectId }, select: { refId: true, statement: true } }),
  ]);

  const knownRefIds = new Set([
    ...entities.map((e) => e.refId),
    ...stories.map((s) => s.refId),
    ...decisions.map((d) => d.refId),
    ...assumptions.map((a) => a.refId),
  ]);
  const knownAcRefs = new Set(
    stories.flatMap((s) =>
      (s.acceptanceCriteria as { refId: string }[]).map((ac) => `${s.refId}/${ac.refId}`)
    )
  );

  const output = await run({
    orgId: opts.orgId,
    projectId: opts.projectId,
    action: "CRITIC_PASS",
    schema: withRefIdValidation(knownRefIds, knownAcRefs),
    system: SYSTEM_PROMPT,
    user: `Brief:\n${JSON.stringify(opts.brief, null, 2)}\n\nEntitas:\n${JSON.stringify(entities, null, 2)}\n\nStory:\n${JSON.stringify(stories, null, 2)}\n\nKeputusan arsitektur:\n${JSON.stringify(decisions, null, 2)}`,
  });

  await prisma.project.update({
    where: { id: opts.projectId },
    data: { criticFindings: output },
  });

  return output;
}
