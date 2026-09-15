import { prisma } from "@/lib/db";
import { getNextQuestion, QUESTION_LIMIT } from "./engine";
import { getTree } from "./get-tree";
import type { InterviewAnswers } from "./types";

export async function getInterviewState(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brief: true },
  });
  if (!project) return null;

  const answers = (project.brief?.rawAnswers ?? {}) as InterviewAnswers;
  const tree = getTree(project.archetype);
  const result = getNextQuestion(tree, answers, project.specLevel);
  const limit = QUESTION_LIMIT[project.specLevel];

  return { project, answers, result, limit };
}
