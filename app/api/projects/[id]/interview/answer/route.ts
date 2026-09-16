import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getInterviewState } from "@/lib/interview/next-for-project";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";
import type { InterviewQuestion } from "@/lib/interview/types";

const bodySchema = z.object({
  slot: z.string().min(1),
  value: z.union([z.string(), z.boolean()]),
});

function validateValue(question: InterviewQuestion, value: string | boolean): string | null {
  if (question.type === "boolean") {
    return typeof value === "boolean" ? null : "expected boolean value";
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return "expected non-empty string value";
  }
  if (question.type === "single-select" && !question.allowOther && !question.options?.includes(value)) {
    return `value must be one of: ${question.options?.join(", ")}`;
  }
  return null;
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

  const state = await getInterviewState(id);
  if (!state || state.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (state.result.done) {
    return NextResponse.json({ error: "interview already complete" }, { status: 409 });
  }

  const expected = state.result.question;
  if (parsed.data.slot !== expected.slot) {
    return NextResponse.json({ error: `expected an answer for slot "${expected.slot}"` }, { status: 400 });
  }

  const valueError = validateValue(expected, parsed.data.value);
  if (valueError) {
    return NextResponse.json({ error: valueError }, { status: 400 });
  }

  await prisma.brief.update({
    where: { projectId: id },
    data: { rawAnswers: { ...state.answers, [expected.slot]: parsed.data.value } },
  });

  const nextState = await getInterviewState(id);
  return NextResponse.json({
    ...nextState!.result,
    answeredCount: Object.keys(nextState!.answers).length,
    limit: nextState!.limit,
  });
}
