import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { provisionUserOrg } from "./provision-org";

export class UnauthorizedError extends Error {}

/** Resolves the current session's orgId from Clerk, never from client input.
 *
 * Provisioning normally happens via the user.created webhook, but that depends on an
 * external endpoint (ngrok in dev, a real domain in prod) actually being reachable at
 * signup time — if it isn't, the user is left signed in with no Org and every action 401s
 * with no way to recover. Falling back to lazy provisioning here means a valid Clerk
 * session always resolves to an Org, webhook or not.
 */
export async function requireOrgId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError("not signed in");

  const membership = await prisma.membership.findFirst({
    where: { user: { clerkId: userId } },
    select: { orgId: true },
  });
  if (membership) return membership.orgId;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) throw new UnauthorizedError("no org for user");

  const provisioned = await provisionUserOrg(userId, email);
  return provisioned.memberships[0].orgId;
}
