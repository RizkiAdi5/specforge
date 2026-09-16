import { prisma } from "@/lib/db";

export class ProjectSizeLimitError extends Error {}

const MAX_ENTITIES = 30;
const MAX_TASKS = 60; // TASK + STEP; MILESTONE rows are groupings, not counted (03-ai-pipeline.md)

export async function assertEntityLimit(projectId: string, additionalCount: number): Promise<void> {
  const current = await prisma.entity.count({ where: { projectId } });
  if (current + additionalCount > MAX_ENTITIES) {
    throw new ProjectSizeLimitError(
      `proyek ini akan punya ${current + additionalCount} entitas, melebihi batas ${MAX_ENTITIES}`
    );
  }
}

export async function assertTaskLimit(projectId: string, additionalCount: number): Promise<void> {
  const current = await prisma.task.count({ where: { projectId, level: { in: ["TASK", "STEP"] } } });
  if (current + additionalCount > MAX_TASKS) {
    throw new ProjectSizeLimitError(
      `proyek ini akan punya ${current + additionalCount} task/step, melebihi batas ${MAX_TASKS}`
    );
  }
}
