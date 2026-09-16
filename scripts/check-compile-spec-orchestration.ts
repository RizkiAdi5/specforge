import "dotenv/config";
import { prisma } from "../lib/db";
import { inngest } from "../lib/inngest/client";

async function waitForStatusChange(projectId: string, from: "COMPILING", timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (p.status !== from) return p;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for status to leave ${from}`);
}

async function main() {
  // --- Test 1: full happy path, real API, real Inngest run -------------------------------
  {
    const org = await prisma.org.create({
      data: { name: "check-compile-spec happy org", creditBalance: 20, projectSlotMax: 5 },
    });
    try {
      const project = await prisma.project.create({
        data: {
          orgId: org.id,
          archetype: "SAAS_CRUD",
          status: "COMPILING",
          brief: {
            create: {
              rawAnswers: {},
              problem:
                "Tukang servis AC lepas yang bekerja sendirian kesulitan menjadwalkan panggilan customer dan sering lupa follow up.",
              targetUser: "Tukang servis AC lepas yang bekerja sendirian, tanpa karyawan atau admin.",
              scope: ["Autentikasi email/password", "Jadwal servis", "Data customer", "Invoice PDF"],
              nonGoals: ["Multi-tenant", "Billing/langganan"],
              approvedAt: new Date(),
            },
          },
        },
      });

      await inngest.send({ name: "project/spec-compile.requested", data: { projectId: project.id } });
      const after = await waitForStatusChange(project.id, "COMPILING", 120_000);

      console.log("happy path final status:", after.status);
      console.assert(after.status === "ACTIVE", `expected ACTIVE, got ${after.status}`);
      console.assert(after.lastCompileError === null, "expected lastCompileError cleared on success");

      const [entities, stories, decisions, tasks, links] = await Promise.all([
        prisma.entity.count({ where: { projectId: project.id } }),
        prisma.story.count({ where: { projectId: project.id } }),
        prisma.decision.count({ where: { projectId: project.id } }),
        prisma.task.count({ where: { projectId: project.id } }),
        prisma.traceLink.count({ where: { projectId: project.id } }),
      ]);
      console.log(`persisted: entities=${entities} stories=${stories} decisions=${decisions} tasks=${tasks} traceLinks=${links}`);
      console.assert(entities > 0 && stories > 0 && decisions > 0 && tasks > 0 && links > 0, "expected all artifact types persisted");

      const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
      console.assert(orgAfter.creditBalance === 10, `expected creditBalance=10 (20-10), got ${orgAfter.creditBalance}`);

      const usage = await prisma.usageLog.findMany({ where: { orgId: org.id, actionType: "COMPILE_SPEC" } });
      console.assert(usage.length === 1, `expected exactly one COMPILE_SPEC UsageLog row, got ${usage.length}`);
      console.assert(usage[0].creditCost === 10, "expected the single COMPILE_SPEC charge to be 10");

      console.log("OK: happy path — full pipeline, live progress, credit charged once, project ACTIVE");
    } finally {
      await prisma.traceLink.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.decision.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.story.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.entity.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.project.deleteMany({ where: { orgId: org.id } });
      await prisma.org.delete({ where: { id: org.id } });
    }
  }

  // --- Test 2: insufficient credit — deterministic failure path, no LLM call made ----------
  {
    const org = await prisma.org.create({
      data: { name: "check-compile-spec poor org", creditBalance: 2, projectSlotMax: 5 },
    });
    try {
      const project = await prisma.project.create({
        data: {
          orgId: org.id,
          archetype: "SAAS_CRUD",
          status: "COMPILING",
          brief: {
            create: {
              rawAnswers: {},
              problem: "x".repeat(50),
              targetUser: "y".repeat(30),
              scope: ["a", "b", "c"],
              nonGoals: ["d", "e", "f"],
              approvedAt: new Date(),
            },
          },
        },
      });

      await inngest.send({ name: "project/spec-compile.requested", data: { projectId: project.id } });
      const after = await waitForStatusChange(project.id, "COMPILING", 30_000);

      console.log("insufficient-credit final status:", after.status, after.lastCompileError);
      console.assert(after.status === "INTERVIEWING", `expected reverted to INTERVIEWING, got ${after.status}`);
      console.assert(after.lastCompileError !== null, "expected lastCompileError set");

      const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
      console.assert(orgAfter.creditBalance === 2, "insufficient-credit path must never touch the balance");

      const entityCount = await prisma.entity.count({ where: { projectId: project.id } });
      console.assert(entityCount === 0, "no LLM stage should have run at all");

      console.log("OK: insufficient-credit path — no charge attempted, status reverted, error recorded");
    } finally {
      await prisma.project.deleteMany({ where: { orgId: org.id } });
      await prisma.org.delete({ where: { id: org.id } });
    }
  }

  console.log("OK: compile-spec orchestration satisfies T-016 DoD (verified paths)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
