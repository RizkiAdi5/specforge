import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

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

  const change = await prisma.changeRequest.findUnique({ where: { id }, include: { project: { select: { orgId: true } } } });
  if (!change || change.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (change.status !== "AWAITING_APPROVAL") {
    return NextResponse.json({ error: `change request is ${change.status}, not AWAITING_APPROVAL` }, { status: 409 });
  }

  // Credit for the analysis was already spent and is never refunded on discard (US-012 AC3).
  const updated = await prisma.changeRequest.update({ where: { id }, data: { status: "DISCARDED" } });
  return NextResponse.json(updated);
}
