import { NextResponse } from "next/server";
import { getInterviewState } from "@/lib/interview/next-for-project";
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

  const state = await getInterviewState(id);
  if (!state || state.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...state.result,
    answeredCount: Object.keys(state.answers).length,
    limit: state.limit,
  });
}
