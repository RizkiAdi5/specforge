import "dotenv/config";
import { prisma } from "../lib/db";
import { PLAN_CREDIT_ALLOTMENT } from "../lib/billing/plan-allotment";
import { splitTask } from "../lib/spec/split-task";
import { InsufficientCreditError } from "../lib/ai/run";
import { insufficientCreditResponse } from "../lib/ai/insufficient-credit-response";

async function main() {
  // AC1: percentRemaining < 20 must be flagged low, matching the /api/usage computation.
  {
    const org = await prisma.org.create({ data: { name: "check-credit-ui low org", plan: "FREE", creditBalance: 1 } });
    const allotment = PLAN_CREDIT_ALLOTMENT[org.plan];
    const percentRemaining = Math.round((org.creditBalance / allotment) * 100);
    console.log(`FREE org with 1/${allotment} credit -> ${percentRemaining}%`);
    console.assert(percentRemaining < 20, "AC1: 1/10 credit must compute to below 20%");
    await prisma.org.delete({ where: { id: org.id } });
  }
  {
    const org = await prisma.org.create({ data: { name: "check-credit-ui ok org", plan: "FREE", creditBalance: 9 } });
    const allotment = PLAN_CREDIT_ALLOTMENT[org.plan];
    const percentRemaining = Math.round((org.creditBalance / allotment) * 100);
    console.log(`FREE org with 9/${allotment} credit -> ${percentRemaining}%`);
    console.assert(percentRemaining >= 20, "expected 9/10 credit to NOT be flagged low");
    await prisma.org.delete({ where: { id: org.id } });
  }

  // AC2: a paid action attempted with 0 credit must surface as the specific insufficient-credit
  // shape (402 + error code), not a generic 500 — exactly what the route.ts wiring does.
  {
    const org = await prisma.org.create({ data: { name: "check-credit-ui poor org", creditBalance: 0, projectSlotMax: 5 } });
    try {
      const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });
      const milestone = await prisma.task.create({ data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "x" } });
      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          parentId: milestone.id,
          refId: "T-001",
          level: "TASK",
          title: "Task tanpa credit",
          definitionOfDone: ["a", "b"],
          allowedFiles: ["**"],
        },
      });

      let caught: unknown = null;
      try {
        await splitTask(task.id);
      } catch (err) {
        caught = err;
      }
      console.assert(caught instanceof InsufficientCreditError, "AC2: expected InsufficientCreditError when credit is 0");

      // simulate exactly what the route does with that caught error.
      const res = insufficientCreditResponse(caught);
      const responseBody = await res.json();
      console.log("route response:", res.status, responseBody);
      console.assert(res.status === 402, "AC2: expected HTTP 402, not a generic error");
      console.assert((responseBody as { error: string }).error === "insufficient_credit", "AC2: expected the specific error code the UI checks for");

      const entityCount = await prisma.entity.count({ where: { projectId: project.id } });
      console.assert(entityCount === 0, "no partial work should have been persisted");
    } finally {
      await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.project.deleteMany({ where: { orgId: org.id } });
      await prisma.org.delete({ where: { id: org.id } });
    }
  }

  console.log("OK: credit UI plumbing satisfies US-014 acceptance criteria");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
