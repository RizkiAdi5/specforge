import type { ModelAlias } from "@/lib/generated/prisma/enums";

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatResult {
  content: string;
  usage: ChatUsage;
}

export interface AIProvider {
  chat(opts: { model: string; system: string; user: string; apiKey: string }): Promise<ChatResult>;
}

// verifikasi ke halaman pricing resmi DeepSeek sebelum mengunci pemetaan ini (03-ai-pipeline.md)
export const MODEL_MAP: Record<ModelAlias, string> = {
  FLASH: "deepseek-chat",
  FLASH_THINKING: "deepseek-reasoner",
};

// USD per 1M token, tebakan kasar — dikalibrasi dari UsageLog nanti (03-ai-pipeline.md)
const PRICE_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 0.28, output: 0.42 },
  "deepseek-reasoner": { input: 0.28, output: 0.42 },
};

export function estimateCostUsd(model: string, usage: ChatUsage): number {
  const price = PRICE_PER_1M_TOKENS[model] ?? PRICE_PER_1M_TOKENS["deepseek-chat"];
  return (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1_000_000;
}

export class DeepSeekProvider implements AIProvider {
  async chat({ model, system, user, apiKey }: { model: string; system: string; user: string; apiKey: string }): Promise<ChatResult> {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("DeepSeek response missing message content");
    }

    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
