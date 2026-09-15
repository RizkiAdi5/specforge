import { NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/lib/inngest/client";
import { dummyChannel } from "@/lib/inngest/channels";

export async function POST(req: Request) {
  const { runId } = await req.json();
  const token = await getSubscriptionToken(inngest, {
    channel: dummyChannel(runId),
    topics: ["progress"],
  });
  return NextResponse.json(token);
}
