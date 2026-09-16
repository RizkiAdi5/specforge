import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileCritic } from "../lib/spec/compile/critic";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-compile-critic test org", creditBalance: 5, projectSlotMax: 5 },
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
      nonGoals: ["Billing/langganan", "Aplikasi mobile native"],
    };

    const entities = await compileDomain({ orgId: org.id, projectId: project.id, brief });

    // Deliberately flawed story: one vague, unverifiable AC (the exact pattern the doc calls out)
    // planted alongside one legitimate AC, to prove the critic actually catches it rather than
    // trivially passing on an already-clean spec.
    const story = await prisma.story.create({
      data: {
        projectId: project.id,
        refId: "US-001",
        narrative: "Sebagai tukang, saya bisa membuat jadwal servis baru.",
        entityRefs: [entities[0].refId],
        acceptanceCriteria: [
          { refId: "AC-1", given: "saya sudah login", when: "saya isi form jadwal baru dan submit", then: "jadwal tersimpan dan muncul di kalender" },
          { refId: "AC-2", given: "saya membuka halaman jadwal", when: "saya melihat tampilannya", then: "tampilan berjalan dengan baik dan user merasa nyaman" },
        ],
      },
    });

    const critic = await compileCritic({ orgId: org.id, projectId: project.id, brief });

    console.log("unmeasurable:", critic.unmeasurable);
    console.log("contradictions:", critic.contradictions);
    console.log("unboundedScope:", critic.unboundedScope);
    console.log("missingNonGoals:", critic.missingNonGoals);

    console.assert(
      critic.unmeasurable.some((u) => u.refId === `${story.refId}/AC-2`),
      "expected critic to flag the deliberately vague AC-2 as unmeasurable"
    );
    console.assert(
      !critic.unmeasurable.some((u) => u.refId === `${story.refId}/AC-1`),
      "expected critic NOT to flag the legitimately measurable AC-1"
    );

    // every cited refId (across all four categories that carry one) must be real, never hallucinated.
    const knownRefIds = new Set([...entities.map((e) => e.refId), story.refId, `${story.refId}/AC-1`, `${story.refId}/AC-2`]);
    for (const c of critic.contradictions) {
      for (const r of c.refIds) {
        console.assert(knownRefIds.has(r), `contradiction cites unknown refId ${r}`);
      }
    }

    const projectAfter = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    console.assert(projectAfter.criticFindings !== null, "expected criticFindings persisted on Project");
    assert.deepEqual(projectAfter.criticFindings, critic, "persisted criticFindings must match returned output exactly (no silent mutation/auto-fix)");

    // critic must never mutate the story it found the problem in — auto-fix is explicitly forbidden.
    const storyAfter = await prisma.story.findUniqueOrThrow({ where: { id: story.id } });
    assert.deepEqual(storyAfter.acceptanceCriteria, story.acceptanceCriteria, "critic must never auto-fix the flagged story");

    const usage = await prisma.usageLog.findFirst({
      where: { orgId: org.id, actionType: "CRITIC_PASS", succeeded: true },
    });
    console.assert(usage !== null, "expected a succeeded CRITIC_PASS UsageLog row");
    console.assert(usage!.model === "deepseek-reasoner", `expected thinking-mode model, got ${usage!.model}`);
    console.assert(usage!.creditCost === 0, "CRITIC_PASS must cost 0 credit (included in COMPILE_SPEC)");

    console.log("OK: compile.critic satisfies T-013 DoD");
  } finally {
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
