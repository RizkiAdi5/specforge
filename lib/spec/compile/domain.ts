import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { allocateRefIds } from "@/lib/spec/ref-counter";

const entitySchema = z.object({
  name: z.string().min(1),
  fields: z.array(
    z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      required: z.boolean(),
    })
  ).min(1),
  relations: z
    .array(
      z.object({
        toEntity: z.string().min(1),
        kind: z.enum(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]),
      })
    )
    .default([]),
});

const domainSchema = z
  .object({
    entities: z.array(entitySchema).min(1).max(30),
  })
  .superRefine((data, ctx) => {
    const names = new Set(data.entities.map((e) => e.name));
    data.entities.forEach((entity, i) => {
      entity.relations.forEach((rel, j) => {
        if (!names.has(rel.toEntity)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `relations[${j}].toEntity "${rel.toEntity}" in entity "${entity.name}" does not match any entity name in this output`,
            path: ["entities", i, "relations", j, "toEntity"],
          });
        }
      });
    });
  });

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu merancang domain model (entitas data) untuk aplikasi SaaS CRUD berdasarkan brief produk.

Balas HANYA JSON dengan bentuk persis:
{
  "entities": [
    {
      "name": string (nama entitas, PascalCase, unik dalam output ini),
      "fields": [{ "name": string, "type": string, "required": boolean }],
      "relations": [{ "toEntity": string, "kind": "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many" }]
    }
  ]
}

Aturan wajib:
- Maksimal 30 entitas.
- "relations[].toEntity" HARUS sama persis dengan salah satu "name" entitas lain di output ini — jangan mereferensikan entitas yang tidak kamu definisikan.
- Hanya modelkan entitas yang benar-benar disebut atau tersirat jelas dari brief. Jangan menambah entitas di luar scope.`;

export interface BriefForCompile {
  problem: string;
  targetUser: string;
  scope: unknown;
  nonGoals: unknown;
}

export async function compileDomain(opts: { orgId: string; projectId: string; brief: BriefForCompile }) {
  const output = await run({
    orgId: opts.orgId,
    projectId: opts.projectId,
    action: "COMPILE_DOMAIN",
    schema: domainSchema,
    system: SYSTEM_PROMPT,
    user: `Problem: ${opts.brief.problem}\nTarget user: ${opts.brief.targetUser}\nScope:\n${JSON.stringify(opts.brief.scope, null, 2)}\nNon-goals:\n${JSON.stringify(opts.brief.nonGoals, null, 2)}`,
  });

  const refIds = await allocateRefIds(opts.projectId, "E", output.entities.length);
  const nameToRefId = new Map(output.entities.map((e, i) => [e.name, refIds[i]]));

  const entities = await prisma.$transaction(
    output.entities.map((entity, i) =>
      prisma.entity.create({
        data: {
          projectId: opts.projectId,
          refId: refIds[i],
          name: entity.name,
          fields: entity.fields,
          relations: entity.relations.map((r) => ({
            toRefId: nameToRefId.get(r.toEntity),
            kind: r.kind,
          })),
        },
      })
    )
  );

  return entities;
}
