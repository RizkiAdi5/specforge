import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { UnauthorizedError } from "@/lib/auth/current-org";
import { getUsageDashboard } from "@/lib/spec/admin-usage";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const dashboard = await getUsageDashboard();
  return NextResponse.json(dashboard);
}
