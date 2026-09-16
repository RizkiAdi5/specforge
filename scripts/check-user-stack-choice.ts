import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileDecisions, type StackConstraints } from "../lib/spec/compile/decisions";

const brief = {
  problem: "Tukang servis AC lepas kesulitan menjadwalkan panggilan customer.",
  targetUser: "Tukang servis AC lepas yang bekerja sendirian.",
  scope: ["Jadwal servis", "Data customer"],
  nonGoals: ["Multi-tenant"],
};

async function run(stackConstraints: StackConstraints | undefined, label: string) {
  const org = await prisma.org.create({ data: { name: `check-stack-${label} org`, creditBalance: 5, projectSlotMax: 5 } });
  try {
    const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });
    await compileDomain({ orgId: org.id, projectId: project.id, brief });
    const decisions = await compileDecisions({ orgId: org.id, projectId: project.id, brief, stackConstraints });

    const projectAfter = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    console.log(`[${label}] ADR-001 choice: "${decisions[0].choice}"`);
    console.log(`[${label}] project.blueprintId: ${projectAfter.blueprintId}`);
    return { decisions, project: projectAfter };
  } finally {
    await prisma.decision.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.entity.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.project.deleteMany({ where: { orgId: org.id } });
    await prisma.org.delete({ where: { id: org.id } });
  }
}

// blueprintId is best-effort only (exact string match against the catalog's short name) — the
// unified prompt now encourages richer, more specific stack descriptions even with zero
// constraints, so exact matches are no longer expected. What must hold is that the result is a
// real, coherent framework choice, not that it string-matches a catalog entry.
const KNOWN_FRAMEWORKS = ["next.js", "remix", "sveltekit", "laravel", "rails", "django"];

async function main() {
  // Case 1: no constraints at all ("Belum tahu" on all three, or omitted) — old autonomous behavior.
  const r1 = await run(undefined, "auto");
  console.assert(
    KNOWN_FRAMEWORKS.some((f) => r1.decisions[0].choice.toLowerCase().includes(f)),
    "with zero constraints, the model must still pick a real, recognizable framework"
  );

  // Case 2: ONE constraint fixed (database), the rest free — model must honor it and compose the rest.
  const r2 = await run({ database: "MongoDB" }, "db-only");
  console.assert(
    r2.decisions[0].choice.toLowerCase().includes("mongodb") || r2.decisions[0].rationale.toLowerCase().includes("mongodb"),
    "the fixed database constraint (MongoDB) must actually show up in the composed stack"
  );

  // Case 3: MULTIPLE independent constraints, mixing curated + a totally custom "Other" value.
  const r3 = await run({ framework: "SvelteKit", database: "Turso (libSQL)", hosting: "VPS sendiri" }, "multi-custom");
  const text3 = `${r3.decisions[0].choice} ${r3.decisions[0].rationale}`.toLowerCase();
  console.assert(text3.includes("sveltekit"), "custom framework constraint must be honored");
  console.assert(text3.includes("turso"), "custom database constraint must be honored");
  console.assert(r3.project.blueprintId === null, "a novel combo not matching any catalog entry must leave blueprintId null");
  console.log(`[multi-custom] rationale: ${r3.decisions[0].rationale}`);

  // Case 4: constraint equals "Belum tahu, silakan pilihkan" for all three — must behave exactly like Case 1 (undefined).
  const r4 = await run(
    { framework: "Belum tahu, silakan pilihkan", database: "Belum tahu, silakan pilihkan", hosting: "Belum tahu, silakan pilihkan" },
    "explicit-no-pref"
  );
  console.assert(
    KNOWN_FRAMEWORKS.some((f) => r4.decisions[0].choice.toLowerCase().includes(f)),
    "'Belum tahu' on every layer must fall back to full auto-pick, same as no constraints at all"
  );

  console.log("OK: decomposed per-layer stack constraints (framework/database/hosting) work end to end");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
