import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/envelope";

export interface SelectedKey {
  apiKey: string;
  usingByok: boolean;
}

export async function selectKey(orgId: string): Promise<SelectedKey> {
  const byok = await prisma.providerKey.findUnique({
    where: { orgId_provider: { orgId, provider: "deepseek" } },
  });

  if (byok?.isValid) {
    return { apiKey: decryptSecret(byok.encryptedKey), usingByok: true };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  return { apiKey, usingByok: false };
}
