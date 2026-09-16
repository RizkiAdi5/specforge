import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { allocateRefIds } from "@/lib/spec/ref-counter";
import { BLUEPRINT_CATALOG } from "@/lib/blueprints/catalog";
import { DESIGN_STYLE_CATALOG } from "@/lib/design/catalog";
import type { BriefForCompile } from "./domain";

const alternativeSchema = z.object({
  option: z.string().min(1),
  whyRejected: z.string().min(1),
});

const decisionItemSchema = z.object({
  choice: z.string().min(1),
  alternatives: z.array(alternativeSchema).default([]),
  rationale: z.string().min(1),
});

const NO_PREFERENCE = "Belum tahu, silakan pilihkan";

export interface StackConstraints {
  framework?: string;
  database?: string;
  hosting?: string;
}

export interface DecisionsInput {
  orgId: string;
  projectId: string;
  brief: BriefForCompile;
  stackConstraints?: StackConstraints;
  designStyle?: string;
}

function activeConstraints(c: StackConstraints): Record<string, string> {
  const out: Record<string, string> = {};
  if (c.framework && c.framework !== NO_PREFERENCE) out.framework = c.framework;
  if (c.database && c.database !== NO_PREFERENCE) out.database = c.database;
  if (c.hosting && c.hosting !== NO_PREFERENCE) out.hosting = c.hosting;
  return out;
}

// One unified schema for every case (no user preference, partial preference, fully custom via
// "Lainnya") — the model always expresses stack/design as free text; a catalog match (if any)
// is resolved afterward. This avoids branching into separate enum-constrained vs free-text
// schemas, which turned out to duplicate almost everything.
const decisionsSchema = z.object({
  stackName: z.string().min(1),
  stackRationale: z.string().min(1),
  stackAlternatives: z.array(alternativeSchema).min(1),
  designDirection: z.string().min(1),
  designRationale: z.string().min(1),
  decisions: z.array(decisionItemSchema).max(8),
});

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu menyusun arsitektur teknis DAN arah desain visual untuk aplikasi SaaS CRUD, berdasarkan brief produk, domain model, dan batasan yang user berikan (kalau ada).

Blueprint stack yang dikurasi, buat referensi kombinasi yang sudah terbukti cocok (boleh diikuti sebagian atau seluruhnya, boleh diabaikan kalau user sudah kasih batasan lain — batasan user SELALU menang):
${JSON.stringify(BLUEPRINT_CATALOG, null, 2)}

Arah desain visual yang dikurasi, buat referensi (sama aturannya — batasan user menang):
${JSON.stringify(DESIGN_STYLE_CATALOG, null, 2)}

Balas HANYA JSON dengan bentuk persis:
{
  "stackName": string (nama stack teknis lengkap termasuk ORM/auth library/dsb kalau relevan),
  "stackRationale": string (kenapa stack ini cocok, dan kalau ada batasan user, jelaskan kenapa itu cocok — jangan menyanggah pilihan user),
  "stackAlternatives": [{ "option": string, "whyRejected": string }],
  "designDirection": string (arah gaya visual, sekonkret mungkin: palet warna, tipografi, densitas layout, mood),
  "designRationale": string (kenapa arah desain ini cocok untuk target user produk ini),
  "decisions": [
    { "choice": string, "alternatives": [{ "option": string, "whyRejected": string }], "rationale": string }
  ] (maksimal 8, keputusan sekunder — library spesifik, ORM, auth, dsb yang belum dibatasi user; boleh kosong)
}

Aturan wajib: kalau ada batasan eksplisit dari user (stack atau desain), JANGAN diganti atau "dikoreksi" — pakai apa adanya dan cuma jelaskan alasannya. Bagian yang tidak dibatasi user boleh kamu isi bebas, usahakan konsisten dengan bagian yang sudah ditentukan.`;

export async function compileDecisions(opts: DecisionsInput) {
  const entities = await prisma.entity.findMany({
    where: { projectId: opts.projectId },
    select: { refId: true, name: true },
  });

  const constraints: Record<string, string> = activeConstraints(opts.stackConstraints ?? {});
  if (opts.designStyle && opts.designStyle !== NO_PREFERENCE) {
    constraints.designStyle = opts.designStyle;
  }
  const constraintsBlock =
    Object.keys(constraints).length > 0
      ? `Batasan dari user (WAJIB dihormati apa adanya):\n${JSON.stringify(constraints, null, 2)}\n\n`
      : "";

  const userContext = `${constraintsBlock}Problem: ${opts.brief.problem}\nTarget user: ${opts.brief.targetUser}\nScope:\n${JSON.stringify(opts.brief.scope, null, 2)}\n\nEntitas:\n${JSON.stringify(entities, null, 2)}`;

  const output = await run({
    orgId: opts.orgId,
    projectId: opts.projectId,
    action: "COMPILE_DECISIONS",
    schema: decisionsSchema,
    system: SYSTEM_PROMPT,
    user: userContext,
  });

  // Best-effort: record the catalog id only if the composed stack lands exactly on a curated combo.
  const blueprintId = BLUEPRINT_CATALOG.find((b) => b.name.toLowerCase() === output.stackName.toLowerCase())?.id ?? null;

  // ADR-001 is always the stack choice, ADR-002 is always the design direction — every other
  // caller (prompt-packet.ts) relies on this fixed ordering to find them without guessing.
  const allDecisions = [
    { choice: output.stackName, alternatives: output.stackAlternatives, rationale: output.stackRationale },
    { choice: output.designDirection, alternatives: [], rationale: output.designRationale },
    ...output.decisions,
  ];

  const refIds = await allocateRefIds(opts.projectId, "ADR", allDecisions.length);

  const results = await prisma.$transaction([
    prisma.project.update({ where: { id: opts.projectId }, data: { blueprintId } }),
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

  const [, ...createdDecisions] = results;
  return createdDecisions;
}
