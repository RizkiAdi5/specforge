import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export class UnauthorizedError extends Error {}

/** Resolves the current session's orgId from Clerk, never from client input. */
export async function requireOrgId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError("not signed in");

  const membership = await prisma.membership.findFirst({
    where: { user: { clerkId: userId } },
    select: { orgId: true },
  });
  if (!membership) throw new UnauthorizedError("no org for user");

  return membership.orgId;
}
