import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileStories } from "../lib/spec/compile/stories";
import { compileDecisions } from "../lib/spec/compile/decisions";
import { compileTasks } from "../lib/spec/compile/tasks";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-compile-tasks test org", creditBalance: 5, projectSlotMax: 5 },
  });

  try {
    const project = await prisma.project.create({
      data: { orgId: org.id, archetype: "SAAS_CRUD", specLevel: "STANDARD" },
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
    await compileStories({ orgId: org.id, projectId: project.id, brief, specLevel: "STANDARD" });
    const decisions = await compileDecisions({ orgId: org.id, projectId: project.id, brief });

    const tasks = await compileTasks({
      orgId: org.id,
      projectId: project.id,
      brief,
      decisions: decisions.map((d) => ({ choice: d.choice, rationale: d.rationale })),
    });

    const milestones = await prisma.task.findMany({ where: { projectId: project.id, level: "MILESTONE" } });
    console.log(`milestones (${milestones.length}):`, milestones.map((m) => `${m.refId}: ${m.title}`));
    console.log(`tasks (${tasks.length}):`, tasks.map((t) => `${t.refId} [${t.parentId ? "child" : "orphan"}]: ${t.title}`));

    console.assert(milestones.length > 0, "expected at least one milestone");
    console.assert(tasks.length > 0, "expected at least one task");
    console.assert(tasks.length <= 60, "must respect the 60-task project size cap");
    console.assert(milestones.every((m) => /^M-\d{3}$/.test(m.refId)), "expected milestone refId format M-NNN");
    console.assert(tasks.every((t) => /^T-\d{3}$/.test(t.refId)), "expected task refId format T-NNN");
    console.assert(tasks.every((t) => t.parentId !== null), "every task must have a milestone parent");
    console.assert(
      tasks.every((t) => milestones.some((m) => m.id === t.parentId)),
      "every task's parentId must point to a real persisted milestone"
    );

    const allRefIds = new Set([...milestones.map((m) => m.refId), ...tasks.map((t) => t.refId)]);
    console.assert(allRefIds.size === milestones.length + tasks.length, "all refIds must be unique");

    const taskRefIdSet = new Set(tasks.map((t) => t.refId));
    for (const t of tasks) {
      const dod = t.definitionOfDone as string[];
      console.assert(dod.length >= 2, `task ${t.refId} must have at least 2 definitionOfDone items`);
      const allowedFiles = t.allowedFiles as string[];
      console.assert(allowedFiles.length >= 1, `task ${t.refId} must have at least 1 allowedFiles glob`);
      const dependsOn = t.dependsOn as string[];
      for (const dep of dependsOn) {
        console.assert(taskRefIdSet.has(dep), `task ${t.refId} dependsOn unknown refId ${dep}`);
      }
      const storyRefs = t.storyRefs as string[];
      console.assert(storyRefs.length >= 1, `task ${t.refId} must implement at least one story`);
    }

    // acyclic check on the PERSISTED graph (refId-based), independent of the compile-time check.
    const graph = new Map(tasks.map((t) => [t.refId, t.dependsOn as string[]]));
    function hasCycleFrom(start: string): boolean {
      const stack = [start];
      const visiting = new Set<string>();
      function dfs(node: string, path: Set<string>): boolean {
        if (path.has(node)) return true;
        const next = graph.get(node) ?? [];
        const nextPath = new Set(path).add(node);
        return next.some((n) => dfs(n, nextPath));
      }
      return dfs(start, new Set());
    }
    console.assert(!tasks.some((t) => hasCycleFrom(t.refId)), "persisted dependsOn graph must be acyclic");

    const usage = await prisma.usageLog.findFirst({
      where: { orgId: org.id, actionType: "GENERATE_TASKS", succeeded: true },
    });
    console.assert(usage !== null, "expected a succeeded GENERATE_TASKS UsageLog row");
    console.assert(usage!.creditCost === 0, "GENERATE_TASKS must cost 0 credit (included in COMPILE_SPEC)");

    console.log("OK: compile.tasks satisfies T-014 DoD");
  } finally {
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
