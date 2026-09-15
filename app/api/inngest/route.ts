import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { dummyJob } from "@/lib/inngest/functions/dummy";
import { compileBriefJob } from "@/lib/inngest/functions/compile-brief";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dummyJob, compileBriefJob],
});
