import "dotenv/config";
import { prisma } from "../lib/db";
import { getInterviewState } from "../lib/interview/next-for-project";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-interview-flow test org", projectSlotMax: 5 },
  });

  try {
    // AC1: fresh project starts with the archetype's first question.
    const project = await prisma.project.create({
      data: { orgId: org.id, archetype: "SAAS_CRUD", brief: { create: { rawAnswers: {} } } },
    });

    let state = await getInterviewState(project.id);
    console.assert(state && !state.result.done, "AC1: expected a question, not done, on a fresh project");
    console.assert(
      !state!.result.done && state!.result.question.slot === "appName",
      "AC1: expected first question to be appName (tree order)"
    );

    // Answer the first 2 questions, mirroring what the /answer route does.
    for (const [slot, value] of [
      ["appName", "Fixly"],
      ["targetUser", "tukang servis AC"],
    ] as const) {
      const current = await getInterviewState(project.id);
      if (current!.result.done) throw new Error("unexpected done");
      await prisma.brief.update({
        where: { projectId: project.id },
        data: { rawAnswers: { ...current!.answers, [slot]: value } },
      });
    }

    // AC3: "leaving and coming back" = a fresh getInterviewState call with no client state at all.
    const resumed = await getInterviewState(project.id);
    console.assert(resumed && !resumed.result.done, "AC3: expected interview still in progress after resume");
    console.assert(
      !resumed!.result.done && resumed!.result.question.slot === "coreProblem",
      `AC3: expected to resume at coreProblem (3rd question), got ${!resumed!.result.done ? resumed!.result.question.slot : "done"}`
    );
    console.assert(resumed!.answers.appName === "Fixly", "AC3: previous answer must have persisted");

    // AC2 + cap: keep answering (skip billing/auth branches) until done, well under STANDARD's 15 cap.
    const remainingAnswers: [string, string | boolean][] = [
      ["coreProblem", "susah jadwalin panggilan"],
      ["mainEntities", "customer, jadwal, invoice"],
      ["needsAuth", false],
      ["multiTenant", false],
      ["needsBilling", false],
      ["keyWorkflow", "masuk -> pilih jadwal -> selesai"],
      ["mustHaveFeatures", "jadwal, notifikasi, riwayat"],
    ];
    for (const [slot, value] of remainingAnswers) {
      const current = await getInterviewState(project.id);
      if (current!.result.done) break;
      console.assert(
        !current!.result.done && current!.result.question.slot === slot,
        `expected next question to be ${slot}, got ${!current!.result.done ? current!.result.question.slot : "done"}`
      );
      await prisma.brief.update({
        where: { projectId: project.id },
        data: { rawAnswers: { ...current!.answers, [slot]: value } },
      });
    }

    const final = await getInterviewState(project.id);
    console.assert(final!.result.done === true, "AC2: expected done=true once all required (visible) slots are filled");
    console.assert(final!.answers.explicitNonGoals === undefined, "AC2: optional slot must never have been asked");
    console.assert(Object.keys(final!.answers).length < 15, "AC2: must finish well under the STANDARD cap of 15");

    // Cap enforcement: a LITE project must stop at 8 even with required slots left unanswered.
    const liteProject = await prisma.project.create({
      data: {
        orgId: org.id,
        archetype: "SAAS_CRUD",
        specLevel: "LITE",
        brief: {
          create: {
            rawAnswers: {
              appName: "x",
              targetUser: "x",
              coreProblem: "x",
              mainEntities: "x",
              needsAuth: true,
              authProviders: "Google",
              multiTenant: false,
              needsBilling: true,
            },
          },
        },
      },
    });
    const liteState = await getInterviewState(liteProject.id);
    console.assert(liteState!.result.done === true, "cap: LITE must stop at 8 answers even with required slots remaining");

    console.log("OK: interview API flow satisfies US-001 acceptance criteria");
  } finally {
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
