import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreatePromptPacket } from "@/lib/spec/prompt-packet";

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const projectId = process.env.DEMO_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json({ error: "demo not configured" }, { status: 503 });
  }

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task || task.projectId !== projectId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const packet = await getOrCreatePromptPacket(taskId);
  return NextResponse.json(packet);
}
