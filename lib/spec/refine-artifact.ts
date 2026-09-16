import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import type { ActionType } from "@/lib/generated/prisma/enums";

const entityUpdateSchema = z.object({
  fields: z.array(z.object({ name: z.string().min(1), type: z.string().min(1), required: z.boolean() })).min(1),
});

const storyUpdateSchema = z.object({
  narrative: z.string().min(1),
  acceptanceCriteria: z
    .array(z.object({ given: z.string().min(1), when: z.string().min(1), then: z.string().min(1) }))
    .min(1),
});

const decisionUpdateSchema = z.object({
  choice: z.string().min(1),
  rationale: z.string().min(1),
});

// Stable, byte-identical system prompts per artifact kind (03-ai-pipeline.md caching rule).
const ENTITY_SYSTEM_PROMPT = `Kamu memperbarui SATU entitas domain model yang sudah ada, mengikuti instruksi perubahan. Jangan ubah identitas entitas (nama tetap sama), hanya field-nya.

Balas HANYA JSON: { "fields": [{ "name": string, "type": string, "required": boolean }] }`;

const STORY_SYSTEM_PROMPT = `Kamu memperbarui SATU user story yang sudah ada, mengikuti instruksi perubahan.

Balas HANYA JSON: { "narrative": string, "acceptanceCriteria": [{ "given": string, "when": string, "then": string }] }`;

const DECISION_SYSTEM_PROMPT = `Kamu memperbarui SATU keputusan arsitektur (ADR) yang sudah ada, mengikuti instruksi perubahan.

Balas HANYA JSON: { "choice": string, "rationale": string }`;

export async function regenerateEntity(orgId: string, projectId: string, refId: string, instruction: string, action: ActionType) {
  const entity = await prisma.entity.findFirstOrThrow({ where: { projectId, refId } });
  const output = await run({
    orgId,
    projectId,
    action,
    schema: entityUpdateSchema,
    system: ENTITY_SYSTEM_PROMPT,
    user: `Entitas saat ini (${entity.name}): ${JSON.stringify(entity.fields)}\n\nInstruksi: ${instruction}`,
  });
  return prisma.entity.update({ where: { id: entity.id }, data: { fields: output.fields } });
}

export async function regenerateStory(orgId: string, projectId: string, refId: string, instruction: string, action: ActionType) {
  const story = await prisma.story.findFirstOrThrow({ where: { projectId, refId } });
  const output = await run({
    orgId,
    projectId,
    action,
    schema: storyUpdateSchema,
    system: STORY_SYSTEM_PROMPT,
    user: `Story saat ini: ${story.narrative}\nAcceptance criteria saat ini: ${JSON.stringify(story.acceptanceCriteria)}\n\nInstruksi: ${instruction}`,
  });
  return prisma.story.update({
    where: { id: story.id },
    data: {
      narrative: output.narrative,
      acceptanceCriteria: output.acceptanceCriteria.map((ac, i) => ({ refId: `AC-${i + 1}`, ...ac })),
    },
  });
}

export async function regenerateDecision(orgId: string, projectId: string, refId: string, instruction: string, action: ActionType) {
  const decision = await prisma.decision.findFirstOrThrow({ where: { projectId, refId } });
  const output = await run({
    orgId,
    projectId,
    action,
    schema: decisionUpdateSchema,
    system: DECISION_SYSTEM_PROMPT,
    user: `Keputusan saat ini: ${decision.choice}\nAlasan saat ini: ${decision.rationale}\n\nInstruksi: ${instruction}`,
  });
  return prisma.decision.update({ where: { id: decision.id }, data: { choice: output.choice, rationale: output.rationale } });
}

export function artifactKindFromRefId(refId: string): "entity" | "story" | "decision" | null {
  if (/^E-\d+$/.test(refId)) return "entity";
  if (/^US-\d+$/.test(refId)) return "story";
  if (/^ADR-\d+$/.test(refId)) return "decision";
  return null;
}

/** Regenerates a single spec artifact in place, addressed by refId. Used by both the
 * per-section "Refine" action (T-029, 1 credit) and change-request apply (T-028, 0 credit,
 * already paid at analysis time) — same logic, different ActionType/credit cost. */
export async function regenerateByRefId(opts: {
  orgId: string;
  projectId: string;
  refId: string;
  instruction: string;
  action: ActionType;
}) {
  const kind = artifactKindFromRefId(opts.refId);
  if (kind === "entity") return regenerateEntity(opts.orgId, opts.projectId, opts.refId, opts.instruction, opts.action);
  if (kind === "story") return regenerateStory(opts.orgId, opts.projectId, opts.refId, opts.instruction, opts.action);
  if (kind === "decision") return regenerateDecision(opts.orgId, opts.projectId, opts.refId, opts.instruction, opts.action);
  throw new Error(`refId "${opts.refId}" is not a refinable artifact type (expected E-/US-/ADR-)`);
}
