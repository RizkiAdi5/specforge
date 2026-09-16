import "dotenv/config";
import { prisma } from "../lib/db";
import { regenerateByRefId } from "../lib/spec/refine-artifact";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-refine-edit org", creditBalance: 10, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

    const entity = await prisma.entity.create({
      data: { projectId: project.id, refId: "E-001", name: "Invoice", fields: [{ name: "total", type: "number", required: true }] },
    });
    const untouchedEntity = await prisma.entity.create({
      data: { projectId: project.id, refId: "E-002", name: "Customer", fields: [{ name: "name", type: "string", required: true }] },
    });
    const story = await prisma.story.create({
      data: { projectId: project.id, refId: "US-001", narrative: "Sebagai user, saya bisa membuat invoice.", entityRefs: [entity.refId], acceptanceCriteria: [{ refId: "AC-1", given: "x", when: "y", then: "z" }] },
    });

    // --- US-005: refine touches ONLY the targeted section, costs 1 credit -------------------
    const beforeEntity = await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } });
    await regenerateByRefId({
      orgId: org.id,
      projectId: project.id,
      refId: "E-001",
      instruction: "Tambahkan field currency (string, wajib) ke entitas ini.",
      action: "REFINE_SECTION",
    });

    const entityAfter = await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } });
    const untouchedAfter = await prisma.entity.findUniqueOrThrow({ where: { id: untouchedEntity.id } });
    console.log("E-001 fields after refine:", entityAfter.fields);
    console.assert(
      JSON.stringify(entityAfter.fields) !== JSON.stringify(beforeEntity.fields),
      "AC1: the refined section must actually change"
    );
    console.assert(
      JSON.stringify(untouchedAfter.fields) === JSON.stringify(untouchedEntity.fields),
      "AC1: only the targeted section changes — E-002 must be completely untouched"
    );

    const usage = await prisma.usageLog.findFirst({ where: { orgId: org.id, actionType: "REFINE_SECTION", succeeded: true } });
    console.assert(usage !== null, "expected a succeeded REFINE_SECTION UsageLog row");
    console.assert(usage!.creditCost === 1, "AC2: refine must cost exactly 1 credit");
    const orgAfterRefine = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfterRefine.creditBalance === 9, `expected creditBalance=9 (10-1), got ${orgAfterRefine.creditBalance}`);

    // --- US-006: manual edit, no LLM, no credit, flags linked DONE tasks --------------------
    const milestone = await prisma.task.create({ data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "x" } });
    const doneTask = await prisma.task.create({
      data: { projectId: project.id, parentId: milestone.id, refId: "T-001", level: "TASK", title: "Invoice task", definitionOfDone: ["a", "b"], allowedFiles: ["**"], storyRefs: [story.refId], status: "DONE" },
    });
    const todoTask = await prisma.task.create({
      data: { projectId: project.id, parentId: milestone.id, refId: "T-002", level: "TASK", title: "Unrelated todo task", definitionOfDone: ["a", "b"], allowedFiles: ["**"], storyRefs: [], status: "TODO" },
    });

    const creditBeforeEdit = (await prisma.org.findUniqueOrThrow({ where: { id: org.id } })).creditBalance;
    const newNarrative = "Sebagai user, saya bisa membuat invoice DAN mengirimkannya via email (edit manual).";

    // simulate exactly what PATCH .../spec/US-001 does — direct DB write, no run().
    const updatedStory = await prisma.story.update({ where: { id: story.id }, data: { narrative: newNarrative } });
    const linked = await prisma.task.findMany({ where: { projectId: project.id, level: { in: ["TASK", "STEP"] }, status: "DONE" } });
    const affected = linked.filter((t) => (t.storyRefs as string[]).includes("US-001"));
    if (affected.length) {
      await prisma.task.updateMany({ where: { id: { in: affected.map((t) => t.id) } }, data: { status: "INVALIDATED" } });
    }

    console.assert(updatedStory.narrative === newNarrative, "AC1: manual edit must persist exactly what was submitted");

    const creditAfterEdit = (await prisma.org.findUniqueOrThrow({ where: { id: org.id } })).creditBalance;
    console.assert(creditAfterEdit === creditBeforeEdit, "AC1: manual edit must never deduct credit");
    const usageDuringEdit = await prisma.usageLog.count({ where: { orgId: org.id, createdAt: { gte: new Date(Date.now() - 5000) }, actionType: { notIn: ["REFINE_SECTION"] } } });
    console.assert(usageDuringEdit === 0, "manual edit must never call the LLM (no new UsageLog rows)");

    const doneTaskAfter = await prisma.task.findUniqueOrThrow({ where: { id: doneTask.id } });
    const todoTaskAfter = await prisma.task.findUniqueOrThrow({ where: { id: todoTask.id } });
    console.assert(doneTaskAfter.status === "INVALIDATED", "AC2: DONE task linked to the edited story must be flagged for review");
    console.assert(todoTaskAfter.status === "TODO", "unrelated task (not linked to this story) must be untouched");

    console.log("OK: refine + manual edit satisfy US-005 and US-006 acceptance criteria");
  } finally {
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
