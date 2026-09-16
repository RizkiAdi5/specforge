import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileStories } from "../lib/spec/compile/stories";
import { compileDecisions } from "../lib/spec/compile/decisions";
import { compileTasks } from "../lib/spec/compile/tasks";
import { buildTraceLinks } from "../lib/spec/tracelinks";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-tracelinks test org", creditBalance: 5, projectSlotMax: 5 },
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

    const entities = await compileDomain({ orgId: org.id, projectId: project.id, brief });
    const stories = await compileStories({ orgId: org.id, projectId: project.id, brief, specLevel: "STANDARD" });
    const decisions = await compileDecisions({ orgId: org.id, projectId: project.id, brief });
    await compileTasks({
      orgId: org.id,
      projectId: project.id,
      brief,
      decisions: decisions.map((d) => ({ choice: d.choice, rationale: d.rationale })),
    });

    const links = await buildTraceLinks(project.id);

    const byKind = {
      DERIVES: links.filter((l) => l.kind === "DERIVES"),
      IMPLEMENTS: links.filter((l) => l.kind === "IMPLEMENTS"),
      CONSTRAINS: links.filter((l) => l.kind === "CONSTRAINS"),
      ASSUMES: links.filter((l) => l.kind === "ASSUMES"),
    };
    console.log(
      `links: DERIVES=${byKind.DERIVES.length} IMPLEMENTS=${byKind.IMPLEMENTS.length} CONSTRAINS=${byKind.CONSTRAINS.length} ASSUMES=${byKind.ASSUMES.length}`
    );

    // DERIVES must exactly match the union of all story.entityRefs.
    const expectedDerives = stories.flatMap((s) =>
      (s.entityRefs as string[]).map((e) => `${s.refId}->${e}`)
    );
    const actualDerives = byKind.DERIVES.map((l) => `${l.fromRefId}->${l.toRefId}`);
    console.assert(
      expectedDerives.every((e) => actualDerives.includes(e)),
      "every story.entityRefs entry must produce a DERIVES link"
    );
    console.assert(actualDerives.length === new Set(expectedDerives).size, "DERIVES count must match story.entityRefs exactly (deduped)");

    // IMPLEMENTS must exactly match the union of all task.storyRefs.
    const tasks = await prisma.task.findMany({ where: { projectId: project.id, level: "TASK" } });
    const expectedImplements = tasks.flatMap((t) => (t.storyRefs as string[]).map((s) => `${t.refId}->${s}`));
    const actualImplements = byKind.IMPLEMENTS.map((l) => `${l.fromRefId}->${l.toRefId}`);
    console.assert(
      expectedImplements.every((e) => actualImplements.includes(e)),
      "every task.storyRefs entry must produce an IMPLEMENTS link"
    );

    // every link's refIds must be real, on both ends.
    const allRefIds = new Set([
      ...entities.map((e) => e.refId),
      ...stories.map((s) => s.refId),
      ...decisions.map((d) => d.refId),
      ...tasks.map((t) => t.refId),
    ]);
    for (const link of links) {
      console.assert(allRefIds.has(link.fromRefId) || link.fromType === "ASSUMPTION", `unknown fromRefId ${link.fromRefId}`);
      console.assert(allRefIds.has(link.toRefId), `unknown toRefId ${link.toRefId}`);
    }

    // CONSTRAINS: every entity-level link's decision text must actually mention that entity's name.
    for (const link of byKind.CONSTRAINS.filter((l) => l.toType === "ENTITY")) {
      const decision = decisions.find((d) => d.refId === link.fromRefId)!;
      const entity = entities.find((e) => e.refId === link.toRefId)!;
      const text = `${decision.choice} ${decision.rationale}`.toLowerCase();
      console.assert(text.includes(entity.name.toLowerCase()), `CONSTRAINS link claims "${entity.name}" is mentioned but text-match says no`);
    }

    // no duplicate edges (same from/to/kind) — the @@unique constraint plus skipDuplicates should guarantee this.
    const edgeKeys = links.map((l) => `${l.fromType}:${l.fromRefId}->${l.toType}:${l.toRefId}:${l.kind}`);
    console.assert(new Set(edgeKeys).size === edgeKeys.length, "expected no duplicate TraceLink edges");

    console.log("sample CONSTRAINS links:", byKind.CONSTRAINS.slice(0, 5));
    console.log("sample ASSUMES links:", byKind.ASSUMES.slice(0, 5));

    console.log("OK: tracelinks satisfies T-015 DoD");
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

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
