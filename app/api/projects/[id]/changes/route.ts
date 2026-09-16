import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { analyzeChangeRequest } from "@/lib/spec/change-request/analyze";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";
import { insufficientCreditResponse } from "@/lib/ai/insufficient-credit-response";

const bodySchema = z.object({ description: z.string().min(1) });

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

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const changes = await prisma.changeRequest.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ changes });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const { changeRequest, summary } = await analyzeChangeRequest({
      orgId,
      projectId: id,
      description: parsed.data.description,
    });
    return NextResponse.json({ ...changeRequest, summary });
  } catch (err) {
    return insufficientCreditResponse(err);
  }
}
