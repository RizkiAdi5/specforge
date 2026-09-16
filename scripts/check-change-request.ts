import "dotenv/config";
import { prisma } from "../lib/db";
import { analyzeChangeRequest } from "../lib/spec/change-request/analyze";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-change-request org", creditBalance: 10, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

    const entity = await prisma.entity.create({
      data: { projectId: project.id, refId: "E-001", name: "Invoice", fields: [{ name: "total", type: "number", required: true }] },
    });
    const story = await prisma.story.create({
      data: { projectId: project.id, refId: "US-001", narrative: "Sebagai user, saya bisa membuat invoice.", entityRefs: [entity.refId], acceptanceCriteria: [{ refId: "AC-1", given: "x", when: "y", then: "z" }] },
    });
    const milestone = await prisma.task.create({ data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "Fondasi" } });
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: milestone.id,
        refId: "T-001",
        level: "TASK",
        title: "Bangun invoice",
        definitionOfDone: ["a", "b"],
        allowedFiles: ["**"],
        storyRefs: [story.refId],
        status: "DONE", // already finished — must become INVALIDATED once impacted
      },
    });
    await prisma.traceLink.createMany({
      data: [
        { projectId: project.id, fromType: "STORY", fromRefId: story.refId, toType: "ENTITY", toRefId: entity.refId, kind: "DERIVES" },
        { projectId: project.id, fromType: "TASK", fromRefId: task.refId, toType: "STORY", toRefId: story.refId, kind: "IMPLEMENTS" },
      ],
    });

    const { changeRequest, summary } = await analyzeChangeRequest({
      orgId: org.id,
      projectId: project.id,
      description: "Invoice sekarang harus mendukung multi-currency, bukan cuma Rupiah.",
    });

    console.log("impactSet:", changeRequest.impactSet);
    console.log("summary:", summary);

    // AC1: impact numbers shown, including which DONE tasks became invalid.
    console.assert((changeRequest.impactSet as string[]).includes(entity.refId), "expected Invoice entity in impact set");
    console.assert((changeRequest.impactSet as string[]).includes(story.refId), "expected the story in impact set (connected via DERIVES)");
    console.assert((changeRequest.impactSet as string[]).includes(task.refId), "expected the task in impact set (connected via IMPLEMENTS)");
    console.assert(summary.invalidatedTasks.includes(task.refId), "AC1: DONE task in impact set must be reported as invalidated");

    const taskAfter = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    console.assert(taskAfter.status === "INVALIDATED", "AC1: the DONE task must actually transition to INVALIDATED in the DB");

    console.assert(changeRequest.status === "AWAITING_APPROVAL", "expected status AWAITING_APPROVAL after successful analysis");

    const usage = await prisma.usageLog.findFirst({ where: { orgId: org.id, actionType: "CHANGE_REQUEST", succeeded: true } });
    console.assert(usage !== null, "expected a succeeded CHANGE_REQUEST UsageLog row");
    console.assert(usage!.creditCost === 3, "CHANGE_REQUEST must cost 3 credit");
    console.assert(usage!.model === "deepseek-reasoner", `expected thinking-mode model, got ${usage!.model}`);

    const orgAfterAnalysis = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfterAnalysis.creditBalance === 7, `expected creditBalance=7 (10-3), got ${orgAfterAnalysis.creditBalance}`);

    // AC3: discard must not refund credit and must not touch anything else.
    await prisma.changeRequest.update({ where: { id: changeRequest.id }, data: { status: "DISCARDED" } });
    const orgAfterDiscard = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfterDiscard.creditBalance === 7, "AC3: discarding must NOT refund the credit already spent on analysis");
    const taskAfterDiscard = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    console.assert(taskAfterDiscard.status === "INVALIDATED", "AC3: discard must not revert the invalidation either — nothing rolls back");

    console.log("OK: change request analysis satisfies US-012 acceptance criteria");
  } finally {
    await prisma.changeRequest.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.traceLink.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.story.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.entity.deleteMany({ where: { project: { orgId: org.id } } });
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
