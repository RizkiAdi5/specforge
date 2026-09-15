import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

async function loadOwned(id: string, orgId: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { brief: true, assumptions: { orderBy: { refId: "asc" } } },
  });
  if (!project || project.orgId !== orgId) return null;
  return project;
}

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

  const project = await loadOwned(id, orgId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: project.status,
    brief: project.brief,
    assumptions: project.assumptions,
  });
}

const patchSchema = z.object({
  problem: z.string().min(1).optional(),
  targetUser: z.string().min(1).optional(),
  scope: z.array(z.string().min(1)).min(1).optional(),
  nonGoals: z.array(z.string().min(1)).min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await loadOwned(id, orgId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (project.brief?.approvedAt) {
    return NextResponse.json({ error: "brief already approved, locked" }, { status: 409 });
  }

  const brief = await prisma.brief.update({
    where: { projectId: id },
    data: parsed.data,
  });

  return NextResponse.json({ brief });
}
