// Client Qwen (qua OpenRouter) - dung cho buoc loc/phan loai bao cao bang AI
// sau nay, khi tieu chi loc da duoc chot. Xem lib/ai/claude.ts de doi provider.
const DEFAULT_MAX_TOKENS = 4096;

// Tu dong thu lai khi gap loi mang/tam thoi - xem giai thich chi tiet o
// lib/ai/mistral-ocr.ts (cung 1 ly do, dung chung nguong/thoi gian cho).
const MAX_NETWORK_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

class NonRetryableError extends Error {}

export interface CallQwenOptions {
  maxTokens?: number;
}

export async function callQwen(prompt: string, systemPrompt?: string, options?: CallQwenOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Thieu OPENROUTER_API_KEY');
  }

  const messages = systemPrompt
    ? [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];

  const body = JSON.stringify({
    model: process.env.QWEN_MODEL || 'qwen/qwen-plus',
    max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0,
    messages,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NETWORK_RETRIES; attempt++) {
    try {
      const response = await fetch(`${process.env.QWEN_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'X-Title': 'Loc BCTC',
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data?.error?.message || `Qwen request failed (${response.status})`;
        if (!isRetryableStatus(response.status)) {
          throw new NonRetryableError(message);
        }
        throw new Error(message);
      }

      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Qwen returned empty content');
      }

      return text;
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
      if (attempt < MAX_NETWORK_RETRIES - 1) {
        console.warn(`Qwen loi mang/tam thoi (thu ${attempt + 1}/${MAX_NETWORK_RETRIES}), thu lai sau ${RETRY_DELAY_MS}ms:`, error);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}
