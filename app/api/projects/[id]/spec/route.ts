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

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [entities, stories, decisions, assumptions, traceLinks] = await Promise.all([
    prisma.entity.findMany({ where: { projectId: id }, orderBy: { refId: "asc" } }),
    prisma.story.findMany({ where: { projectId: id }, orderBy: { refId: "asc" } }),
    prisma.decision.findMany({ where: { projectId: id }, orderBy: { refId: "asc" } }),
    prisma.assumption.findMany({ where: { projectId: id }, orderBy: { refId: "asc" } }),
    prisma.traceLink.findMany({ where: { projectId: id } }),
  ]);

  return NextResponse.json({ entities, stories, decisions, assumptions, traceLinks });
}
