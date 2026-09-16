import { prisma } from "@/lib/db";
import type { TaskStatus } from "@/lib/generated/prisma/enums";

/** Updates a task's status, cascading DONE upward: if every sibling under the same
 * parent is now DONE, the parent auto-completes too (propagates recursively). */
export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const task = await prisma.task.update({ where: { id: taskId }, data: { status } });

  if (status === "DONE" && task.parentId) {
    const siblings = await prisma.task.findMany({ where: { parentId: task.parentId } });
    if (siblings.every((s) => s.status === "DONE")) {
      await updateTaskStatus(task.parentId, "DONE");
    }
  }

  return task;
}
