import { NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/lib/inngest/client";
import { compileSpecChannel } from "@/lib/inngest/channels";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db";

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

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const token = await getSubscriptionToken(inngest, {
    channel: compileSpecChannel(id),
    topics: ["progress"],
  });
  return NextResponse.json(token);
}
