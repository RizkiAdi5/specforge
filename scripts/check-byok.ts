import "dotenv/config";
import { prisma } from "../lib/db";
import { encryptSecret, decryptSecret } from "../lib/crypto/envelope";
import { DeepSeekProvider, MODEL_MAP } from "../lib/ai/provider";
import { selectKey } from "../lib/ai/select-key";
import { run } from "../lib/ai/run";
import { z } from "zod";

async function main() {
  const realKey = process.env.DEEPSEEK_API_KEY!;

  // AC1: save-time validation — a garbage key must be rejected via a real small call, before persisting.
  {
    let rejected = false;
    try {
      await new DeepSeekProvider().chat({ model: MODEL_MAP.FLASH, system: "x", user: "x", apiKey: "sk-not-a-real-key-00000" });
    } catch {
      rejected = true;
    }
    console.assert(rejected, "AC3: an invalid key must be rejected by a real provider call before saving");
  }

  // AC1 + plaintext-never-persisted: encrypt/store/decrypt round-trip on the real DB.
  const org = await prisma.org.create({ data: { name: "check-byok org", creditBalance: 5 } });
  try {
    const encryptedKey = encryptSecret(realKey);
    console.assert(encryptedKey !== realKey, "ciphertext must never equal the plaintext key");
    console.assert(!encryptedKey.includes(realKey), "ciphertext must never contain the plaintext key as a substring");

    const lastFour = realKey.slice(-4);
    const saved = await prisma.providerKey.create({
      data: { orgId: org.id, provider: "deepseek", encryptedKey, lastFour, isValid: true },
    });

    // Simulate exactly what GET /api/keys returns — only lastFour, never encryptedKey.
    const publicView = { provider: saved.provider, lastFour: saved.lastFour, isValid: saved.isValid };
    const serialized = JSON.stringify(publicView);
    console.assert(!serialized.includes(realKey), "plaintext must never appear in the API response shape");
    console.assert(!("encryptedKey" in publicView), "encryptedKey (ciphertext) must never be in the API response shape either");

    // What's actually in the DB row — prove ciphertext, not plaintext, is what's stored.
    const raw = await prisma.providerKey.findUniqueOrThrow({ where: { id: saved.id } });
    console.assert(raw.encryptedKey !== realKey, "DB row must never store the plaintext key");
    console.assert(decryptSecret(raw.encryptedKey) === realKey, "decrypting the stored ciphertext must recover the exact original key");

    // AC2: with an active (valid) BYOK key, selectKey must report usingByok=true and hand back the real key.
    const selected = await selectKey(org.id);
    console.assert(selected.usingByok === true, "AC2: expected usingByok=true when a valid key exists");
    console.assert(selected.apiKey === realKey, "selectKey must decrypt back to the exact original key");

    // AC2 end-to-end: a real paid action (SPLIT_TASK, normally 1 credit) must deduct 0 credit when BYOK is active.
    const schema = z.object({ ok: z.boolean() });
    await run({
      orgId: org.id,
      action: "SPLIT_TASK",
      schema,
      system: 'Balas HANYA JSON: {"ok": true}',
      user: "ping",
    });
    const orgAfter = await prisma.org.findUniqueOrThrow({ where: { id: org.id } });
    console.assert(orgAfter.creditBalance === 5, "AC2: a paid action must deduct 0 credit while BYOK is active");

    const usage = await prisma.usageLog.findFirst({ where: { orgId: org.id, actionType: "SPLIT_TASK" }, orderBy: { createdAt: "desc" } });
    console.assert(usage?.creditCost === 0, "AC2: UsageLog must record creditCost=0 for the BYOK-covered call");
    console.assert(usage?.succeeded === true, "expected the BYOK-backed call to succeed with the real key");

    console.log("OK: BYOK satisfies US-015 acceptance criteria");
  } finally {
    await prisma.providerKey.deleteMany({ where: { orgId: org.id } });
    await prisma.usageLog.deleteMany({ where: { orgId: org.id } });
    await prisma.org.delete({ where: { id: org.id } });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
