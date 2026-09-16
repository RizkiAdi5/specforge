import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { regenerateByRefId, artifactKindFromRefId } from "@/lib/spec/refine-artifact";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";
import { insufficientCreditResponse } from "@/lib/ai/insufficient-credit-response";

const bodySchema = z.object({ instruction: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; refId: string }> }) {
  const { id, refId } = await params;

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

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!artifactKindFromRefId(refId)) {
    return NextResponse.json({ error: `refId "${refId}" is not refinable (expected E-/US-/ADR-)` }, { status: 400 });
  }

  try {
    const updated = await regenerateByRefId({
      orgId,
      projectId: id,
      refId,
      instruction: parsed.data.instruction,
      action: "REFINE_SECTION",
    });
    return NextResponse.json(updated);
  } catch (err) {
    return insufficientCreditResponse(err);
  }
}
