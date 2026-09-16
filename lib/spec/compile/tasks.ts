import { z } from "zod";
import { prisma } from "@/lib/db";
import { run } from "@/lib/ai/run";
import { allocateRefIds } from "@/lib/spec/ref-counter";
import { assertTaskLimit } from "@/lib/spec/project-limits";
import type { BriefForCompile } from "./domain";

const MAX_TASKS = 60; // batas ukuran proyek (03-ai-pipeline.md pengaman biaya)

const taskSchema = z.object({
  localId: z.string().min(1),
  title: z.string().min(1),
  definitionOfDone: z.array(z.string().min(1)).min(2),
  allowedFiles: z.array(z.string().min(1)).min(1),
  forbiddenFiles: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
  storyRefs: z.array(z.string()).min(1),
});

const milestoneSchema = z.object({
  localId: z.string().min(1),
  title: z.string().min(1),
  tasks: z.array(taskSchema).min(1),
});

const tasksSchema = z.object({
  milestones: z.array(milestoneSchema).min(1).max(10),
});

function detectCycle(tasks: { localId: string; dependsOn: string[] }[]): string[] | null {
  const graph = new Map(tasks.map((t) => [t.localId, t.dependsOn]));
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    path.push(node);
    for (const dep of graph.get(node) ?? []) {
      const c = color.get(dep);
      if (c === GRAY) {
        const idx = path.indexOf(dep);
        return path.slice(idx).concat(dep);
      }
      if (c !== BLACK) {
        const result = dfs(dep);
        if (result) return result;
      }
    }
    path.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const t of tasks) {
    if (!color.has(t.localId)) {
      const cycle = dfs(t.localId);
      if (cycle) return cycle;
    }
  }
  return null;
}

function withValidation(knownStoryRefIds: Set<string>) {
  return tasksSchema.superRefine((data, ctx) => {
    const allTasks = data.milestones.flatMap((m) => m.tasks);

    if (allTasks.length > MAX_TASKS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `total tasks (${allTasks.length}) exceeds the project size limit of ${MAX_TASKS}`,
        path: ["milestones"],
      });
    }

    const localIds = allTasks.map((t) => t.localId);
    const seen = new Set<string>();
    for (const id of localIds) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate task localId "${id}" — every task's localId must be unique across the whole output`,
          path: ["milestones"],
        });
      }
      seen.add(id);
    }

    data.milestones.forEach((m, mi) => {
      m.tasks.forEach((t, ti) => {
        t.dependsOn.forEach((dep, di) => {
          if (!seen.has(dep) || dep === t.localId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `dependsOn[${di}] "${dep}" in task "${t.localId}" does not match any other task's localId in this output`,
              path: ["milestones", mi, "tasks", ti, "dependsOn", di],
            });
          }
        });
        t.storyRefs.forEach((refId, si) => {
          if (!knownStoryRefIds.has(refId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `storyRefs[${si}] "${refId}" in task "${t.localId}" does not match any known story refId`,
              path: ["milestones", mi, "tasks", ti, "storyRefs", si],
            });
          }
        });
      });
    });

    const cycle = detectCycle(allTasks);
    if (cycle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `dependsOn graph has a cycle: ${cycle.join(" -> ")}`,
        path: ["milestones"],
      });
    }
  });
}

