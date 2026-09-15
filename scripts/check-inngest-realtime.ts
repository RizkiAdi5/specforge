import "dotenv/config";
import { subscribe } from "@inngest/realtime";
import { inngest } from "../lib/inngest/client";
import { dummyChannel } from "../lib/inngest/channels";

async function main() {
  const runId = `check-${Date.now()}`;

  const stream = await subscribe({
    app: inngest,
    channel: dummyChannel(runId),
    topics: ["progress"],
  });

  const received: unknown[] = [];
  const reader = stream.getReader();

  const readLoop = (async () => {
    while (received.length < 3) {
      const { value, done } = await reader.read();
      if (done) break;
      received.push(value);
      console.log("received:", JSON.stringify(value));
    }
  })();

  await fetch("http://localhost:3000/api/test-inngest/trigger", { method: "POST" }).then(() =>
    // override the random runId the trigger route picked by sending our own event directly
    inngest.send({ name: "dummy/run.requested", data: { runId } })
  );

  await Promise.race([readLoop, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout waiting for realtime messages")), 15000))]);

  console.assert(received.length === 3, `expected 3 progress messages, got ${received.length}`);
  console.log("OK: dummy job broadcasts 3 live progress steps over Inngest realtime");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
