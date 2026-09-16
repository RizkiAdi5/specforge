import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), answer: z.string().min(1) }),
  z.object({ action: z.literal("reject"), answer: z.string().optional() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string; assumptionId: string }> }) {
  const { id: taskId, assumptionId } = await params;

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

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, project: { select: { orgId: true } } } });
  if (!task || task.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const assumption = await prisma.assumption.findUnique({ where: { id: assumptionId } });
  if (!assumption || assumption.projectId !== task.projectId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (assumption.status !== "OPEN") {
    return NextResponse.json({ error: `assumption is already ${assumption.status}` }, { status: 409 });
  }

  const updated = await prisma.assumption.update({
    where: { id: assumptionId },
    data: {
      status: parsed.data.action === "confirm" ? "CONFIRMED" : "REJECTED",
      answer: parsed.data.answer ?? null,
    },
  });

  // ponytail: REJECTED seharusnya otomatis memicu ChangeRequest (02-data-and-flows.md state
  // machine), tapi impact analyzer belum ada (T-027). Untuk sekarang assumption cuma ditandai
  // REJECTED tanpa efek lanjutan — sambungkan saat T-027 dikerjakan.

  return NextResponse.json(updated);
}
