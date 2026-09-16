import { prisma } from "@/lib/db";
import type { ArtifactType, TraceLinkKind } from "@/lib/generated/prisma/enums";

interface LinkDraft {
  fromType: ArtifactType;
  fromRefId: string;
  toType: ArtifactType;
  toRefId: string;
  kind: TraceLinkKind;
}

function mentionedEntityRefIds(text: string, entities: { refId: string; name: string }[]): string[] {
  const lower = text.toLowerCase();
  return entities.filter((e) => lower.includes(e.name.toLowerCase())).map((e) => e.refId);
}

/**
 * Deterministic, no LLM. Two of the four link kinds come from explicit fields
 * (DERIVES, IMPLEMENTS). CONSTRAINS and ASSUMES have no such field — Decision
 * and Assumption are free text, and Assumption is created before entities/stories
 * even exist — so those two are inferred via entity-name text matching, a known
 * heuristic tradeoff (won't catch paraphrased/synonym references).
 */
export async function buildTraceLinks(projectId: string) {
  const [entities, stories, decisions, assumptions, tasks] = await Promise.all([
    prisma.entity.findMany({ where: { projectId } }),
    prisma.story.findMany({ where: { projectId } }),
    prisma.decision.findMany({ where: { projectId } }),
    prisma.assumption.findMany({ where: { projectId } }),
    prisma.task.findMany({ where: { projectId, level: "TASK" } }),
  ]);

  const links: LinkDraft[] = [];

  // DERIVES: story -> entity, straight from story.entityRefs.
  for (const story of stories) {
    for (const entityRef of story.entityRefs as string[]) {
      links.push({ fromType: "STORY", fromRefId: story.refId, toType: "ENTITY", toRefId: entityRef, kind: "DERIVES" });
    }
  }

  // IMPLEMENTS: task -> story, straight from task.storyRefs. Also index entity -> tasks
  // that touch it (via story.entityRefs), so CONSTRAINS/ASSUMES can propagate to tasks.
  const storyToEntities = new Map(stories.map((s) => [s.refId, s.entityRefs as string[]]));
  const entityToTasks = new Map<string, Set<string>>();
  for (const task of tasks) {
    for (const storyRef of task.storyRefs as string[]) {
      links.push({ fromType: "TASK", fromRefId: task.refId, toType: "STORY", toRefId: storyRef, kind: "IMPLEMENTS" });
      for (const entityRef of storyToEntities.get(storyRef) ?? []) {
        if (!entityToTasks.has(entityRef)) entityToTasks.set(entityRef, new Set());
        entityToTasks.get(entityRef)!.add(task.refId);
      }
    }
  }

  // CONSTRAINS: decision -> entity (text match on choice+rationale), propagated to any
  // task that touches that entity — decisions are compiled before tasks exist, so a
  // decision can never literally "mention" a task; this propagation is how it still reaches one.
  for (const decision of decisions) {
    const text = `${decision.choice} ${decision.rationale}`;
    for (const entityRef of mentionedEntityRefIds(text, entities)) {
      links.push({ fromType: "DECISION", fromRefId: decision.refId, toType: "ENTITY", toRefId: entityRef, kind: "CONSTRAINS" });
      for (const taskRef of entityToTasks.get(entityRef) ?? []) {
        links.push({ fromType: "DECISION", fromRefId: decision.refId, toType: "TASK", toRefId: taskRef, kind: "CONSTRAINS" });
      }
    }
  }

  // ASSUMES: assumption -> entity (text match on statement+question), propagated to tasks.
  // Assumption is created in compile.brief, before entities/stories exist, so this can only
  // ever be inferred after the fact — same text-matching heuristic as CONSTRAINS.
  for (const assumption of assumptions) {
    const text = `${assumption.statement} ${assumption.question}`;
    for (const entityRef of mentionedEntityRefIds(text, entities)) {
      links.push({ fromType: "ASSUMPTION", fromRefId: assumption.refId, toType: "ENTITY", toRefId: entityRef, kind: "ASSUMES" });
      for (const taskRef of entityToTasks.get(entityRef) ?? []) {
        links.push({ fromType: "ASSUMPTION", fromRefId: assumption.refId, toType: "TASK", toRefId: taskRef, kind: "ASSUMES" });
      }
    }
  }

  await prisma.traceLink.createMany({
    data: links.map((l) => ({ projectId, ...l })),
    skipDuplicates: true,
  });

  return prisma.traceLink.findMany({ where: { projectId } });
}
