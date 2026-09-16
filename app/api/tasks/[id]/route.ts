import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: { project: { select: { orgId: true } }, children: { orderBy: { refId: "asc" } } },
  });
  if (!task || task.project.orgId !== orgId) {
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
