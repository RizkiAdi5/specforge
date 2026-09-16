import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { allocateRefIds } from "@/lib/spec/ref-counter";
import { BLUEPRINT_CATALOG } from "@/lib/blueprints/catalog";
import type { BriefForCompile } from "./domain";

const alternativeSchema = z.object({
  option: z.string().min(1),
  whyRejected: z.string().min(1),
});

const catalogIds = BLUEPRINT_CATALOG.map((b) => b.id) as [string, ...string[]];

const decisionsSchema = z.object({
  blueprintId: z.enum(catalogIds),
  blueprintRationale: z.string().min(1),
  blueprintAlternatives: z.array(alternativeSchema).min(1),
  decisions: z
    .array(
      z.object({
        choice: z.string().min(1),
        alternatives: z.array(alternativeSchema).default([]),
        rationale: z.string().min(1),
      })
    )
    .max(8),
});

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
// Blueprint catalog is global constant data, so it lives here in the system prompt, not the user prompt.
const SYSTEM_PROMPT = `Kamu memilih arsitektur teknis untuk aplikasi SaaS CRUD berdasarkan brief produk dan domain model.

Blueprint yang tersedia (WAJIB pilih salah satu "id", JANGAN mengarang stack baru):
${JSON.stringify(BLUEPRINT_CATALOG, null, 2)}

Balas HANYA JSON dengan bentuk persis:
{
  "blueprintId": string (harus persis salah satu "id" dari daftar blueprint di atas),
  "blueprintRationale": string (kenapa blueprint ini cocok untuk produk ini),
  "blueprintAlternatives": [{ "option": string, "whyRejected": string }] (blueprint lain di daftar yang tidak dipilih dan alasannya),
  "decisions": [
    {
      "choice": string (keputusan arsitektur spesifik untuk produk ini, kalimat lengkap dan actionable),
      "alternatives": [{ "option": string, "whyRejected": string }],
      "rationale": string
    }
  ] (maksimal 8, keputusan sekunder yang relevan seperti library spesifik atau pendekatan teknis tertentu — boleh kosong array kalau blueprint saja sudah cukup)
}

Aturan wajib: "blueprintId" harus PERSIS salah satu "id" di daftar blueprint. Jangan mengarang stack di luar daftar itu.`;

export async function compileDecisions(opts: { orgId: string; projectId: string; brief: BriefForCompile }) {
  const entities = await prisma.entity.findMany({
    where: { projectId: opts.projectId },
    select: { refId: true, name: true },
  });

  const output = await run({
    orgId: opts.orgId,
    projectId: opts.projectId,
    action: "COMPILE_DECISIONS",
    schema: decisionsSchema,
    system: SYSTEM_PROMPT,
    user: `Problem: ${opts.brief.problem}\nTarget user: ${opts.brief.targetUser}\nScope:\n${JSON.stringify(opts.brief.scope, null, 2)}\n\nEntitas:\n${JSON.stringify(entities, null, 2)}`,
  });

  const blueprint = BLUEPRINT_CATALOG.find((b) => b.id === output.blueprintId)!;

  const allDecisions = [
    { choice: blueprint.name, alternatives: output.blueprintAlternatives, rationale: output.blueprintRationale },
    ...output.decisions,
  ];

  const refIds = await allocateRefIds(opts.projectId, "ADR", allDecisions.length);

  const results = await prisma.$transaction([
    prisma.project.update({ where: { id: opts.projectId }, data: { blueprintId: output.blueprintId } }),
    ...allDecisions.map((d, i) =>
      prisma.decision.create({
        data: {
          projectId: opts.projectId,
          refId: refIds[i],
          choice: d.choice,
          alternatives: d.alternatives,
          rationale: d.rationale,
        },
      })
    ),
  ]);

  const [, ...decisions] = results;
  return decisions;
}
