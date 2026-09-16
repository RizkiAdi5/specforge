import "dotenv/config";
import { prisma } from "../lib/db";
import type { ActionType, ModelAlias } from "../lib/generated/prisma/enums";

const CREDIT_RULES: Record<ActionType, { creditCost: number; model: ModelAlias }> = {
  INTERVIEW: { creditCost: 0, model: "FLASH" },
  COMPILE_BRIEF: { creditCost: 0, model: "FLASH" },
  COMPILE_SPEC: { creditCost: 10, model: "FLASH" },
  COMPILE_DOMAIN: { creditCost: 0, model: "FLASH" },
  COMPILE_STORIES: { creditCost: 0, model: "FLASH" },
  COMPILE_DECISIONS: { creditCost: 0, model: "FLASH_THINKING" },
  CRITIC_PASS: { creditCost: 0, model: "FLASH_THINKING" },
  GENERATE_TASKS: { creditCost: 0, model: "FLASH" },
  SPLIT_TASK: { creditCost: 1, model: "FLASH" },
  PROMPT_PACKET: { creditCost: 0, model: "FLASH" },
  PASTE_BACK: { creditCost: 0, model: "FLASH" },
  REFINE_SECTION: { creditCost: 1, model: "FLASH" },
  CHANGE_REQUEST: { creditCost: 3, model: "FLASH_THINKING" },
  REGENERATE_ARTIFACT: { creditCost: 0, model: "FLASH" },
};

async function main() {
  for (const [actionType, rule] of Object.entries(CREDIT_RULES) as [ActionType, typeof CREDIT_RULES[ActionType]][]) {
    await prisma.creditRule.upsert({
      where: { actionType },
      create: { actionType, ...rule },
      update: rule,
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
