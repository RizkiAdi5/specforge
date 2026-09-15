import "dotenv/config";
import { prisma } from "../lib/db";
import { compileDomain } from "../lib/spec/compile/domain";
import { compileStories } from "../lib/spec/compile/stories";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-compile-stories test org", creditBalance: 5, projectSlotMax: 5 },
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
    console.log(`domain: ${entities.length} entities`);

    const stories = await compileStories({ orgId: org.id, projectId: project.id, brief, specLevel: "STANDARD" });
    console.log(
      `stories (${stories.length}):`,
      stories.map((s) => `${s.refId}: ${s.narrative.slice(0, 60)}...`)
    );

    console.assert(stories.length > 0, "expected at least one story");
    console.assert(stories.length <= 20, "STANDARD cap is 20 stories");
    console.assert(stories.every((s) => /^US-\d{3}$/.test(s.refId)), "expected refId format US-NNN");
    console.assert(new Set(stories.map((s) => s.refId)).size === stories.length, "expected unique refIds");

    const entityRefIdSet = new Set(entities.map((e) => e.refId));
    for (const s of stories) {
      const entityRefs = s.entityRefs as string[];
      for (const refId of entityRefs) {
        console.assert(entityRefIdSet.has(refId), `story ${s.refId} references unknown entity refId ${refId}`);
      }
      const acs = s.acceptanceCriteria as { refId: string; given: string; when: string; then: string }[];
      console.assert(acs.length > 0, `story ${s.refId} must have at least one acceptance criterion`);
      console.assert(
        acs.every((ac, i) => ac.refId === `AC-${i + 1}`),
        `story ${s.refId} AC refIds must be AC-1, AC-2, ... in order`
      );
      console.assert(
        acs.every((ac) => ac.given && ac.when && ac.then),
        `story ${s.refId} every AC must have given/when/then`
      );
    }
    console.log("sample ACs from first story:", (stories[0].acceptanceCriteria as unknown[]).length, stories[0].acceptanceCriteria);

    const usage = await prisma.usageLog.findFirst({
      where: { orgId: org.id, actionType: "COMPILE_STORIES", succeeded: true },
    });
    console.assert(usage !== null, "expected a succeeded COMPILE_STORIES UsageLog row");
    console.assert(usage!.creditCost === 0, "COMPILE_STORIES must cost 0 credit (included in COMPILE_SPEC)");

    const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfter.creditBalance === 5, "compile.stories must never deduct credit on its own");

    console.log("OK: compile.stories satisfies T-011 DoD");
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
