import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileStories } from "../lib/spec/compile/stories";
import { compileDecisions } from "../lib/spec/compile/decisions";
import { compileTasks } from "../lib/spec/compile/tasks";
import { buildTraceLinks } from "../lib/spec/tracelinks";

async function main() {
  const existing = await prisma.org.findFirst({ where: { name: "SpecForge Demo" } });
  if (existing) {
    const project = await prisma.project.findFirstOrThrow({ where: { orgId: existing.id } });
    console.log(`Demo already seeded. DEMO_PROJECT_ID=${project.id}`);
    return;
  }

  const org = await prisma.org.create({
    data: { name: "SpecForge Demo", creditBalance: 1000, projectSlotMax: 5 },
  });

  const brief = {
    problem:
      "Tukang servis AC lepas yang bekerja sendirian kesulitan menjadwalkan panggilan customer dan sering lupa follow up, sehingga kehilangan pelanggan.",
    targetUser: "Tukang servis AC lepas yang bekerja sendirian, tanpa karyawan atau admin.",
    scope: [
      "Autentikasi dengan email dan password",
      "Manajemen jadwal servis (kalender jadwal)",
      "Manajemen data customer",
      "Pembuatan invoice PDF",
    ],
    nonGoals: ["Multi-tenant", "Billing/langganan berbayar", "Aplikasi mobile native"],
  };

  const project = await prisma.project.create({
    data: {
      orgId: org.id,
      archetype: "SAAS_CRUD",
      status: "COMPILING",
      brief: {
        create: {
          rawAnswers: {
            appName: "Fixly",
            targetUser: brief.targetUser,
            coreProblem: brief.problem,
            mainEntities: "customer, jadwal servis, invoice",
            needsAuth: true,
            authProviders: "Email/Password",
            multiTenant: false,
            needsBilling: false,
            keyWorkflow: "tukang buka app, lihat jadwal hari ini, tandai selesai, kirim invoice",
            mustHaveFeatures: "kalender jadwal, catatan customer, invoice PDF",
          },
          problem: brief.problem,
          targetUser: brief.targetUser,
          scope: brief.scope,
          nonGoals: brief.nonGoals,
          approvedAt: new Date(),
        },
      },
    },
  });

  console.log("Compiling domain...");
  await compileDomain({ orgId: org.id, projectId: project.id, brief });

  console.log("Compiling stories...");
  await compileStories({ orgId: org.id, projectId: project.id, brief, specLevel: "STANDARD" });

  console.log("Compiling decisions...");
  const decisions = await compileDecisions({ orgId: org.id, projectId: project.id, brief });

  console.log("Compiling tasks...");
  await compileTasks({
    orgId: org.id,
    projectId: project.id,
    brief,
    decisions: decisions.map((d) => ({ choice: d.choice, rationale: d.rationale })),
  });

  console.log("Building tracelinks...");
  await buildTraceLinks(project.id);

  await prisma.project.update({ where: { id: project.id }, data: { status: "ACTIVE" } });

  console.log(`\nDemo seeded successfully.\nAdd this to .env:\nDEMO_PROJECT_ID=${project.id}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
