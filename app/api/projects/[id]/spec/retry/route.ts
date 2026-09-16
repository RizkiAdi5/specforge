import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
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

  const project = await prisma.project.findUnique({ where: { id }, include: { brief: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (project.status !== "INTERVIEWING" || !project.brief?.approvedAt) {
    return NextResponse.json({ error: "no failed compile to retry" }, { status: 409 });
  }
  if (!project.lastCompileError) {
    return NextResponse.json({ error: "nothing failed, nothing to retry" }, { status: 409 });
  }

  await prisma.project.update({ where: { id }, data: { status: "COMPILING" } });
  await inngest.send({ name: "project/spec-compile.requested", data: { projectId: id } });

  return NextResponse.json({ queued: true }, { status: 202 });
}