// Stable, byte-identical across calls so DeepSeek's prompt cache actually hits (03-ai-pipeline.md).
const SYSTEM_PROMPT = `Kamu memecah spec produk SaaS CRUD (brief, domain model, user story, keputusan arsitektur) jadi milestone dan task untuk AI coding tool.

Balas HANYA JSON dengan bentuk persis:
{
  "milestones": [
    {
      "localId": string (unik dalam output ini, contoh "m1"),
      "title": string,
      "tasks": [
        {
          "localId": string (unik GLOBAL di seluruh output, contoh "m1-t1"),
          "title": string,
          "definitionOfDone": string[] (minimal 2, tiap butir harus bisa diverifikasi objektif),
          "allowedFiles": string[] (glob path yang boleh disentuh task ini, contoh "app/api/invoices/**"),
          "forbiddenFiles": string[] (glob path yang TIDAK boleh disentuh task ini),
          "dependsOn": string[] (localId task LAIN yang harus selesai duluan, boleh kosong),
          "storyRefs": string[] (refId story yang diimplementasi task ini, HARUS persis dari daftar story yang diberikan)
        }
      ]
    }
  ]
}

Aturan wajib:
- Hanya MILESTONE dan TASK, jangan buat STEP (STEP dipecah belakangan lewat fitur split, bukan di sini).
- "storyRefs" harus refId asli dari daftar story yang diberikan, jangan mengarang.
- "dependsOn" harus localId task lain di output ini (boleh beda milestone), jangan referensi diri sendiri, dan graf dependensi TIDAK BOLEH punya siklus.
- Maksimal 60 task total di seluruh milestone.
- allowedFiles/forbiddenFiles harus spesifik dan realistis untuk stack yang dipilih, bukan wildcard generik seperti "**/*".`;

export interface DecisionForCompile {
  choice: string;
  rationale: string;
}

export async function compileTasks(opts: {
  orgId: string;
  projectId: string;
  brief: BriefForCompile;
  decisions: DecisionForCompile[];
}) {
  const [entities, stories] = await Promise.all([
    prisma.entity.findMany({ where: { projectId: opts.projectId }, select: { refId: true, name: true, fields: true } }),
    prisma.story.findMany({
      where: { projectId: opts.projectId },
      select: { refId: true, narrative: true, entityRefs: true, acceptanceCriteria: true },
    }),
  ]);
  const knownStoryRefIds = new Set(stories.map((s) => s.refId));

  const output = await run({
    orgId: opts.orgId,
    projectId: opts.projectId,
    action: "GENERATE_TASKS",
    schema: withValidation(knownStoryRefIds),
    system: SYSTEM_PROMPT,
    user: `Brief:\n${JSON.stringify(opts.brief, null, 2)}\n\nEntitas:\n${JSON.stringify(entities, null, 2)}\n\nStory:\n${JSON.stringify(stories, null, 2)}\n\nKeputusan arsitektur:\n${JSON.stringify(opts.decisions, null, 2)}`,
  });

  const totalTasks = output.milestones.reduce((n, m) => n + m.tasks.length, 0);
  await assertTaskLimit(opts.projectId, totalTasks);

  const milestoneRefIds = await allocateRefIds(opts.projectId, "M", output.milestones.length);
  const taskRefIds = await allocateRefIds(opts.projectId, "T", totalTasks);

  const localIdToRefId = new Map<string, string>();
  let taskCursor = 0;
  for (const milestone of output.milestones) {
    for (const task of milestone.tasks) {
      localIdToRefId.set(task.localId, taskRefIds[taskCursor]);
      taskCursor++;
    }
  }

  const createdTasks: Awaited<ReturnType<typeof prisma.task.create>>[] = [];

  for (let mi = 0; mi < output.milestones.length; mi++) {
    const milestone = output.milestones[mi];
    const milestoneRow = await prisma.task.create({
      data: {
        projectId: opts.projectId,
        refId: milestoneRefIds[mi],
        level: "MILESTONE",
        title: milestone.title,
        definitionOfDone: [],
        storyRefs: [],
      },
    });

    for (const task of milestone.tasks) {
      const row = await prisma.task.create({
        data: {
          projectId: opts.projectId,
          refId: localIdToRefId.get(task.localId)!,
          parentId: milestoneRow.id,
          level: "TASK",
          title: task.title,
          definitionOfDone: task.definitionOfDone,
          allowedFiles: task.allowedFiles,
          forbiddenFiles: task.forbiddenFiles,
          dependsOn: task.dependsOn.map((dep) => localIdToRefId.get(dep)!),
          storyRefs: task.storyRefs,
        },
      });
      createdTasks.push(row);
    }
  }

  return createdTasks;
}
