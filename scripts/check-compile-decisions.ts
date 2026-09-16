import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileDecisions } from "../lib/spec/compile/decisions";
import { BLUEPRINT_CATALOG } from "../lib/blueprints/catalog";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-compile-decisions test org", creditBalance: 5, projectSlotMax: 5 },
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

    await compileDomain({ orgId: org.id, projectId: project.id, brief });

    const decisions = await compileDecisions({ orgId: org.id, projectId: project.id, brief });
    console.log(
      `decisions (${decisions.length}):`,
      decisions.map((d) => `${d.refId}: ${d.choice}`)
    );

    console.assert(decisions.length >= 1, "expected at least one decision (the blueprint pick)");
    console.assert(decisions.every((d) => /^ADR-\d{3}$/.test(d.refId)), "expected refId format ADR-NNN");
    console.assert(new Set(decisions.map((d) => d.refId)).size === decisions.length, "expected unique refIds");
    console.assert(
      decisions.every((d) => Array.isArray(d.alternatives) && (d.alternatives as unknown[]).length > 0),
      "every decision must list rejected alternatives"
    );
    console.assert(
      decisions.every((d) => typeof d.rationale === "string" && d.rationale.length > 0),
      "every decision must have a rationale"
    );

    const projectAfter = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    console.assert(projectAfter.blueprintId !== null, "expected Project.blueprintId to be set");
    console.assert(
      BLUEPRINT_CATALOG.some((b) => b.id === projectAfter.blueprintId),
      `blueprintId "${projectAfter.blueprintId}" must be one of the curated catalog entries, never invented`
    );
    console.log("chosen blueprint:", projectAfter.blueprintId);
    console.assert(
      decisions[0].choice === BLUEPRINT_CATALOG.find((b) => b.id === projectAfter.blueprintId)!.name,
      "first decision (ADR-001) must be the blueprint choice itself"
    );

    const usage = await prisma.usageLog.findFirst({
      where: { orgId: org.id, actionType: "COMPILE_DECISIONS", succeeded: true },
    });
    console.assert(usage !== null, "expected a succeeded COMPILE_DECISIONS UsageLog row");
    console.assert(usage!.model === "deepseek-reasoner", `expected thinking-mode model, got ${usage!.model}`);
    console.assert(usage!.creditCost === 0, "COMPILE_DECISIONS must cost 0 credit (included in COMPILE_SPEC)");

    const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfter.creditBalance === 5, "compile.decisions must never deduct credit on its own");

    console.log("OK: compile.decisions satisfies T-012 DoD");
  } finally {
    await prisma.decision.deleteMany({ where: { project: { orgId: org.id } } });
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
