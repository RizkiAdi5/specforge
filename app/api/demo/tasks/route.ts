import { NextResponse } from "next/server";
import { buildTaskBoard } from "@/lib/spec/task-board";

export async function GET() {
  const projectId = process.env.DEMO_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json({ error: "demo not configured" }, { status: 503 });
  }
  const board = await buildTaskBoard(projectId);
  return NextResponse.json(board);
}
