import { Inngest, EventSchemas } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

type Events = {
  "dummy/run.requested": { data: { runId: string } };
  "project/brief-compile.requested": { data: { projectId: string } };
  "project/spec-compile.requested": { data: { projectId: string } };
};

export const inngest = new Inngest({
  id: "specforge",
  schemas: new EventSchemas().fromRecord<Events>(),
  middleware: [realtimeMiddleware()],
});
