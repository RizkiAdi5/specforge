import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreatePromptPacket } from "@/lib/spec/prompt-packet";
import { getPendingAssumptions } from "@/lib/spec/assumption-gate";
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

  const task = await prisma.task.findUnique({ where: { id }, select: { project: { select: { orgId: true } } } });
  if (!task || task.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const pending = await getPendingAssumptions(id);
  if (pending.length > 0) {
    return NextResponse.json({ error: "pending assumptions", pendingAssumptions: pending }, { status: 409 });
  }

  const packet = await getOrCreatePromptPacket(id);
  return NextResponse.json(packet);
}
