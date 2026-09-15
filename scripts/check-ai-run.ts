import "dotenv/config";
import { z } from "zod";
import { prisma } from "../lib/db";
import { run, InsufficientCreditError } from "../lib/ai/run";

async function main() {
  const org = await prisma.org.create({
    data: { name: "check-ai-run test org", creditBalance: 5 },
  });

  try {
    // 1. simple schema succeeds, UsageLog written, credit deducted
    const schema = z.object({ greeting: z.string() });
    const result = await run({
      orgId: org.id,
      action: "SPLIT_TASK", // creditCost 1 in seeded CreditRule
      schema,
      system: "You reply only with JSON: {\"greeting\": string}. No prose.",
      user: "Say hello in one short word.",
    });

    console.assert(typeof result.greeting === "string", "expected greeting string");

    const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfter.creditBalance === 4, `expected creditBalance=4 after SPLIT_TASK, got ${orgAfter.creditBalance}`);

    const logs = await prisma.usageLog.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
    console.assert(logs.length >= 1, "expected at least one UsageLog row");
    console.assert(logs[logs.length - 1]?.succeeded === true, "expected last log to be succeeded=true");
    console.assert(logs[logs.length - 1]?.creditCost === 1, "expected logged creditCost=1");

    // 2. retry path: schema that the model's first JSON attempt won't satisfy
    //    (min length forces at least one validation failure + retry on a trivial prompt)
    const strictSchema = z.object({ n: z.number().int().min(1000) });
    await run({
      orgId: org.id,
      action: "PROMPT_PACKET", // creditCost 0, won't touch balance
      schema: strictSchema,
      system:
        'You reply only with JSON: {"n": number}. On your first reply always send {"n": 1}, deliberately wrong. Only after being told it is invalid, send {"n": 1234}.',
      user: "Give me n.",
      maxRetries: 2,
    });

    const logsAfterRetry = await prisma.usageLog.findMany({ where: { orgId: org.id } });
    console.assert(logsAfterRetry.some((l) => l.succeeded === false), "expected at least one failed attempt logged (retry path)");

    // 3. insufficient credit throws the typed error, not a generic one
    const poorOrg = await prisma.org.create({ data: { name: "poor org", creditBalance: 0 } });
    try {
      await run({ orgId: poorOrg.id, action: "SPLIT_TASK", schema, system: "x", user: "x" });
      console.assert(false, "expected InsufficientCreditError to throw");
    } catch (err) {
      console.assert(err instanceof InsufficientCreditError, "expected InsufficientCreditError type");
    } finally {
      await prisma.org.delete({ where: { id: poorOrg.id } });
    }

    console.log("OK: lib/ai/run.ts satisfies T-004 DoD");
  } finally {
    await prisma.usageLog.deleteMany({ where: { orgId: org.id } });
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
