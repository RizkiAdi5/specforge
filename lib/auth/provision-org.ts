import { prisma } from "@/lib/db";

/** Runs on Clerk's user.created event. New user -> one Org, OWNER, FREE plan. */
export function provisionUserOrg(clerkId: string, email: string) {
  return prisma.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      email,
      memberships: {
        create: {
          role: "OWNER",
          org: {
            create: {
              name: `${email}'s org`,
              plan: "FREE",
              creditBalance: 10,
              projectSlotMax: 1,
            },
          },
        },
      },
    },
    update: {},
    include: { memberships: { include: { org: true } } },
  });
}
