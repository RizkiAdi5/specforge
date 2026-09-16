import type { OrgPlan } from "@/lib/generated/prisma/enums";

// Baseline credit an org starts a billing period with, per plan — used only to compute
// "sisa credit di bawah 20%" (US-014). Real checkout/upgrade (T-022) is deferred; PRO's
// number here is a placeholder agreed with the user, not wired to any payment flow yet.
export const PLAN_CREDIT_ALLOTMENT: Record<OrgPlan, number> = {
  FREE: 10,
  PRO: 200,
};

export const PLAN_PROJECT_SLOTS: Record<OrgPlan, number> = {
  FREE: 1,
  PRO: 10,
};
