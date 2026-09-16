import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { splitTask } from "@/lib/spec/split-task";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";
import { insufficientCreditResponse } from "@/lib/ai/insufficient-credit-response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const task = await prisma.task.findUnique({ where: { id }, select: { level: true, project: { select: { orgId: true } } } });
  if (!task || task.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (task.level !== "TASK") {
    return NextResponse.json({ error: `only level=TASK can be split, got ${task.level}` }, { status: 409 });
  }

  try {
    const steps = await splitTask(id);
    return NextResponse.json({ steps });
  } catch (err) {
    return insufficientCreditResponse(err);
  }
}
