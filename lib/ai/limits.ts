import { prisma } from "@/lib/db";

export class RateLimitError extends Error {
  constructor(orgId: string) {
    super(`org ${orgId} melebihi batas 20 aksi berbayar per jam, coba lagi nanti`);
    this.name = "RateLimitError";
  }
}

export class CostCapError extends Error {
  constructor(orgId: string) {
    super(`org ${orgId} sudah mencapai batas biaya bulanan`);
    this.name = "CostCapError";
  }
}

const RATE_LIMIT_PER_HOUR = 20;

/** 20 aksi berbayar per jam per org (03-ai-pipeline.md pengaman biaya). BYOK dan aksi gratis
 * tidak dihitung — creditCost>0 pada UsageLog berarti benar-benar memotong credit platform. */
export async function assertRateLimit(orgId: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.usageLog.count({
    where: { orgId, createdAt: { gte: oneHourAgo }, creditCost: { gt: 0 } },
  });
  if (count >= RATE_LIMIT_PER_HOUR) {
    throw new RateLimitError(orgId);
  }
}

/** monthlyCostCapUsd per org. 0/unset berarti tidak ada cap. */
export async function assertCostCap(orgId: string): Promise<void> {
  const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
  const cap = org.monthlyCostCapUsd.toNumber();
  if (cap <= 0) return;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usage = await prisma.usageLog.aggregate({
    where: { orgId, createdAt: { gte: startOfMonth } },
    _sum: { costUsd: true },
  });
  const spent = usage._sum.costUsd?.toNumber() ?? 0;

  if (spent >= cap) {
    // ponytail: seharusnya juga "memicu notifikasi ke admin" (03-ai-pipeline.md), tapi belum
    // ada channel notifikasi (email/Slack) di codebase ini — baru menolak aksinya dulu.
    throw new CostCapError(orgId);
  }
}
