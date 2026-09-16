import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { updateTaskStatus } from "@/lib/spec/task-status";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

const bodySchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "INVALIDATED"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id }, select: { project: { select: { orgId: true } } } });
  if (!task || task.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const updated = await updateTaskStatus(id, parsed.data.status);
  return NextResponse.json(updated);
}
