import "dotenv/config";
import { subscribe } from "@inngest/realtime";
import { prisma } from "../lib/db";
import { inngest } from "../lib/inngest/client";
import { compileSpecChannel } from "../lib/inngest/channels";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-compile-spec realtime org", creditBalance: 20, projectSlotMax: 5 },
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

    const stream = await subscribe({
      app: inngest,
      channel: compileSpecChannel(project.id),
      topics: ["progress"],
    });
    const reader = stream.getReader();
    const received: unknown[] = [];

    const readLoop = (async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received.push(value);
        console.log("event:", JSON.stringify((value as { data: unknown }).data));
        if ((value as { data: { stage: string; status: string } }).data.stage === "tracelinks" && (value as { data: { status: string } }).data.status === "done") {
          break;
        }
      }
    })();

    await inngest.send({ name: "project/spec-compile.requested", data: { projectId: project.id } });

    await Promise.race([
      readLoop,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout waiting for realtime events")), 120_000)),
    ]);

    const stages = received.map((e) => (e as { data: { stage: string; status: string } }).data);
    const runningEvents = stages.filter((s) => s.status === "running");
    const doneEvents = stages.filter((s) => s.status === "done");

    console.assert(runningEvents.length === 6, `expected 6 "running" events (one per stage), got ${runningEvents.length}`);
    console.assert(doneEvents.length === 6, `expected 6 "done" events, got ${doneEvents.length}`);
    console.assert(
      JSON.stringify(runningEvents.map((s) => s.stage)) ===
        JSON.stringify(["domain", "stories", "decisions", "critic", "tasks", "tracelinks"]),
      "expected stages to run in exact pipeline order"
    );

    console.log(`OK: live progress stream delivered ${received.length} events across all 6 stages, in order`);
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
