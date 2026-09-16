import "dotenv/config";
import { prisma } from "../lib/db";
import { splitTask } from "../lib/spec/split-task";
import { updateTaskStatus } from "../lib/spec/task-status";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-split-task org", creditBalance: 5, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });
    const milestone = await prisma.task.create({
      data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "Fondasi" },
    });
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: milestone.id,
        refId: "T-012",
        level: "TASK",
        title: "Bangun sistem invoice PDF lengkap dengan template dan pengiriman email",
        definitionOfDone: ["Invoice bisa digenerate sebagai PDF", "Invoice bisa dikirim via email"],
        allowedFiles: ["app/invoices/**", "lib/invoice/**"],
        storyRefs: ["US-011"],
      },
    });

    // AC1: split produces 3-6 STEPs, refId inherits parent's number.
    const steps = await splitTask(task.id);
    console.log(`steps (${steps.length}):`, steps.map((s) => `${s.refId}: ${s.title}`));

    console.assert(steps.length >= 3 && steps.length <= 6, "AC1: expected 3-6 steps");
    console.assert(steps.every((s) => /^S-012-\d+$/.test(s.refId)), "AC1: expected refId format S-012-N inheriting parent's number");
    console.assert(steps.every((s) => s.level === "STEP"), "AC1: expected level=STEP");
    console.assert(steps.every((s) => s.parentId === task.id), "AC1: expected parentId = original task's id");
    console.assert(steps.every((s) => (s.storyRefs as string[]).includes("US-011")), "expected steps to inherit parent's storyRefs");
    for (const s of steps) {
      console.assert((s.definitionOfDone as string[]).length >= 2, `step ${s.refId} must have >=2 definitionOfDone`);
      console.assert((s.allowedFiles as string[]).length >= 1, `step ${s.refId} must have >=1 allowedFiles`);
    }

    const usage = await prisma.usageLog.findFirst({ where: { orgId: org.id, actionType: "SPLIT_TASK", succeeded: true } });
    console.assert(usage !== null, "expected a succeeded SPLIT_TASK UsageLog row");
    console.assert(usage!.creditCost === 1, "SPLIT_TASK must cost 1 credit");
    const orgAfterSplit = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfterSplit.creditBalance === 4, `expected creditBalance=4 (5-1), got ${orgAfterSplit.creditBalance}`);

    // AC2: marking all-but-one step DONE must NOT complete the parent yet.
    for (let i = 0; i < steps.length - 1; i++) {
      await updateTaskStatus(steps[i].id, "DONE");
    }
    const taskMid = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    console.assert(taskMid.status !== "DONE", "AC2: parent must NOT be DONE while any step is still incomplete");

    // marking the LAST step DONE must cascade the parent to DONE automatically.
    await updateTaskStatus(steps[steps.length - 1].id, "DONE");
    const taskAfter = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    console.assert(taskAfter.status === "DONE", "AC2: parent must auto-complete once every step is DONE");

    // cascade must also propagate further up: with all tasks under the milestone DONE, milestone auto-completes too.
    const milestoneAfter = await prisma.task.findUniqueOrThrow({ where: { id: milestone.id } });
    console.assert(milestoneAfter.status === "DONE", "cascade must propagate to the milestone too, one level up");

    console.log("OK: split task satisfies US-009 acceptance criteria");
  } finally {
    await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
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
