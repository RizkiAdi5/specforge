import { Prisma } from "@/lib/generated/prisma/client";
import { inngest } from "@/lib/inngest/client";
import { compileSpecChannel } from "@/lib/inngest/channels";
import { prisma } from "@/lib/db";
import { compileDomain } from "@/lib/spec/compile/domain";
import { compileStories } from "@/lib/spec/compile/stories";
import { compileDecisions } from "@/lib/spec/compile/decisions";
import { compileCritic } from "@/lib/spec/compile/critic";
import { compileTasks } from "@/lib/spec/compile/tasks";
import { buildTraceLinks } from "@/lib/spec/tracelinks";
import { selectKey } from "@/lib/ai/select-key";
import { assertRateLimit, assertCostCap, RateLimitError, CostCapError } from "@/lib/ai/limits";

const STAGES = ["domain", "stories", "decisions", "critic", "tasks", "tracelinks"] as const;

export const compileSpecJob = inngest.createFunction(
  { id: "compile-spec", retries: 0 },
  { event: "project/spec-compile.requested" },
  async ({ event, step, publish }) => {
    const { projectId } = event.data;
    const channel = compileSpecChannel(projectId);

    const project = await step.run("load-project", () =>
      prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { brief: true } })
    );
    const brief = {
      problem: project.brief!.problem!,
      targetUser: project.brief!.targetUser!,
      scope: project.brief!.scope,
      nonGoals: project.brief!.nonGoals,
    };

    const rule = await step.run("load-credit-rule", () =>
      prisma.creditRule.findUniqueOrThrow({ where: { actionType: "COMPILE_SPEC" } })
    );

    const org = await step.run("check-credit", () => prisma.org.findUniqueOrThrow({ where: { id: project.orgId } }));
    const { usingByok } = await step.run("select-key", () => selectKey(project.orgId));
    const chargeAmount = usingByok || org.isUnlimited ? 0 : rule.creditCost;

    if (chargeAmount > org.creditBalance) {
      await step.run("insufficient-credit-revert", () =>
        prisma.project.update({
          where: { id: projectId },
          data: { status: "INTERVIEWING", lastCompileError: { stage: "charge", message: "insufficient credit" } },
        })
      );
      return { projectId, aborted: "insufficient_credit" };
    }

    if (chargeAmount > 0) {
      try {
        await step.run("check-limits", async () => {
          await assertRateLimit(project.orgId);
          await assertCostCap(project.orgId);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stage = err instanceof RateLimitError ? "rate_limit" : err instanceof CostCapError ? "cost_cap" : "charge";
        await step.run("limit-revert", () =>
          prisma.project.update({
            where: { id: projectId },
            data: { status: "INTERVIEWING", lastCompileError: { stage, message } },
          })
        );
        return { projectId, aborted: stage };
      }
    }

    // Charged once up front for the whole pipeline — the 5 stages below all cost 0
    // individually (included in this charge), matching 03-ai-pipeline.md's Credit section.
    // Skipped entirely when a valid BYOK key covers this org (US-015 AC2).
    await step.run("charge-credit", () =>
      prisma.$transaction([
        ...(chargeAmount > 0
          ? [prisma.org.update({ where: { id: project.orgId }, data: { creditBalance: { decrement: chargeAmount } } })]
          : []),
        prisma.usageLog.create({
          data: {
            orgId: project.orgId,
            projectId,
            actionType: "COMPILE_SPEC",
            model: "n/a",
            creditCost: chargeAmount,
            succeeded: true,
          },
        }),
      ])
    );

    async function announce(stage: (typeof STAGES)[number], status: "running" | "done" | "failed", error?: string) {
      await publish(
        channel.progress({
          stage,
          stepIndex: STAGES.indexOf(stage) + 1,
          total: STAGES.length,
          status,
          error,
        })
      );
    }

    let currentStage: (typeof STAGES)[number] = "domain";

    try {
      currentStage = "domain";
      await announce("domain", "running");
      await step.run("compile-domain", () => compileDomain({ orgId: project.orgId, projectId, brief }));
      await announce("domain", "done");

      currentStage = "stories";
      await announce("stories", "running");
      await step.run("compile-stories", () =>
        compileStories({ orgId: project.orgId, projectId, brief, specLevel: project.specLevel })
      );
      await announce("stories", "done");

      currentStage = "decisions";
      await announce("decisions", "running");
      const decisions = await step.run("compile-decisions", () =>
        compileDecisions({ orgId: project.orgId, projectId, brief })
      );
      await announce("decisions", "done");

      currentStage = "critic";
      await announce("critic", "running");
      await step.run("compile-critic", () => compileCritic({ orgId: project.orgId, projectId, brief }));
      await announce("critic", "done");

      currentStage = "tasks";
      await announce("tasks", "running");
      await step.run("compile-tasks", () =>
        compileTasks({
          orgId: project.orgId,
          projectId,
          brief,
          decisions: decisions.map((d) => ({ choice: d.choice, rationale: d.rationale })),
        })
      );
      await announce("tasks", "done");

      currentStage = "tracelinks";
      await announce("tracelinks", "running");
      await step.run("build-tracelinks", () => buildTraceLinks(projectId));
      await announce("tracelinks", "done");

      await step.run("activate-project", () =>
        prisma.project.update({ where: { id: projectId }, data: { status: "ACTIVE", lastCompileError: Prisma.JsonNull } })
      );

      return { projectId, status: "ACTIVE" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await step.run("refund-and-revert", () =>
        prisma.$transaction([
          ...(chargeAmount > 0
            ? [prisma.org.update({ where: { id: project.orgId }, data: { creditBalance: { increment: chargeAmount } } })]
            : []),
          prisma.project.update({
            where: { id: projectId },
            data: {
              status: "INTERVIEWING",
              lastCompileError: { stage: currentStage, message, failedAt: new Date().toISOString() },
            },
          }),
        ])
      );

      await announce(currentStage, "failed", message);
      throw err;
    }
  }
);
