import { prisma } from "@/lib/db";

export interface SelectedKey {
  apiKey: string;
  usingByok: boolean;
}

// ponytail: BYOK selalu jatuh ke platform key sampai T-024 (envelope encryption) ada.
// ProviderKey.encryptedKey belum bisa didekripsi tanpa itu.
export async function selectKey(orgId: string): Promise<SelectedKey> {
  const byok = await prisma.providerKey.findUnique({
    where: { orgId_provider: { orgId, provider: "deepseek" } },
  });

  if (byok?.isValid) {
    throw new Error("BYOK belum didukung — implementasikan dekripsi di T-024");
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  return { apiKey, usingByok: false };
}
