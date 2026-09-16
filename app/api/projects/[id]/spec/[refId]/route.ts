import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { artifactKindFromRefId } from "@/lib/spec/refine-artifact";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

const entityPatchSchema = z.object({
  fields: z.array(z.object({ name: z.string().min(1), type: z.string().min(1), required: z.boolean() })).min(1),
});
const storyPatchSchema = z.object({
  narrative: z.string().min(1).optional(),
  acceptanceCriteria: z.array(z.object({ given: z.string().min(1), when: z.string().min(1), then: z.string().min(1) })).min(1).optional(),
});
const decisionPatchSchema = z.object({
  choice: z.string().min(1).optional(),
  rationale: z.string().min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; refId: string }> }) {
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

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const kind = artifactKindFromRefId(refId);
  if (!kind) {
    return NextResponse.json({ error: `refId "${refId}" is not editable (expected E-/US-/ADR-)` }, { status: 400 });
  }

  const rawBody = await req.json();

  if (kind === "entity") {
    const parsed = entityPatchSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const entity = await prisma.entity.findFirstOrThrow({ where: { projectId: id, refId } });
    const updated = await prisma.entity.update({ where: { id: entity.id }, data: { fields: parsed.data.fields } });
    return NextResponse.json(updated);
  }

  if (kind === "decision") {
    const parsed = decisionPatchSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const decision = await prisma.decision.findFirstOrThrow({ where: { projectId: id, refId } });
    const updated = await prisma.decision.update({ where: { id: decision.id }, data: parsed.data });
    return NextResponse.json(updated);
  }

  // kind === "story"
  const parsed = storyPatchSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const story = await prisma.story.findFirstOrThrow({ where: { projectId: id, refId } });
  const updated = await prisma.story.update({
    where: { id: story.id },
    data: {
      ...(parsed.data.narrative !== undefined ? { narrative: parsed.data.narrative } : {}),
      ...(parsed.data.acceptanceCriteria !== undefined
        ? { acceptanceCriteria: parsed.data.acceptanceCriteria.map((ac, i) => ({ refId: `AC-${i + 1}`, ...ac })) }
        : {}),
    },
  });

  // US-006 AC2: editing a story flags every DONE task that implements it as needing review.
  const linkedTasks = await prisma.task.findMany({
    where: { projectId: id, level: { in: ["TASK", "STEP"] }, status: "DONE" },
  });
  const affected = linkedTasks.filter((t) => (t.storyRefs as string[]).includes(refId));
  if (affected.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: affected.map((t) => t.id) } },
      data: { status: "INVALIDATED" },
    });
  }

  return NextResponse.json({ ...updated, flaggedForReview: affected.map((t) => t.refId) });
}
