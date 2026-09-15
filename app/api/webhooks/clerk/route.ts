import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { provisionUserOrg } from "@/lib/auth/provision-org";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "missing CLERK_WEBHOOK_SECRET" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  try {
    // verify() only validates the signature (throws if invalid) — it does not return the payload.
    new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as WebhookEvent;

  if (event.type === "user.created") {
    const { id: clerkId, email_addresses } = event.data;
    const email = email_addresses[0]?.email_address;
    if (!email) {
      return NextResponse.json({ error: "no email on user" }, { status: 400 });
    }

    await provisionUserOrg(clerkId, email);
  }

  return NextResponse.json({ received: true });
}
