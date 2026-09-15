import "dotenv/config";
import { prisma } from "../lib/db";
import { provisionUserOrg } from "../lib/auth/provision-org";

async function main() {
  const clerkId = `test_${Date.now()}`;
  const email = `${clerkId}@example.com`;

  const user = await provisionUserOrg(clerkId, email);
  const org = user.memberships[0]?.org;

  console.assert(user.memberships.length === 1, "expected exactly one membership");
  console.assert(user.memberships[0]?.role === "OWNER", "expected OWNER role");
  console.assert(org?.plan === "FREE", "expected FREE plan");
  console.assert(org?.creditBalance === 10, `expected creditBalance=10, got ${org?.creditBalance}`);
  console.assert(org?.projectSlotMax === 1, `expected projectSlotMax=1, got ${org?.projectSlotMax}`);

  // idempotency: re-provisioning the same clerkId must not create a second org
  const again = await provisionUserOrg(clerkId, email);
  console.assert(again.memberships.length === 1, "re-provisioning must stay idempotent");

  await prisma.user.delete({ where: { clerkId } });
  console.log("OK: provisionUserOrg satisfies T-003 DoD");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
