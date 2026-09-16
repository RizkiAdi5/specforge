import { prisma } from "@/lib/db";

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getUsageDashboard() {
  const since = startOfMonth();
  const where = { createdAt: { gte: since } };

  const [byActionType, byOrg, byProject] = await Promise.all([
    prisma.usageLog.groupBy({
      by: ["actionType"],
      where,
      _sum: { costUsd: true, creditCost: true },
      _count: { _all: true },
    }),
    prisma.usageLog.groupBy({
      by: ["orgId"],
      where,
      _sum: { costUsd: true, creditCost: true },
      _count: { _all: true },
    }),
    prisma.usageLog.groupBy({
      by: ["projectId"],
      where: { ...where, projectId: { not: null } },
      _sum: { costUsd: true, creditCost: true },
      _count: { _all: true },
    }),
  ]);

  const orgIds = byOrg.map((r) => r.orgId);
  const orgs = await prisma.org.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const projectIds = byProject.map((r) => r.projectId).filter((id): id is string => id !== null);
  const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, archetype: true } });
  const projectLabelById = new Map(projects.map((p) => [p.id, `${p.archetype} (${p.id.slice(0, 8)})`]));

  const toRow = (costUsd: unknown, creditCost: number | null, count: number) => ({
    costUsd: (costUsd as { toNumber(): number } | null)?.toNumber() ?? 0,
    creditCost: creditCost ?? 0,
    count,
  });

  return {
    since: since.toISOString(),
    byActionType: byActionType
      .map((r) => ({ actionType: r.actionType, ...toRow(r._sum.costUsd, r._sum.creditCost, r._count._all) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byOrg: byOrg
      .map((r) => ({ orgId: r.orgId, orgName: orgNameById.get(r.orgId) ?? r.orgId, ...toRow(r._sum.costUsd, r._sum.creditCost, r._count._all) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byProject: byProject
      .map((r) => ({
        projectId: r.projectId!,
        projectLabel: projectLabelById.get(r.projectId!) ?? r.projectId!,
        ...toRow(r._sum.costUsd, r._sum.creditCost, r._count._all),
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
  };
}
