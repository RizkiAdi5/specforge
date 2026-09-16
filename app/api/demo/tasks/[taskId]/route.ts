import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const projectId = process.env.DEMO_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json({ error: "demo not configured" }, { status: 503 });
  }

  // Anonymous route — the one place with zero auth. This check is what keeps it scoped
  // to exactly the demo project's own tasks, never anything from a real org.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { children: { orderBy: { refId: "asc" } } },
  });
  if (!task || task.projectId !== projectId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: task.id,
    refId: task.refId,
    title: task.title,
    status: task.status,
    level: task.level,
    definitionOfDone: task.definitionOfDone,
    steps: task.children.map((c) => ({ id: c.id, refId: c.refId, title: c.title, status: c.status })),
  });
}
