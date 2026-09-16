import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

const progressEvent = z.object({
  step: z.number(),
  total: z.number(),
  label: z.string(),
  done: z.boolean(),
});

export const dummyChannel = channel((runId: string) => `dummy:${runId}`).addTopic(
  topic("progress").schema(progressEvent)
);

const compileSpecEvent = z.object({
  stage: z.enum(["domain", "stories", "decisions", "critic", "tasks", "tracelinks"]),
  stepIndex: z.number(),
  total: z.number(),
  status: z.enum(["running", "done", "failed"]),
  error: z.string().optional(),
});

export const compileSpecChannel = channel((projectId: string) => `compile-spec:${projectId}`).addTopic(
  topic("progress").schema(compileSpecEvent)
);
