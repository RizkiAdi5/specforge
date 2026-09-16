import "dotenv/config";
import { prisma } from "../lib/db";
import { buildTaskBoard } from "../lib/spec/task-board";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-task-board org", projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

    const milestone = await prisma.task.create({
      data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "Fondasi" },
    });

    // T-001: no deps -> ready.
    await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: milestone.id,
        refId: "T-001",
        level: "TASK",
        title: "Setup proyek",
        definitionOfDone: ["a", "b"],
        allowedFiles: ["**"],
        status: "TODO",
      },
    });

    // T-002: depends on T-001 (not yet DONE) -> locked.
    await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: milestone.id,
        refId: "T-002",
        level: "TASK",
        title: "Schema database",
        definitionOfDone: ["a", "b"],
        allowedFiles: ["**"],
        dependsOn: ["T-001"],
        status: "TODO",
      },
    });

    // T-003: already DONE -> must not appear as "ready" even though unblocked.
    await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: milestone.id,
        refId: "T-003",
        level: "TASK",
        title: "Already finished task",
        definitionOfDone: ["a", "b"],
        allowedFiles: ["**"],
        status: "DONE",
      },
    });

    const board1 = await buildTaskBoard(project.id);
    console.log("ready (before T-001 done):", board1.ready.map((t) => t.refId));
    console.assert(board1.ready.length === 1 && board1.ready[0].refId === "T-001", "AC1: T-001 (no deps) must be ready");
    console.assert(!board1.ready.some((t) => t.refId === "T-002"), "AC2: T-002 (unmet dep) must NOT be ready");
    console.assert(!board1.ready.some((t) => t.refId === "T-003"), "already-DONE task must never appear as ready");

    const t002 = board1.milestones[0].tasks.find((t) => t.refId === "T-002")!;
    console.assert(t002.blockedBy.includes("T-001"), "AC2: T-002 must show T-001 as the blocking reason");
    console.log("T-002 blockedBy:", t002.blockedBy);

    // mark T-001 DONE, T-002 should now surface as ready.
    const t001 = await prisma.task.findFirstOrThrow({ where: { projectId: project.id, refId: "T-001" } });
    await prisma.task.update({ where: { id: t001.id }, data: { status: "DONE" } });

    const board2 = await buildTaskBoard(project.id);
    console.log("ready (after T-001 done):", board2.ready.map((t) => t.refId));
    console.assert(board2.ready.length === 1 && board2.ready[0].refId === "T-002", "AC1: T-002 must become ready once T-001 is DONE");

    console.log("OK: task board satisfies US-007 acceptance criteria");
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
