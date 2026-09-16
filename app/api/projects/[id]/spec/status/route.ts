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

  const project = await prisma.project.findUnique({
    where: { id },
    select: { orgId: true, status: true, lastCompileError: true },
  });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ status: project.status, lastCompileError: project.lastCompileError });
}
