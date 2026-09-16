import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyImpactedArtifacts } from "@/lib/spec/change-request/regenerate";
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

  const change = await prisma.changeRequest.findUnique({ where: { id }, include: { project: { select: { orgId: true } } } });
  if (!change || change.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (change.status !== "AWAITING_APPROVAL") {
    return NextResponse.json({ error: `change request is ${change.status}, not AWAITING_APPROVAL` }, { status: 409 });
  }

  try {
    const result = await applyImpactedArtifacts({
      orgId,
      projectId: change.projectId,
      impactSet: change.impactSet as string[],
      description: change.description,
    });
    const updated = await prisma.changeRequest.update({ where: { id }, data: { status: "APPLIED" } });
    return NextResponse.json({ ...updated, ...result });
  } catch (err) {
    return insufficientCreditResponse(err);
  }
}
