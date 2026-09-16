import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { analyzePasteBack } from "@/lib/spec/paste-back";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";
import { insufficientCreditResponse } from "@/lib/ai/insufficient-credit-response";

const bodySchema = z.object({
  source: z.enum(["FILE_TREE", "FILE_CONTENT", "ERROR_MESSAGE"]),
  content: z.string().min(1),
});

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
    const codeState = await analyzePasteBack({
      orgId,
      projectId: id,
      source: parsed.data.source,
      rawContent: parsed.data.content,
    });
    return NextResponse.json(codeState);
  } catch (err) {
    return insufficientCreditResponse(err);
  }
}
