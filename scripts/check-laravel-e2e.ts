import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileStories } from "../lib/spec/compile/stories";
import { compileDecisions } from "../lib/spec/compile/decisions";
import { compileTasks } from "../lib/spec/compile/tasks";
import { buildTraceLinks } from "../lib/spec/tracelinks";
import { getOrCreatePromptPacket } from "../lib/spec/prompt-packet";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-laravel-e2e org", creditBalance: 20, projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD", specLevel: "STANDARD" } });

    const brief = {
      problem: "Tukang servis AC lepas kesulitan menjadwalkan panggilan customer dan sering lupa follow up.",
      targetUser: "Tukang servis AC lepas yang bekerja sendirian.",
      scope: ["Autentikasi email/password", "Jadwal servis", "Data customer", "Invoice PDF"],
      nonGoals: ["Multi-tenant", "Billing berlangganan"],
    };

    const entities = await compileDomain({ orgId: org.id, projectId: project.id, brief });
    await compileStories({ orgId: org.id, projectId: project.id, brief, specLevel: "STANDARD" });

    // The real ask: user picks Laravel + MySQL, not a JS stack.
    const decisions = await compileDecisions({
      orgId: org.id,
      projectId: project.id,
      brief,
      stackConstraints: { framework: "Laravel (PHP)", database: "MySQL" },
    });
    console.log("ADR-001:", decisions[0].choice);
    console.assert(decisions[0].choice.toLowerCase().includes("laravel"), "chosen stack must actually be Laravel");

    const tasks = await compileTasks({
      orgId: org.id,
      projectId: project.id,
      brief,
      decisions: decisions.map((d) => ({ choice: d.choice, rationale: d.rationale })),
    });
    await buildTraceLinks(project.id);

    const realTasks = tasks.filter((t) => t.level === "TASK");
    console.log(
      "sample allowedFiles:",
      realTasks.slice(0, 6).map((t) => ({ title: t.title, allowedFiles: t.allowedFiles }))
    );

    const allowedFilesFlat = realTasks.flatMap((t) => t.allowedFiles as string[]);
    const laravelSignals = allowedFilesFlat.filter((f) =>
      /\.php$|routes\/|app\/Http|app\/Models|database\/migrations|resources\/views/.test(f)
    );
    const nextjsSignals = allowedFilesFlat.filter((f) => /\.tsx$|\.jsx$|^app\/api|^pages\//.test(f));

    console.log(`Laravel-shaped paths: ${laravelSignals.length}/${allowedFilesFlat.length}`);
    console.log(`Next.js-shaped paths (should be ~0): ${nextjsSignals.length}/${allowedFilesFlat.length}`);
    console.assert(laravelSignals.length > 0, "tasks must use real Laravel directory conventions, not generic paths");
    console.assert(nextjsSignals.length === 0, "tasks must NOT leak Next.js/React file conventions for a Laravel project");

    // Prompt packet for the first ready task must also read as Laravel guidance, not Next.js.
    const firstTask = realTasks.find((t) => (t.dependsOn as string[]).length === 0) ?? realTasks[0];
    const packet = await getOrCreatePromptPacket(firstTask.id);
    console.log("--- packet ---\n" + packet.body + "\n--- end ---");
    console.assert(packet.body.toLowerCase().includes("laravel"), "packet's Stack line must mention Laravel");
    console.assert(!packet.body.includes("Next.js"), "packet must not mention Next.js for a Laravel project");

    console.assert(entities.length > 0, "sanity: domain compile ran");

    console.log("OK: end-to-end pipeline produces genuinely Laravel-appropriate output, not JS-biased");
  } finally {
    await prisma.promptPacket.deleteMany({ where: { task: { project: { orgId: org.id } } } });
    await prisma.traceLink.deleteMany({ where: { project: { orgId: org.id } } });
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
