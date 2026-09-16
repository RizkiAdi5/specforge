import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { getInterviewState } from "@/lib/interview/next-for-project";
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

  const state = await getInterviewState(id);
  if (!state || state.project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (state.project.status !== "INTERVIEWING") {
    return NextResponse.json({ error: `project is ${state.project.status}, not INTERVIEWING` }, { status: 409 });
  }
  if (!state.result.done) {
    return NextResponse.json({ error: "interview not finished yet" }, { status: 409 });
  }

  await inngest.send({ name: "project/brief-compile.requested", data: { projectId: id } });

  return NextResponse.json({ queued: true }, { status: 202 });
}
