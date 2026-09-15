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
  if (project.status !== "INTERVIEWING") {
    return NextResponse.json({ error: `project is ${project.status}, not INTERVIEWING` }, { status: 409 });
  }
  if (!project.brief?.problem) {
    return NextResponse.json({ error: "brief has not been compiled yet" }, { status: 409 });
  }
  if (project.brief.approvedAt) {
    return NextResponse.json({ error: "brief already approved" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.brief.update({ where: { projectId: id }, data: { approvedAt: new Date() } }),
    prisma.project.update({ where: { id }, data: { status: "COMPILING" } }),
  ]);

  await inngest.send({ name: "project/spec-compile.requested", data: { projectId: id } });

  return NextResponse.json({ approved: true });
}
