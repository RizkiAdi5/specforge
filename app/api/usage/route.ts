import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLAN_CREDIT_ALLOTMENT, PLAN_PROJECT_SLOTS } from "@/lib/billing/plan-allotment";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

export async function GET() {
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
  const allotment = PLAN_CREDIT_ALLOTMENT[org.plan];
  const percentRemaining = allotment > 0 ? Math.round((org.creditBalance / allotment) * 100) : 0;

  const history = await prisma.usageLog.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    plan: org.plan,
    creditBalance: org.creditBalance,
    allotment,
    percentRemaining,
    lowCredit: percentRemaining < 20,
    projectSlotMax: org.projectSlotMax,
    planProjectSlots: PLAN_PROJECT_SLOTS[org.plan],
    history,
  });
}
