import "dotenv/config";
import { prisma } from "../lib/db";
import { analyzePasteBack } from "../lib/spec/paste-back";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-paste-back org", creditBalance: 5, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({
      data: {
        orgId: org.id,
        archetype: "SAAS_CRUD",
        brief: {
          create: {
            rawAnswers: {},
            problem: "x".repeat(50),
            targetUser: "y".repeat(30),
            scope: ["Jadwal servis", "Data customer"],
            nonGoals: ["Sistem pembayaran online atau billing berlangganan", "Aplikasi mobile native"],
          },
        },
      },
    });

    const milestone = await prisma.task.create({ data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "Fondasi" } });
    await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: milestone.id,
        refId: "T-001",
        level: "TASK",
        title: "Bangun jadwal servis",
        definitionOfDone: ["a", "b"],
        allowedFiles: ["app/schedule/**", "lib/schedule/**"],
        forbiddenFiles: ["app/api/webhooks/**"],
        status: "DONE",
      },
    });

    const pastedTree = [
      "app/schedule/page.tsx",
      "lib/schedule/actions.ts",
      "app/billing/checkout.ts",
      "app/api/webhooks/stripe.ts",
    ].join("\n");

    const codeState = await analyzePasteBack({
      orgId: org.id,
      projectId: project.id,
      source: "FILE_TREE",
      rawContent: pastedTree,
    });

    console.log("deviations:", JSON.stringify(codeState.deviations, null, 2));

    const deviations = codeState.deviations as { path: string; reason: string; severity: string; touchesNonGoal: boolean }[];

    // AC1 + AC2: deviations reported with path, reason, severity.
    console.assert(deviations.length > 0, "expected at least one deviation (billing checkout + forbidden webhook path)");
    for (const d of deviations) {
      console.assert(typeof d.path === "string" && d.path.length > 0, "every deviation must have a path");
      console.assert(typeof d.reason === "string" && d.reason.length > 0, "every deviation must have a reason");
      console.assert(["low", "medium", "high"].includes(d.severity), "every deviation must have a valid severity");
    }

    // legit in-scope files must NOT be flagged.
    console.assert(
      !deviations.some((d) => d.path.includes("app/schedule/page.tsx") || d.path.includes("lib/schedule/actions.ts")),
      "files within an allowedFiles-covered DONE task must not be flagged as deviations"
    );

    // AC3: a file touching a non-goal area (billing) must be marked HIGH severity.
    const billingDeviation = deviations.find((d) => d.path.includes("billing"));
    console.assert(billingDeviation !== undefined, "expected the billing checkout path to be flagged (touches a non-goal)");
    console.assert(billingDeviation?.touchesNonGoal === true, "billing path must be marked touchesNonGoal");
    console.assert(billingDeviation?.severity === "high", "AC3: a deviation touching a non-goal area must be severity=high");

    // Credit: paste-back must never cost credit.
    const usage = await prisma.usageLog.findFirst({ where: { orgId: org.id, actionType: "PASTE_BACK", succeeded: true } });
    console.assert(usage !== null, "expected a succeeded PASTE_BACK UsageLog row");
    console.assert(usage!.creditCost === 0, "PASTE_BACK must cost 0 credit");
    const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfter.creditBalance === 5, "paste-back must never deduct credit");

    // Persistence.
    const persisted = await prisma.codeState.findUniqueOrThrow({ where: { id: codeState.id } });
    console.assert(persisted.source === "FILE_TREE", "expected source persisted correctly");
    console.assert((persisted.fileTree as string[]).length === 4, "expected all 4 pasted lines stored as fileTree");

    console.log("OK: paste-back satisfies US-011 acceptance criteria");
  } finally {
    await prisma.codeState.deleteMany({ where: { project: { orgId: org.id } } });
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
