import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-compile-domain test org", creditBalance: 5, projectSlotMax: 5 },
  });

  try {
    const project = await prisma.project.create({
      data: { orgId: org.id, archetype: "SAAS_CRUD" },
    });

    const brief = {
      problem:
        "Tukang servis AC lepas yang bekerja sendirian kesulitan menjadwalkan panggilan customer dan sering lupa follow up.",
      targetUser: "Tukang servis AC lepas yang bekerja sendirian, tanpa karyawan atau admin.",
      scope: [
        "Autentikasi dengan email dan password",
        "Manajemen jadwal servis (kalender jadwal)",
        "Manajemen data customer",
        "Pembuatan invoice PDF",
      ],
      nonGoals: ["Multi-tenant", "Billing/langganan", "Aplikasi mobile native"],
    };

    const entities = await compileDomain({ orgId: org.id, projectId: project.id, brief });

    console.log(
      `entities (${entities.length}):`,
      entities.map((e) => `${e.refId}: ${e.name}`)
    );

    console.assert(entities.length > 0, "expected at least one entity");
    console.assert(entities.every((e) => /^E-\d{3}$/.test(e.refId)), "expected refId format E-NNN");
    console.assert(new Set(entities.map((e) => e.refId)).size === entities.length, "expected unique refIds");

    // cross-reference integrity: every relation must point to a refId that actually exists among the created entities.
    const refIdSet = new Set(entities.map((e) => e.refId));
    for (const e of entities) {
      const relations = e.relations as { toRefId: string; kind: string }[];
      for (const rel of relations) {
        console.assert(refIdSet.has(rel.toRefId), `relation from ${e.refId} points to unknown refId ${rel.toRefId}`);
      }
      console.log(`  ${e.refId} relations:`, relations);
    }

    const usage = await prisma.usageLog.findFirst({
      where: { orgId: org.id, actionType: "COMPILE_DOMAIN", succeeded: true },
    });
    console.assert(usage !== null, "expected a succeeded COMPILE_DOMAIN UsageLog row");
    console.assert(usage!.creditCost === 0, "COMPILE_DOMAIN must cost 0 credit (included in COMPILE_SPEC)");

    const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfter.creditBalance === 5, "compile.domain must never deduct credit on its own");

    console.log("OK: compile.domain satisfies T-010 DoD");
  } finally {
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
