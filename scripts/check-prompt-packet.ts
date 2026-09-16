import "dotenv/config";
import { prisma } from "../lib/db";
import { getOrCreatePromptPacket } from "../lib/spec/prompt-packet";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-prompt-packet org", creditBalance: 5, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({
      data: { orgId: org.id, archetype: "SAAS_CRUD", blueprintId: "nextjs-prisma-postgres" },
    });

    const entity = await prisma.entity.create({
      data: { projectId: project.id, refId: "E-001", name: "ServiceAppointment", fields: [{ name: "status", type: "string", required: true }] },
    });

    // Two stories: only US-001 is linked to the task we'll build a packet for.
    const linkedStory = await prisma.story.create({
      data: {
        projectId: project.id,
        refId: "US-001",
        narrative: "Sebagai tukang, saya bisa membuat jadwal servis baru.",
        entityRefs: [entity.refId],
        acceptanceCriteria: [{ refId: "AC-1", given: "saya login", when: "saya isi form jadwal", then: "jadwal tersimpan" }],
      },
    });
    const unrelatedStory = await prisma.story.create({
      data: {
        projectId: project.id,
        refId: "US-999",
        narrative: "SANGAT RAHASIA cerita yang tidak boleh muncul di packet manapun karena tidak tertaut ke task manapun yang kita uji.",
        entityRefs: [],
        acceptanceCriteria: [{ refId: "AC-1", given: "x", when: "y", then: "z" }],
      },
    });

    const decision = await prisma.decision.create({
      data: { projectId: project.id, refId: "ADR-001", choice: "Pakai Prisma sebagai ORM", alternatives: [{ option: "Drizzle", whyRejected: "kurang familiar" }], rationale: "..." },
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
        title: "Bangun form jadwal servis",
        definitionOfDone: ["Form bisa submit", "Data tersimpan ke DB"],
        allowedFiles: ["app/schedule/**"],
        forbiddenFiles: ["app/api/webhooks/**"],
        storyRefs: [linkedStory.refId],
      },
    });

    // decision CONSTRAINS this task via TraceLink (normally built by T-015's tracelinks stage).
    await prisma.traceLink.create({
      data: { projectId: project.id, fromType: "DECISION", fromRefId: decision.refId, toType: "TASK", toRefId: task.refId, kind: "CONSTRAINS" },
    });

    const packet = await getOrCreatePromptPacket(task.id);
    console.log("--- packet body ---\n" + packet.body + "\n--- end ---");
    console.log("specSnapshot:", packet.specSnapshot);

    console.assert(packet.body.includes(linkedStory.narrative), "must include the linked story's narrative");
    console.assert(!packet.body.includes(unrelatedStory.narrative), "T-018 DoD: must NOT include the unlinked story");
    console.assert(!(packet.specSnapshot as string[]).includes(unrelatedStory.refId), "specSnapshot must not reference the unlinked story");

    console.assert(packet.body.includes("app/schedule/**"), "must include allowedFiles");
    console.assert(packet.body.includes("app/api/webhooks/**"), "must include forbiddenFiles");
    console.assert(packet.body.includes("Form bisa submit"), "must include definitionOfDone");
    console.assert(packet.body.includes("Pakai Prisma sebagai ORM"), "must include the CONSTRAINS-linked ADR's choice");
    console.assert(packet.body.includes("ServiceAppointment"), "must include the entity referenced by the linked story");

    console.assert(!packet.body.toLowerCase().includes("problem"), "must never dump the full brief/PRD into the packet");

    const estimatedTokens = Math.ceil(packet.body.length / 4);
    console.log(`estimated tokens: ${estimatedTokens}`);
    console.assert(estimatedTokens < 1500, "packet must stay under the 1500 token budget");

    const org1 = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(org1.creditBalance === 5, "prompt packet generation must never deduct credit");

    // getOrCreatePromptPacket must return the CACHED packet on a second call, not regenerate.
    const packet2 = await getOrCreatePromptPacket(task.id);
    console.assert(packet2.id === packet.id, "must return the cached non-stale packet, not create a duplicate");

    console.log("OK: prompt packet assembler satisfies T-018 DoD");
  } finally {
    await prisma.traceLink.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.promptPacket.deleteMany({ where: { task: { project: { orgId: org.id } } } });
    await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.decision.deleteMany({ where: { project: { orgId: org.id } } });
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
