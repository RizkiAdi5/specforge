import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DeepSeekProvider, MODEL_MAP } from "@/lib/ai/provider";
import { encryptSecret } from "@/lib/crypto/envelope";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

const providerSchema = z.literal("deepseek");

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

  const keys = await prisma.providerKey.findMany({
    where: { orgId },
    select: { provider: true, lastFour: true, isValid: true, createdAt: true },
  });
  return NextResponse.json({ keys });
}

const postSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().min(10),
});

export async function POST(req: Request) {
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { provider, apiKey } = parsed.data;

  // "key divalidasi dengan satu call kecil" (US-015) — reject before it's ever persisted.
  try {
    await new DeepSeekProvider().chat({
      model: MODEL_MAP.FLASH,
      system: 'Balas HANYA JSON: {"ok": true}',
      user: "ping",
      apiKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "key ditolak provider", detail: message }, { status: 400 });
  }

  const encryptedKey = encryptSecret(apiKey);
  const lastFour = apiKey.slice(-4);

  const saved = await prisma.providerKey.upsert({
    where: { orgId_provider: { orgId, provider } },
    create: { orgId, provider, encryptedKey, lastFour, isValid: true },
    update: { encryptedKey, lastFour, isValid: true },
  });

  return NextResponse.json({ provider: saved.provider, lastFour: saved.lastFour, isValid: saved.isValid });
}

const deleteSchema = z.object({ provider: providerSchema });

export async function DELETE(req: Request) {
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const parsed = deleteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.providerKey.deleteMany({ where: { orgId, provider: parsed.data.provider } });
  return NextResponse.json({ deleted: true });
}
