import type { ProjectArchetype } from "@/lib/generated/prisma/enums";
import type { InterviewQuestion } from "./types";
import { saasCrudTree } from "./trees/saas-crud";

const TREES: Record<ProjectArchetype, InterviewQuestion[]> = {
  SAAS_CRUD: saasCrudTree,
};

export function getTree(archetype: ProjectArchetype): InterviewQuestion[] {
  return TREES[archetype];
}
