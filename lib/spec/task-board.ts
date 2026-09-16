import { prisma } from "@/lib/db";
import type { TaskStatus } from "@/lib/generated/prisma/enums";

export interface TaskBoardItem {
  id: string;
  refId: string;
  title: string;
  status: TaskStatus;
  dependsOn: string[];
  blockedBy: string[];
  ready: boolean;
}

export interface MilestoneBoard {
  id: string;
  refId: string;
  title: string;
  tasks: TaskBoardItem[];
}

export async function buildTaskBoard(projectId: string) {
  const rows = await prisma.task.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  const milestoneRows = rows.filter((r) => r.level === "MILESTONE");
  const taskRows = rows.filter((r) => r.level === "TASK");

  const statusByRefId = new Map(taskRows.map((t) => [t.refId, t.status]));

  const items: TaskBoardItem[] = taskRows.map((t) => {
    const dependsOn = t.dependsOn as string[];
    const blockedBy = dependsOn.filter((dep) => statusByRefId.get(dep) !== "DONE");
    return {
      id: t.id,
      refId: t.refId,
      title: t.title,
      status: t.status,
      dependsOn,
      blockedBy,
      ready: t.status === "TODO" && blockedBy.length === 0,
    };
  });
  const itemById = new Map(taskRows.map((t, i) => [t.id, items[i]]));

  const itemsByMilestone = new Map<string, TaskBoardItem[]>();
  for (const t of taskRows) {
    const key = t.parentId ?? "";
    const item = itemById.get(t.id)!;
    if (!itemsByMilestone.has(key)) itemsByMilestone.set(key, []);
    itemsByMilestone.get(key)!.push(item);
  }

  const milestones: MilestoneBoard[] = milestoneRows.map((m) => ({
    id: m.id,
    refId: m.refId,
    title: m.title,
    tasks: itemsByMilestone.get(m.id) ?? [],
  }));

  const ready = items.filter((i) => i.ready).sort((a, b) => a.refId.localeCompare(b.refId));

  return { milestones, ready };
}
