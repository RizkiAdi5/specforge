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
