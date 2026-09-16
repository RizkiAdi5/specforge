import { auth, currentUser } from "@clerk/nextjs/server";
import { UnauthorizedError } from "./current-org";

// ponytail: no admin role exists in the schema (this is internal tooling for the platform
// operator, not a customer-facing feature) — an email allowlist is the whole access model
// for now. Revisit with a real role if multiple operators ever need this.
export async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError("not signed in");

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();

  if (!email || !allowlist.includes(email)) {
    throw new UnauthorizedError("not an admin");
  }
}
