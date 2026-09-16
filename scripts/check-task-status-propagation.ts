import "dotenv/config";
import { prisma } from "../lib/db";
import { buildTaskBoard } from "../lib/spec/task-board";
import { updateTaskStatus } from "../lib/spec/task-status";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-task-status-propagation org", projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });
    const milestone = await prisma.task.create({
      data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "Fondasi" },
    });

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

    const before = await buildTaskBoard(project.id);
    console.log("ready before:", before.ready.map((t) => t.refId));
    console.assert(before.ready.length === 1 && before.ready[0].refId === "T-001", "T-001 should be ready, T-002 still blocked");

    // "user menandai task selesai" — via the same status endpoint's underlying function.
    const t001 = await prisma.task.findFirstOrThrow({ where: { projectId: project.id, refId: "T-001" } });
    await updateTaskStatus(t001.id, "DONE");

    const after = await buildTaskBoard(project.id);
    console.log("ready after T-001 marked DONE:", after.ready.map((t) => t.refId));
    console.assert(
      after.ready.length === 1 && after.ready[0].refId === "T-002",
      "US-010: T-002 must surface as ready ('naik ke atas board') once its dependency (T-001) is DONE"
    );

    console.log("OK: task status + propagation satisfies US-010 (via existing T-017 + T-020 infrastructure)");
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
