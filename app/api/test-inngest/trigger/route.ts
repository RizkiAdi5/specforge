import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

export async function POST() {
  const runId = crypto.randomUUID();
  await inngest.send({ name: "dummy/run.requested", data: { runId } });
  return NextResponse.json({ runId });
}
