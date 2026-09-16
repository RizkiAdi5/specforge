import "dotenv/config";
import { prisma } from "../lib/db";
import { getUsageDashboard } from "../lib/spec/admin-usage";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-admin-usage org" } });
  const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

  try {
    // Deliberately make CHANGE_REQUEST the most expensive action type this month.
    await prisma.usageLog.createMany({
      data: [
        { orgId: org.id, projectId: project.id, actionType: "SPLIT_TASK", model: "deepseek-chat", creditCost: 1, costUsd: 0.001, succeeded: true },
        { orgId: org.id, projectId: project.id, actionType: "SPLIT_TASK", model: "deepseek-chat", creditCost: 1, costUsd: 0.001, succeeded: true },
        { orgId: org.id, projectId: project.id, actionType: "CHANGE_REQUEST", model: "deepseek-reasoner", creditCost: 3, costUsd: 0.05, succeeded: true },
        { orgId: org.id, projectId: project.id, actionType: "REFINE_SECTION", model: "deepseek-chat", creditCost: 1, costUsd: 0.002, succeeded: true },
      ],
    });

    const dashboard = await getUsageDashboard();
    console.log("byActionType (sorted, most expensive first):", dashboard.byActionType.slice(0, 5));

    // Core DoD claim: must be able to answer "which action is priciest this month."
    console.assert(dashboard.byActionType.length > 0, "expected at least one action type row");
    console.assert(dashboard.byActionType[0].actionType === "CHANGE_REQUEST", "CHANGE_REQUEST must rank first (highest costUsd)");
    console.assert(
      dashboard.byActionType.every((r, i, arr) => i === 0 || arr[i - 1].costUsd >= r.costUsd),
      "byActionType must be sorted descending by cost"
    );

    const splitRow = dashboard.byActionType.find((r) => r.actionType === "SPLIT_TASK");
    console.assert(splitRow?.count === 2, "SPLIT_TASK count must aggregate both calls");
    console.assert(Math.abs((splitRow?.costUsd ?? 0) - 0.002) < 1e-9, "SPLIT_TASK cost must sum both calls");

    // per-org and per-project breakdowns must also resolve to real, readable labels.
    const orgRow = dashboard.byOrg.find((r) => r.orgId === org.id);
    console.assert(orgRow?.orgName === "check-admin-usage org", "byOrg must resolve the real org name, not just the id");
    const projectRow = dashboard.byProject.find((r) => r.projectId === project.id);
    console.assert(projectRow !== undefined, "byProject must include this project");

    console.log("OK: admin usage dashboard satisfies T-033 DoD");
  } finally {
    await prisma.usageLog.deleteMany({ where: { orgId: org.id } });
    await prisma.project.deleteMany({ where: { orgId: org.id } });
    await prisma.org.delete({ where: { id: org.id } });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
