import { prisma } from "@/lib/db";

/** Allocates the next `count` refIds for a prefix (E-, US-, ADR-, AS-, T-…), never reused even if the artifact is deleted. */
export async function allocateRefIds(projectId: string, prefix: string, count: number): Promise<string[]> {
  if (count === 0) return [];

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { refCounters: true },
    });
    const counters = (project.refCounters as Record<string, number>) ?? {};
    const start = counters[prefix] ?? 0;

    const ids = Array.from({ length: count }, (_, i) => `${prefix}-${String(start + i + 1).padStart(3, "0")}`);

    await tx.project.update({
      where: { id: projectId },
      data: { refCounters: { ...counters, [prefix]: start + count } },
    });

    return ids;
  });
}
