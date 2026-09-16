import "dotenv/config";
import { prisma } from "../lib/db";
import { traverseImpact } from "../lib/spec/change-request/traverse-impact";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-impact-traversal org", projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

    // Synthetic graph:
    //   E-001 -> US-001 -> T-001 -> ADR-001 -> E-001   (a CYCLE — must not infinite-loop)
    //   T-001 -> T-002                                  (extends the chain one more hop)
    //   AS-001 -> US-002                                (a totally DISCONNECTED component)
    const edges: [string, string][] = [
      ["E-001", "US-001"],
      ["US-001", "T-001"],
      ["T-001", "ADR-001"],
      ["ADR-001", "E-001"], // closes the cycle back to the start
      ["T-001", "T-002"],
      ["AS-001", "US-002"], // unrelated component, must NEVER be reached
    ];
    await prisma.traceLink.createMany({
      data: edges.map(([from, to]) => ({
        projectId: project.id,
        fromType: "ENTITY" as const,
        fromRefId: from,
        toType: "ENTITY" as const,
        toRefId: to,
        kind: "DERIVES" as const,
      })),
    });

    const start = Date.now();
    const impactSet = await traverseImpact(project.id, ["E-001"]);
    const elapsedMs = Date.now() - start;

    console.log("impactSet:", impactSet.sort());
    console.log(`terminated in ${elapsedMs}ms`);

    // Must find every node in the connected component, via the cycle, both directions.
    for (const refId of ["E-001", "US-001", "T-001", "ADR-001", "T-002"]) {
      console.assert(impactSet.includes(refId), `expected ${refId} to be found (connected component)`);
    }
    // Must NOT wander into the disconnected component.
    console.assert(!impactSet.includes("AS-001"), "AS-001 is in a disconnected component, must not appear");
    console.assert(!impactSet.includes("US-002"), "US-002 is in a disconnected component, must not appear");
    // No duplicates.
    console.assert(new Set(impactSet).size === impactSet.length, "impactSet must contain no duplicates");
    // Must terminate promptly despite the cycle (not hang).
    console.assert(elapsedMs < 5000, `expected traversal to terminate quickly, took ${elapsedMs}ms`);

    // Starting from a DIFFERENT node in the same cycle must reach the exact same component.
    const impactSet2 = await traverseImpact(project.id, ["T-002"]);
    console.assert(
      JSON.stringify([...impactSet].sort()) === JSON.stringify([...impactSet2].sort()),
      "starting from any node in the same connected component must yield the same impact set"
    );

    // Multiple disjoint start nodes: union of both components.
    const impactSet3 = await traverseImpact(project.id, ["E-001", "AS-001"]);
    console.assert(impactSet3.includes("US-002"), "with AS-001 as a start node, its component must now be included");
    console.assert(impactSet3.length === 7, `expected all 7 nodes across both components, got ${impactSet3.length}`);

    console.log("OK: impact traversal finds every connected node and terminates (T-027 DoD)");
  } finally {
    await prisma.traceLink.deleteMany({ where: { project: { orgId: org.id } } });
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
