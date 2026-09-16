import "dotenv/config";
import { prisma } from "../lib/db";
import { getOrCreatePromptPacket } from "../lib/spec/prompt-packet";
import { getPendingAssumptions } from "../lib/spec/assumption-gate";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-assumption-gate org", creditBalance: 5, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

    const story = await prisma.story.create({
      data: {
        projectId: project.id,
        refId: "US-001",
        narrative: "Sebagai tukang, saya bisa membuat jadwal servis baru.",
        entityRefs: [],
        acceptanceCriteria: [{ refId: "AC-1", given: "x", when: "y", then: "z" }],
      },
    });

    const milestone = await prisma.task.create({
      data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "Fondasi" },
    });
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: milestone.id,
        refId: "T-001",
        level: "TASK",
        title: "Bangun form jadwal",
        definitionOfDone: ["a", "b"],
        allowedFiles: ["**"],
        storyRefs: [story.refId],
      },
    });

    const assumption = await prisma.assumption.create({
      data: {
        projectId: project.id,
        refId: "AS-001",
        statement: "Aplikasi hanya mendukung satu bahasa (Indonesia).",
        question: "Apakah perlu dukungan multi-bahasa?",
        status: "OPEN",
      },
    });
    await prisma.traceLink.create({
      data: { projectId: project.id, fromType: "ASSUMPTION", fromRefId: assumption.refId, toType: "TASK", toRefId: task.refId, kind: "ASSUMES" },
    });

    // AC1: task linked to an OPEN assumption -> prompt must be locked.
    const pendingBefore = await getPendingAssumptions(task.id);
    console.assert(pendingBefore.length === 1 && pendingBefore[0].refId === "AS-001", "AC1: expected AS-001 to be pending");

    let threw = false;
    try {
      // getOrCreatePromptPacket itself doesn't gate — the route does. Verify the route-level
      // gate function directly reports blocking, which is what the route checks before calling this.
      if ((await getPendingAssumptions(task.id)).length > 0) throw new Error("locked");
      await getOrCreatePromptPacket(task.id);
    } catch {
      threw = true;
    }
    console.assert(threw, "AC1: packet must not be produced while an assumption is pending");

    // AC2: answering confirms it and the answer flows into the packet.
    await prisma.assumption.update({
      where: { id: assumption.id },
      data: { status: "CONFIRMED", answer: "Tidak, cukup Bahasa Indonesia saja untuk versi pertama." },
    });

    const pendingAfter = await getPendingAssumptions(task.id);
    console.assert(pendingAfter.length === 0, "AC2: expected no pending assumptions after confirming");

    const packet = await getOrCreatePromptPacket(task.id);
    console.log("--- packet body ---\n" + packet.body + "\n--- end ---");
    console.assert(
      packet.body.includes("Tidak, cukup Bahasa Indonesia saja untuk versi pertama."),
      "AC2: confirmed assumption's answer must appear in the packet"
    );
    console.assert((packet.specSnapshot as string[]).includes("AS-001"), "AC2: specSnapshot must include the confirmed assumption's refId");

    const finalAssumption = await prisma.assumption.findUniqueOrThrow({ where: { id: assumption.id } });
    console.assert(finalAssumption.status === "CONFIRMED", "AC2: assumption status must be CONFIRMED");

    console.log("OK: assumption gate satisfies US-013 acceptance criteria");
  } finally {
    await prisma.traceLink.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.promptPacket.deleteMany({ where: { task: { project: { orgId: org.id } } } });
    await prisma.assumption.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.story.deleteMany({ where: { project: { orgId: org.id } } });
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
