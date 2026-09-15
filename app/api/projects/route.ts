import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

const bodySchema = z.object({
  archetype: z.enum(["SAAS_CRUD"]),
});

export async function POST(req: Request) {
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

  const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
  const activeProjectCount = await prisma.project.count({
    where: { orgId, status: { not: "ARCHIVED" } },
  });
  if (activeProjectCount >= org.projectSlotMax) {
    return NextResponse.json({ error: "project slot limit reached" }, { status: 402 });
  }

  const project = await prisma.project.create({
    data: {
      orgId,
      archetype: parsed.data.archetype,
      brief: { create: { rawAnswers: {} } },
    },
  });

  return NextResponse.json({ id: project.id });
}
