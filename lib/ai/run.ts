import type { z } from "zod";
import { prisma } from "@/lib/db";
import type { ActionType, ModelAlias } from "@/lib/generated/prisma/enums";
import { DeepSeekProvider, MODEL_MAP, estimateCostUsd } from "./provider";
import { selectKey } from "./select-key";

export class InsufficientCreditError extends Error {
  constructor(orgId: string, action: ActionType) {
    super(`org ${orgId} has insufficient credit for action ${action}`);
    this.name = "InsufficientCreditError";
  }
}

const provider = new DeepSeekProvider();

async function logUsage(opts: {
  orgId: string;
  projectId?: string;
  action: ActionType;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
  creditCost: number;
  succeeded: boolean;
}) {
  await prisma.usageLog.create({
    data: {
      orgId: opts.orgId,
      projectId: opts.projectId,
      actionType: opts.action,
      model: opts.model,
      tokenIn: opts.usage.promptTokens,
      tokenOut: opts.usage.completionTokens,
      costUsd: estimateCostUsd(opts.model, opts.usage),
      creditCost: opts.creditCost,
      succeeded: opts.succeeded,
    },
  });
}

export async function run<T>(opts: {
  orgId: string;
  projectId?: string;
  action: ActionType;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  model?: ModelAlias;
  maxRetries?: number;
}): Promise<T> {
  const { orgId, projectId, action, schema, system, maxRetries = 2 } = opts;

  const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
  const rule = await prisma.creditRule.findUniqueOrThrow({ where: { actionType: action } });
  const { apiKey, usingByok } = await selectKey(orgId);
  const creditCost = usingByok ? 0 : rule.creditCost;

  if (creditCost > org.creditBalance) {
    throw new InsufficientCreditError(orgId, action);
  }

  const modelAlias = opts.model ?? rule.model;
  const modelId = MODEL_MAP[modelAlias];

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userMessage = lastError
      ? `${opts.user}\n\n---\nJawaban sebelumnya tidak valid. Error: ${lastError}\nPerbaiki dan balas lagi HANYA dengan JSON yang valid sesuai schema.`
      : opts.user;

    let result: { content: string; usage: { promptTokens: number; completionTokens: number } };
    try {
      result = await provider.chat({ model: modelId, system, user: userMessage, apiKey });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await logUsage({ orgId, projectId, action, model: modelId, usage: { promptTokens: 0, completionTokens: 0 }, creditCost: 0, succeeded: false });
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(result.content);
    } catch {
      lastError = "Response bukan JSON yang valid";
      await logUsage({ orgId, projectId, action, model: modelId, usage: result.usage, creditCost: 0, succeeded: false });
      continue;
    }

    const validated = schema.safeParse(parsedJson);
    if (!validated.success) {
      lastError = validated.error.message;
      await logUsage({ orgId, projectId, action, model: modelId, usage: result.usage, creditCost: 0, succeeded: false });
      continue;
    }

    await logUsage({ orgId, projectId, action, model: modelId, usage: result.usage, creditCost, succeeded: true });
    if (creditCost > 0) {
      await prisma.org.update({ where: { id: orgId }, data: { creditBalance: { decrement: creditCost } } });
    }

    return validated.data;
  }

  throw new Error(`run() gagal setelah ${maxRetries} retry untuk action ${action}: ${lastError}`);
}
