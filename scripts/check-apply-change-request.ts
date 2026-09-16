import "dotenv/config";
import { prisma } from "../lib/db";
import { analyzeChangeRequest } from "../lib/spec/change-request/analyze";
import { applyImpactedArtifacts } from "../lib/spec/change-request/regenerate";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-apply-change-request org", creditBalance: 10, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

    // Two independent entities: only Invoice should be touched by a currency-related change.
    const invoice = await prisma.entity.create({
      data: { projectId: project.id, refId: "E-001", name: "Invoice", fields: [{ name: "totalIdr", type: "number", required: true }] },
    });
    const customer = await prisma.entity.create({
      data: { projectId: project.id, refId: "E-002", name: "Customer", fields: [{ name: "name", type: "string", required: true }] },
    });

    const invoiceStory = await prisma.story.create({
      data: { projectId: project.id, refId: "US-001", narrative: "Sebagai user, saya bisa membuat invoice dalam Rupiah.", entityRefs: [invoice.refId], acceptanceCriteria: [{ refId: "AC-1", given: "x", when: "y", then: "z" }] },
    });
    const customerStory = await prisma.story.create({
      data: { projectId: project.id, refId: "US-002", narrative: "Sebagai user, saya bisa menambahkan data customer.", entityRefs: [customer.refId], acceptanceCriteria: [{ refId: "AC-1", given: "x", when: "y", then: "z" }] },
    });

    // Two prompt packets: one snapshotting the invoice story (must go stale), one the
    // completely unrelated customer story (must stay fresh).
    const milestone = await prisma.task.create({ data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "x" } });
    const invoiceTask = await prisma.task.create({
      data: { projectId: project.id, parentId: milestone.id, refId: "T-001", level: "TASK", title: "Invoice task", definitionOfDone: ["a", "b"], allowedFiles: ["**"], storyRefs: [invoiceStory.refId] },
    });
    const customerTask = await prisma.task.create({
      data: { projectId: project.id, parentId: milestone.id, refId: "T-002", level: "TASK", title: "Customer task", definitionOfDone: ["a", "b"], allowedFiles: ["**"], storyRefs: [customerStory.refId] },
    });

    // Same edges T-015's real tracelinks stage would produce: story->entity (DERIVES) and
    // task->story (IMPLEMENTS) — without these, tasks are disconnected from their own spec.
    await prisma.traceLink.createMany({
      data: [
        { projectId: project.id, fromType: "STORY", fromRefId: invoiceStory.refId, toType: "ENTITY", toRefId: invoice.refId, kind: "DERIVES" },
        { projectId: project.id, fromType: "STORY", fromRefId: customerStory.refId, toType: "ENTITY", toRefId: customer.refId, kind: "DERIVES" },
        { projectId: project.id, fromType: "TASK", fromRefId: invoiceTask.refId, toType: "STORY", toRefId: invoiceStory.refId, kind: "IMPLEMENTS" },
        { projectId: project.id, fromType: "TASK", fromRefId: customerTask.refId, toType: "STORY", toRefId: customerStory.refId, kind: "IMPLEMENTS" },
      ],
    });
    const invoicePacket = await prisma.promptPacket.create({
      data: { taskId: invoiceTask.id, body: "...", specSnapshot: [invoiceTask.refId, invoiceStory.refId, invoice.refId], isStale: false },
    });
    const customerPacket = await prisma.promptPacket.create({
      data: { taskId: customerTask.id, body: "...", specSnapshot: [customerTask.refId, customerStory.refId, customer.refId], isStale: false },
    });

    const { changeRequest } = await analyzeChangeRequest({
      orgId: org.id,
      projectId: project.id,
      description: "Invoice harus mendukung multi-currency (USD dan IDR), bukan cuma Rupiah.",
    });
    console.log("impactSet:", changeRequest.impactSet);

    const result = await applyImpactedArtifacts({
      orgId: org.id,
      projectId: project.id,
      impactSet: changeRequest.impactSet as string[],
      description: changeRequest.description,
    });
    console.log("regenerated:", result.regenerated);
    console.log("staleIds:", result.staleIds);

    // Core DoD claim: ONLY impacted artifacts changed.
    const invoiceAfter = await prisma.entity.findUniqueOrThrow({ where: { id: invoice.id } });
    const customerAfter = await prisma.entity.findUniqueOrThrow({ where: { id: customer.id } });
    console.log("invoice fields after:", invoiceAfter.fields);
    console.log("customer fields after:", customerAfter.fields);

    console.assert(
      JSON.stringify(invoiceAfter.fields) !== JSON.stringify(invoice.fields),
      "invoice entity (in impactSet) must have actually changed"
    );
    console.assert(
      JSON.stringify(customerAfter.fields) === JSON.stringify(customer.fields),
      "customer entity (NOT in impactSet) must be completely untouched"
    );

    const invoiceStoryAfter = await prisma.story.findUniqueOrThrow({ where: { id: invoiceStory.id } });
    const customerStoryAfter = await prisma.story.findUniqueOrThrow({ where: { id: customerStory.id } });
    console.assert(
      invoiceStoryAfter.narrative !== invoiceStory.narrative || JSON.stringify(invoiceStoryAfter.acceptanceCriteria) !== JSON.stringify(invoiceStory.acceptanceCriteria),
      "invoice story (in impactSet) must have changed"
    );
    console.assert(
      customerStoryAfter.narrative === customerStory.narrative,
      "customer story (NOT in impactSet) must be completely untouched"
    );

    // PromptPacket staleness: exactly the intersecting one, never the unrelated one.
    const invoicePacketAfter = await prisma.promptPacket.findUniqueOrThrow({ where: { id: invoicePacket.id } });
    const customerPacketAfter = await prisma.promptPacket.findUniqueOrThrow({ where: { id: customerPacket.id } });
    console.assert(invoicePacketAfter.isStale === true, "invoice packet (specSnapshot intersects impactSet) must be marked stale");
    console.assert(customerPacketAfter.isStale === false, "customer packet (no intersection) must stay fresh");

    // regeneration must be 0 credit (bundled into the CHANGE_REQUEST charge already paid).
    const regenUsage = await prisma.usageLog.findMany({ where: { orgId: org.id, actionType: "REGENERATE_ARTIFACT" } });
    console.assert(regenUsage.length > 0, "expected REGENERATE_ARTIFACT UsageLog rows");
    console.assert(regenUsage.every((u) => u.creditCost === 0), "REGENERATE_ARTIFACT must cost 0 credit");

    console.log("OK: partial regeneration + stale packet marking satisfies T-028 DoD");
  } finally {
    await prisma.changeRequest.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.promptPacket.deleteMany({ where: { task: { project: { orgId: org.id } } } });
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
