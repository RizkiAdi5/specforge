import { prisma } from "@/lib/db";

export interface PendingAssumption {
  id: string;
  refId: string;
  statement: string;
  question: string;
}

/** Assumptions linked to this task (via ASSUMES TraceLink) that are still OPEN — the prompt stays locked until these are answered. */
export async function getPendingAssumptions(taskId: string): Promise<PendingAssumption[]> {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, refId: true } });

  const links = await prisma.traceLink.findMany({
    where: { projectId: task.projectId, fromType: "ASSUMPTION", toType: "TASK", toRefId: task.refId, kind: "ASSUMES" },
  });
  const assumptionRefIds = [...new Set(links.map((l) => l.fromRefId))];
  if (!assumptionRefIds.length) return [];

  const assumptions = await prisma.assumption.findMany({
    where: { projectId: task.projectId, refId: { in: assumptionRefIds }, status: "OPEN" },
  });

  return assumptions.map((a) => ({ id: a.id, refId: a.refId, statement: a.statement, question: a.question }));
}

/** Assumptions linked to this task that have been CONFIRMED — their answers get woven into the prompt packet. */
export async function getConfirmedAssumptions(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, refId: true } });

  const links = await prisma.traceLink.findMany({
    where: { projectId: task.projectId, fromType: "ASSUMPTION", toType: "TASK", toRefId: task.refId, kind: "ASSUMES" },
  });
  const assumptionRefIds = [...new Set(links.map((l) => l.fromRefId))];
  if (!assumptionRefIds.length) return [];

  return prisma.assumption.findMany({
    where: { projectId: task.projectId, refId: { in: assumptionRefIds }, status: "CONFIRMED" },
  });
}
