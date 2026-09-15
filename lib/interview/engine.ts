import type { SpecLevel } from "@/lib/generated/prisma/enums";
import type { InterviewAnswers, InterviewQuestion, InterviewResult } from "./types";

export const QUESTION_LIMIT: Record<SpecLevel, number> = {
  LITE: 8,
  STANDARD: 15,
  STRICT: Infinity,
};

/** Pure: given the tree, answers so far, and spec level, returns the next question or a done signal. */
export function getNextQuestion(
  tree: InterviewQuestion[],
  answers: InterviewAnswers,
  specLevel: SpecLevel
): InterviewResult {
  if (Object.keys(answers).length >= QUESTION_LIMIT[specLevel]) {
    return { done: true };
  }

  const visible = tree.filter((q) => !q.when || q.when(answers));
  const allRequiredAnswered = visible.every((q) => !q.required || q.slot in answers);
  if (allRequiredAnswered) {
    return { done: true };
  }

  const next = visible.find((q) => !(q.slot in answers));
  return { done: false, question: next! };
}
