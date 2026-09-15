import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { allocateRefIds } from "@/lib/spec/ref-counter";
import type { SpecLevel } from "@/lib/generated/prisma/enums";
import type { BriefForCompile } from "./domain";

const STORY_LIMIT: Record<SpecLevel, number> = {
  LITE: 8,
  STANDARD: 20,
  STRICT: Infinity,
};

const acceptanceCriterionSchema = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});

const storySchema = z.object({
  narrative: z.string().min(1),
  entityRefs: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
});

function buildStoriesSchema(validEntityRefIds: string[], limit: number) {
  const refIdSet = new Set(validEntityRefIds);
  return z
    .object({
      stories: z.array(storySchema).min(1).max(Number.isFinite(limit) ? limit : 200),
    })
    .superRefine((data, ctx) => {
      data.stories.forEach((story, i) => {
        story.entityRefs.forEach((refId, j) => {
          if (!refIdSet.has(refId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `entityRefs[${j}] "${refId}" in story "${story.narrative.slice(0, 40)}..." does not match any known entity refId (${validEntityRefIds.join(", ")})`,
              path: ["stories", i, "entityRefs", j],
            });
          }
        });
      });
    });
}

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu menyusun user story dengan acceptance criteria untuk aplikasi SaaS CRUD, berdasarkan brief produk dan domain model yang sudah ada.

Balas HANYA JSON dengan bentuk persis:
{
  "stories": [
    {
      "narrative": string ("Sebagai <peran>, saya bisa <aksi>, supaya <manfaat>"),
      "entityRefs": string[] (refId entitas yang dipakai story ini, HARUS persis salah satu dari daftar entitas yang diberikan),
      "acceptanceCriteria": [{ "given": string, "when": string, "then": string }]
    }
  ]
}

Aturan wajib:
- "entityRefs" HARUS memakai refId (format "E-001") dari daftar entitas yang diberikan di prompt user, jangan mengarang refId baru.
- Setiap acceptance criterion harus bisa diverifikasi objektif. JANGAN pakai frasa subjektif seperti "berjalan dengan baik" atau "user merasa nyaman".
- Minimal 1 acceptance criterion per story.
- Fokus hanya pada story yang benar-benar tersirat dari scope brief, jangan menambah fitur di luar scope.`;

export async function compileStories(opts: {
  orgId: string;
  projectId: string;
  brief: BriefForCompile;
  specLevel: SpecLevel;
}) {
  const entities = await prisma.entity.findMany({
    where: { projectId: opts.projectId },
    select: { refId: true, name: true, fields: true },
  });
  const entityRefIds = entities.map((e) => e.refId);
  const limit = STORY_LIMIT[opts.specLevel];

  const output = await run({
    orgId: opts.orgId,
    projectId: opts.projectId,
    action: "COMPILE_STORIES",
    schema: buildStoriesSchema(entityRefIds, limit),
    system: SYSTEM_PROMPT,
    user: `Problem: ${opts.brief.problem}\nTarget user: ${opts.brief.targetUser}\nScope:\n${JSON.stringify(opts.brief.scope, null, 2)}\n\nEntitas yang tersedia (pakai refId ini di entityRefs):\n${JSON.stringify(entities, null, 2)}\n\nBatas jumlah story: ${Number.isFinite(limit) ? limit : "tanpa batas"}.`,
  });

  const storyRefIds = await allocateRefIds(opts.projectId, "US", output.stories.length);

  const stories = await prisma.$transaction(
    output.stories.map((story, i) =>
      prisma.story.create({
        data: {
          projectId: opts.projectId,
          refId: storyRefIds[i],
          narrative: story.narrative,
          entityRefs: story.entityRefs,
          acceptanceCriteria: story.acceptanceCriteria.map((ac, j) => ({
            refId: `AC-${j + 1}`,
            ...ac,
          })),
        },
      })
    )
  );

  return stories;
}
