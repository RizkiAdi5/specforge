import { inngest } from "@/lib/inngest/client";
import { dummyChannel } from "@/lib/inngest/channels";

const STEPS = ["mempersiapkan", "memproses", "menyelesaikan"];

export const dummyJob = inngest.createFunction(
  { id: "dummy-job" },
  { event: "dummy/run.requested" },
  async ({ event, step, publish }) => {
    const { runId } = event.data;

    for (let i = 0; i < STEPS.length; i++) {
      await step.run(STEPS[i], async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });

      await publish(
        dummyChannel(runId).progress({
          step: i + 1,
          total: STEPS.length,
          label: STEPS[i],
          done: i === STEPS.length - 1,
        })
      );
    }

    return { runId, completedSteps: STEPS.length };
  }
);
