import "dotenv/config";
import { prisma } from "../lib/db";
import { inngest } from "../lib/inngest/client";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-compile-brief test org", creditBalance: 20, projectSlotMax: 5 },
  });

  try {
    const project = await prisma.project.create({
      data: {
        orgId: org.id,
        archetype: "SAAS_CRUD",
        brief: {
          create: {
            rawAnswers: {
              appName: "Fixly",
              targetUser: "tukang servis AC lepas yang kerja sendirian",
              coreProblem: "susah jadwalin panggilan customer dan sering lupa follow up",
              mainEntities: "customer, jadwal servis, invoice",
              needsAuth: true,
              authProviders: "Email/Password",
              multiTenant: false,
              needsBilling: false,
              keyWorkflow: "tukang buka app, lihat jadwal hari ini, tandai selesai, kirim invoice",
              mustHaveFeatures: "kalender jadwal, catatan customer, invoice PDF",
            },
          },
        },
      },
    });

    await inngest.send({ name: "project/brief-compile.requested", data: { projectId: project.id } });

    const deadline = Date.now() + 60_000;
    let brief = null;
    while (Date.now() < deadline) {
      brief = await prisma.brief.findUnique({ where: { projectId: project.id } });
      if (brief?.problem) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (!brief?.problem) {
      throw new Error("timed out waiting for compile.brief to finish");
    }

    console.log("problem:", brief.problem);
    console.log("targetUser:", brief.targetUser);
    console.log("scope:", brief.scope);
    console.log("nonGoals:", brief.nonGoals);

    console.assert(typeof brief.problem === "string" && brief.problem.length >= 40, "expected problem >= 40 chars");
    console.assert(typeof brief.targetUser === "string" && brief.targetUser.length >= 20, "expected targetUser >= 20 chars");
    console.assert(Array.isArray(brief.scope) && (brief.scope as unknown[]).length >= 3, "expected scope >= 3 items");
    console.assert(Array.isArray(brief.nonGoals) && (brief.nonGoals as unknown[]).length >= 3, "expected nonGoals >= 3 items");

    const assumptions = await prisma.assumption.findMany({ where: { projectId: project.id } });
    console.log(`assumptions (${assumptions.length}):`, assumptions.map((a) => `${a.refId}: ${a.statement}`));
    console.assert(assumptions.length > 0, "expected at least one assumption");
    console.assert(assumptions.every((a) => a.status === "OPEN"), "expected all assumptions to be OPEN");
    console.assert(new Set(assumptions.map((a) => a.refId)).size === assumptions.length, "expected unique refIds");
    console.assert(assumptions.every((a) => /^AS-\d{3}$/.test(a.refId)), "expected refId format AS-NNN");

    const usage = await prisma.usageLog.findFirst({
      where: { orgId: org.id, actionType: "COMPILE_SPEC", succeeded: true },
      orderBy: { createdAt: "desc" },
    });
    console.assert(usage !== null, "expected a succeeded COMPILE_SPEC UsageLog row");

    const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfter.creditBalance === 10, `expected creditBalance=10 (20-10), got ${orgAfter.creditBalance}`);

    const projectAfter = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    console.assert(projectAfter.status === "INTERVIEWING", "project status must stay INTERVIEWING until brief is approved");

    console.log("OK: compile.brief job satisfies T-008 DoD");
  } finally {
    await prisma.assumption.deleteMany({ where: { project: { orgId: org.id } } });
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
