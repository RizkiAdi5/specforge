import "dotenv/config";
import { z } from "zod";
import { prisma } from "../lib/db";
import { run } from "../lib/ai/run";
import { RateLimitError, CostCapError } from "../lib/ai/limits";
import { ProjectSizeLimitError, assertEntityLimit, assertTaskLimit } from "../lib/spec/project-limits";
import { insufficientCreditResponse } from "../lib/ai/insufficient-credit-response";

async function main() {
  // --- 1. Rate limit: 20 paid actions/hour, real run() calls against the real API ----------
  {
    const org = await prisma.org.create({ data: { name: "check-safeguards rate-limit org", creditBalance: 100 } });
    try {
      // seed 20 prior "paid" UsageLog rows directly (faster than 20 real calls, same effect
      // since assertRateLimit only counts rows, doesn't care how they got there).
      await prisma.usageLog.createMany({
        data: Array.from({ length: 20 }, () => ({
          orgId: org.id,
          actionType: "SPLIT_TASK" as const,
          model: "deepseek-chat",
          creditCost: 1,
          succeeded: true,
        })),
      });

      let caught: unknown = null;
      try {
        await run({
          orgId: org.id,
          action: "SPLIT_TASK",
          schema: z.object({ ok: z.boolean() }),
          system: 'Balas HANYA JSON: {"ok": true}',
          user: "ping",
        });
      } catch (err) {
        caught = err;
      }
      console.assert(caught instanceof RateLimitError, `expected RateLimitError after 20 prior paid actions, got ${caught}`);

      const res = insufficientCreditResponse(caught);
      const body = await res.json();
      console.log("rate limit response:", res.status, body);
      console.assert(res.status === 429, "rate limit must reject with 429, not 500");
      console.assert(typeof body.message === "string" && body.message.length > 0, "must explain why");

      const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
      console.assert(orgAfter.creditBalance === 100, "rate-limited call must never touch credit");

      console.log("OK: rate limit rejects with explanation, not 500");
    } finally {
      await prisma.usageLog.deleteMany({ where: { orgId: org.id } });
      await prisma.org.delete({ where: { id: org.id } });
    }
  }

  // --- 2. Cost cap: monthlyCostCapUsd already exceeded by prior spend ----------------------
  {
    const org = await prisma.org.create({
      data: { name: "check-safeguards cost-cap org", creditBalance: 100, monthlyCostCapUsd: 0.01 },
    });
    try {
      await prisma.usageLog.create({
        data: { orgId: org.id, actionType: "SPLIT_TASK", model: "deepseek-chat", creditCost: 1, costUsd: 0.02, succeeded: true },
      });

      let caught: unknown = null;
      try {
        await run({
          orgId: org.id,
          action: "SPLIT_TASK",
          schema: z.object({ ok: z.boolean() }),
          system: 'Balas HANYA JSON: {"ok": true}',
          user: "ping",
        });
      } catch (err) {
        caught = err;
      }
      console.assert(caught instanceof CostCapError, `expected CostCapError once monthly spend exceeds cap, got ${caught}`);

      const res = insufficientCreditResponse(caught);
      const body = await res.json();
      console.log("cost cap response:", res.status, body);
      console.assert(res.status === 402, "cost cap must reject cleanly, not 500");

      console.log("OK: cost cap rejects with explanation, not 500");
    } finally {
      await prisma.usageLog.deleteMany({ where: { orgId: org.id } });
      await prisma.org.delete({ where: { id: org.id } });
    }

    // sanity: cap=0 (default/unset) must NOT block anything.
    const orgNoCap = await prisma.org.create({ data: { name: "check-safeguards no-cap org", creditBalance: 5 } });
    try {
      const result = await run({
        orgId: orgNoCap.id,
        action: "SPLIT_TASK",
        schema: z.object({ ok: z.boolean() }),
        system: 'Balas HANYA JSON: {"ok": true}',
        user: "ping",
      });
      console.assert(result.ok === true, "org with no cost cap configured must not be blocked");
      console.log("OK: unset cost cap (0) does not block");
    } finally {
      await prisma.usageLog.deleteMany({ where: { orgId: orgNoCap.id } });
      await prisma.org.delete({ where: { id: orgNoCap.id } });
    }
  }

  // --- 3. Project size limits: 30 entities / 60 tasks -------------------------------------
  {
    const org = await prisma.org.create({ data: { name: "check-safeguards size-limit org", projectSlotMax: 5 } });
    try {
      const project = await prisma.project.create({ data: { orgId: org.id, archetype: "SAAS_CRUD" } });

      await prisma.entity.createMany({
        data: Array.from({ length: 29 }, (_, i) => ({
          projectId: project.id,
          refId: `E-${String(i + 1).padStart(3, "0")}`,
          name: `Entity${i}`,
          fields: [{ name: "x", type: "string", required: true }],
        })),
      });

      let caught: unknown = null;
      try {
        await assertEntityLimit(project.id, 2); // 29 + 2 = 31 > 30
      } catch (err) {
        caught = err;
      }
      console.assert(caught instanceof ProjectSizeLimitError, "expected ProjectSizeLimitError when exceeding 30 entities");
      console.log("entity limit message:", (caught as Error).message);

      // right at the boundary must NOT throw.
      await assertEntityLimit(project.id, 1); // 29 + 1 = 30, exactly at cap

      const milestone = await prisma.task.create({ data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "x" } });
      await prisma.task.createMany({
        data: Array.from({ length: 59 }, (_, i) => ({
          projectId: project.id,
          parentId: milestone.id,
          refId: `T-${String(i + 1).padStart(3, "0")}`,
          level: "TASK" as const,
          title: `Task ${i}`,
          definitionOfDone: ["a", "b"],
          allowedFiles: ["**"],
        })),
      });

      let taskCaught: unknown = null;
      try {
        await assertTaskLimit(project.id, 2); // 59 + 2 = 61 > 60
      } catch (err) {
        taskCaught = err;
      }
      console.assert(taskCaught instanceof ProjectSizeLimitError, "expected ProjectSizeLimitError when exceeding 60 tasks");
      console.log("task limit message:", (taskCaught as Error).message);

      await assertTaskLimit(project.id, 1); // 59 + 1 = 60, exactly at cap, must not throw

      const res = insufficientCreditResponse(taskCaught);
      const body = await res.json();
      console.log("project size limit response:", res.status, body);
      console.assert(res.status === 409, "project size limit must reject cleanly, not 500");

      console.log("OK: project size limits reject with explanation at the exact boundary, not 500");
    } finally {
      await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.entity.deleteMany({ where: { project: { orgId: org.id } } });
      await prisma.project.deleteMany({ where: { orgId: org.id } });
      await prisma.org.delete({ where: { id: org.id } });
    }
  }

  console.log("OK: all three safeguards satisfy T-025 DoD");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
